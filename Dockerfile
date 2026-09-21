# ---- 1. build the React client ---------------------------------------------
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- 2. production dependencies of the API ----------------------------------
FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---- 3. runtime image --------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/healthz || exit 1
CMD ["node", "server/src/index.js"]
