require('dotenv').config();
// Atlas uses DNS SRV records — some Windows/ISP resolvers refuse them, so
// default Node to public DNS (override with DNS_SERVERS="1.1.1.1,8.8.8.8").
const dns = require('dns');
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map((s) => s.trim()));
const express = require('express');
// Patches Express 4 to forward async route errors to the error handler.
// Without this, one rejected promise (e.g. a malformed ObjectId in a URL)
// becomes an unhandled rejection and kills the whole process.
require('express-async-errors');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

if (!process.env.JWT_SECRET || !process.env.MONGO_URI) {
  console.error('❌ Missing JWT_SECRET or MONGO_URI. Copy .env.example to .env.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(','), methods: ['GET', 'POST'] } });

// Behind Render/Railway/Heroku proxies — required for correct IPs in rate limiting
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());
app.use(require('compression')());
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',') }));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));

// Global API limiter (DDoS/accidental-loop protection)
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 600 }));
// Stricter limiter on auth (brute-force protection)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many attempts — try again in 15 minutes.' } });

// Retry loop: survives transient DNS hiccups at boot (common on Windows/ISP
// resolvers for Atlas SRV records). Exits non-zero after 5 tries so Docker/
// Render can restart the container for real outages.
async function connectDB(retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGO_URI, { family: 4 });
      console.log('✅ MongoDB connected');
      return;
    } catch (e) {
      console.error(`❌ Mongo connection attempt ${attempt}/${retries}: ${e.message}`);
      if (attempt === retries) { process.exit(1); }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
connectDB();

require('./models/User');
require('./models/Discussion');
require('./models/Chat');
require('./models/PYQ');
require('./models/Teacher');
require('./models/Exam');
const User = require('./models/User');
const { containsAbuse } = require('./utils/profanity');
const { createBucket } = require('./utils/rateLimit');
const { ChatMessage, Conversation, DirectMessage, Notification } = require('./models/Chat');

// Overload guards: HTTP limiter above doesn't cover Socket.io, so:
// - max 30 socket connections/min per IP (reconnect storms)
// - max 5 chat/DM sends per 10s per user (spam floods)
const connBucket = createBucket({ max: 30, windowMs: 60 * 1000 });
const msgBucket = createBucket({ max: 5, windowMs: 10 * 1000 });

app.get('/api/health', (req, res) => res.json({
  ok: true,
  brand: 'CampusConnect',
  db: mongoose.connection.readyState === 1 ? 'up' : 'down',
  uptime: Math.round(process.uptime())
}));
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/discussions', require('./routes/discussions')(io));
app.use('/api/pyq', require('./routes/pyq'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/dms', require('./routes/dms'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/exams', require('./routes/exams'));

// Unknown /api route → JSON (not the SPA fallback below)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Single-service deploy: serve the built frontend (../frontend/dist) if present.
// Split deploy (Vercel frontend + this API) also works — same-origin /api is
// used automatically when no VITE_SERVER_URL is set.
const webDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist, { maxAge: '1h' }));
  app.get(/^\/(?!api|uploads|socket\.io).*/, (req, res) =>
    res.sendFile(path.join(webDist, 'index.html')));
}

// Global error handler — Multer/file errors become clean 400s, never stack traces
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && (err.name === 'MulterError' || /Only (PDF|JPG|PNG|image)/.test(err.message || ''))) {
    return res.status(400).json({ error: err.message || 'File upload failed.' });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID in request URL.' });
  }
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Invalid data sent to server.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

// Socket auth via JWT
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (token) socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { next(); }
});

io.on('connection', async (socket) => {
  const ip = socket.handshake.address || 'unknown';
  if (!connBucket.take(ip)) {
    socket.emit('chat message blocked', { reason: 'Too many connections — please wait a moment and refresh.' });
    socket.disconnect(true);
    return;
  }
  // Personal room ONLY from the verified JWT — never from client claims.
  // (Trusting a client-sent username here would let anyone eavesdrop on
  // someone else's DMs and notifications.)
  const username = socket.data.user?.username;
  if (username) { socket.join(`user:${username}`); socket.data.username = username; }

  // NOTE: handlers are registered BEFORE the history fetch below. History
  // needs a DB round-trip (slow on cold Atlas); anything sent in that window
  // would otherwise vanish silently.
  socket.on('chat message', async (data) => {
    // Sender identity comes ONLY from the verified JWT — never from the
    // client payload (otherwise anyone could impersonate anyone).
    const name = socket.data.username;
    if (!name) { socket.emit('chat message blocked', { reason: 'Login to chat.' }); return; }
    if (!data.message) return;
    if (!msgBucket.take(`chat:${name}`)) { socket.emit('chat message blocked', { reason: 'Slow down — you are sending messages too fast.' }); return; }
    if ((await User.findOne({ username: name }).select('isBanned'))?.isBanned) {
      socket.emit('chat message blocked', { reason: 'Your account has been suspended.' });
      socket.disconnect(true);
      return;
    }
    if (containsAbuse(data.message)) { socket.emit('chat message blocked', { reason: 'Please keep it respectful.' }); return; }
    const payload = { username: name, message: String(data.message).slice(0, 1000), createdAt: new Date() };
    io.emit('chat message', payload);
    try { await ChatMessage.create(payload); } catch (e) { console.error(e); }
  });

  socket.on('dm message', async ({ conversationId, toUsername, text }) => {
    const from = socket.data.username;
    if (!from || !text || !conversationId) return;
    if (!msgBucket.take(`dm:${from}`)) { socket.emit('chat message blocked', { reason: 'Slow down — you are sending messages too fast.' }); return; }
    if ((await User.findOne({ username: from }).select('isBanned'))?.isBanned) {
      socket.emit('chat message blocked', { reason: 'Your account has been suspended.' });
      socket.disconnect(true);
      return;
    }
    if (containsAbuse(text)) { socket.emit('chat message blocked', { reason: 'Please keep it respectful.' }); return; }
    try {
      const convo = await Conversation.findById(conversationId);
      if (!convo) return;
      const dm = await DirectMessage.create({ conversationId, sender: from, text: String(text).slice(0, 2000) });
      await Conversation.findByIdAndUpdate(conversationId, { lastMessage: text, lastMessageAt: new Date() });
      const payload = { conversationId, _id: dm._id, sender: from, text, createdAt: dm.createdAt };
      io.to(`user:${toUsername}`).to(`user:${from}`).emit('dm message', payload);
      if (toUsername !== from) {
        const n = await Notification.create({ recipient: toUsername, type: 'dm', fromUser: from, refId: conversationId.toString(), text: `${from} sent you a message` });
        io.to(`user:${toUsername}`).emit('notification', n);
      }
    } catch (e) { console.error('DM error', e); }
  });

  // History loads last on purpose (see note above) — fire and forget.
  ChatMessage.find().sort({ createdAt: -1 }).limit(50).lean()
    .then((history) => socket.emit('chat history', history.reverse()))
    .catch((e) => console.error(e));
});

// Crash diagnostics — log and exit non-zero (container/supervisor restarts us)
process.on('uncaughtException', (err) => { console.error('💥 uncaughtException:', err); process.exit(1); });
process.on('unhandledRejection', (reason) => { console.error('💥 unhandledRejection:', reason); process.exit(1); });

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 CampusConnect API on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`));

// Graceful shutdown — lets Render/Docker stop the container without dropping writes
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down…`);
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log('MongoDB disconnected. Bye!');
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
