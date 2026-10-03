// Usage: npm run make-admin -- <username>
require('dotenv').config();
const dns = require('dns');
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map((s) => s.trim()));
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  const username = process.argv[2];
  if (!username) { console.error('Usage: npm run make-admin -- <username>'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOneAndUpdate({ username }, { isAdmin: true }, { new: true }).select('username isAdmin');
  if (!user) { console.error('User not found'); process.exit(1); }
  console.log(`✅ ${user.username} is now admin`);
  process.exit(0);
})();
