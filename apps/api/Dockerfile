FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm install
RUN npm run build -w @cieav/contracts && npm run build -w @cieav/core && npm run build -w @cieav/api
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
# Canonical CIEAV implementations.
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
# Legacy package names remain private one-way shims during the migration window.
COPY --from=build /app/packages/cieav-contracts ./packages/cieav-contracts
COPY --from=build /app/packages/cieav-core ./packages/cieav-core
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
CMD ["node", "apps/api/dist/server.js"]
