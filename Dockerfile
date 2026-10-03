# ---- Stage 1: build the frontend ----
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: production API + static frontend ----
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
# Single-service deploy: API serves these static files (see server.js)
COPY --from=web /web/dist /frontend/dist
RUN mkdir -p uploads uploads/pyq uploads/avatars && chown -R node:node /app /frontend
USER node
EXPOSE 5000
CMD ["node", "server.js"]
