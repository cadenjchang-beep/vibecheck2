# Production image: one Node process serving the API, the web app and the
# server-rendered public pages. The same image runs as a preview or in
# production; APP_ENV chooses (see docs/DEPLOYMENT.md).
#
#   docker build --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t tessera .

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-slim
ARG APP_VERSION=dev
ENV NODE_ENV=production PORT=8787 APP_VERSION=$APP_VERSION
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
# Local uploads and the file email outbox live here; mount a volume on it.
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/main.js"]
