# CampusConnect 🟣 — Where your campus talks.

Fresh rebrand of college-talks with better security, modern stack, clean UX.

## Stack
- Backend: Express 4 + Mongoose + Socket.io + JWT + Helmet + Rate-limit
- Frontend: React 18 + Vite + Tailwind + React Router + Socket.io-client

## Run locally
1. Backend:
```
cd backend
cp .env.example .env   # fill MONGO_URI + JWT_SECRET
npm install
npm run dev
```
2. Frontend (new terminal):
```
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 (API proxied to :5000).

## Make first admin
```
cd backend
npm run make-admin -- yourUsername
```

## Env vars (backend/.env — never commit this file)
PORT, NODE_ENV, MONGO_URI, JWT_SECRET, CLIENT_URL, MAX_FILE_MB (see `backend/.env.example`).
Frontend split-deploy only: `frontend/.env` with `VITE_SERVER_URL` (see `frontend/.env.example`).

## Deploy — Option A: Render, single service (recommended, free)
1. Push this folder to GitHub (`.env` stays local — it's gitignored).
2. Render → New → Blueprint → point at the repo (`render.yaml` builds the Docker image: frontend + API in one container).
3. In Render dashboard set `MONGO_URI` (Atlas string). `JWT_SECRET` auto-generates.
4. Deploy → open the URL → `GET /api/health` should show `{"ok":true,"db":"up"}`.
5. Seed demo posts: Render Shell → `npm run seed --prefix backend`. Make yourself admin: `npm run make-admin --prefix backend -- yourUsername`.

## Deploy — Option B: split (Vercel frontend + Render/Railway API)
1. Deploy `backend/` as a Node service (`npm ci && npm start`), set all backend env vars incl. `CLIENT_URL=https://<your-frontend>`.
2. Deploy `frontend/` on Vercel with env `VITE_SERVER_URL=https://<your-api>`.
3. Socket.io + downloads follow `VITE_SERVER_URL` automatically.

## Deploy notes
- Health check: `GET /api/health` (Render uses it; `db:"down"` means Mongo unreachable).
- Uploads live on local disk (`backend/uploads/`) — fine to start, but free-tier disks are **ephemeral** (files vanish on redeploy). Move to Cloudinary/S3 when you outgrow it.
- Logs: `SIGTERM`/`SIGINT` shut down gracefully; Multer/file errors return clean `400`s.

## Features
Auth, Discussions (search/sort/like/comment), Live chat (48h TTL, abuse-blocked), DMs, PYQ bank (filter/download counter), Profiles, Notifications (socket), Admin (ban, delete, stats).

## Overload guards
- Socket: max 30 connections/min per IP, max 5 chat/DM sends per 10s per user (`backend/utils/rateLimit.js`)
- All list endpoints paginated (`?page&limit`, capped) with `X-Total-Count` header + `.lean()` reads
- Indexes on `Conversation.participants`, `DirectMessage(conversationId, createdAt)`, `Notification(recipient, createdAt)`
- Single shared Socket.io client (no duplicate connections in StrictMode)
