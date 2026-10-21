# API + worker + migrate image. Build context: repo root.
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @dialed/api... && pnpm --filter @dialed/api run build \
 && pnpm --filter @dialed/api deploy --prod --legacy /out && cp -r apps/api/dist /out/dist && cp -r backend /out/backend

FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
ENV NODE_ENV=production MIGRATIONS_DIR=/app/backend/migrations
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
