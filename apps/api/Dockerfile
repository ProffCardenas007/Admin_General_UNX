FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
CMD ["sh", "-c", "node scripts/upsert-manager.js && node scripts/migrate-created-by-ownership.js && node scripts/migrate-task-parent-links.js && node scripts/migrate-task-chains.js && node dist/main.js"]
