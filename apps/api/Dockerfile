FROM node:22-alpine AS builder

ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace @crm/api --include-workspace-root

COPY . .
RUN npm run prisma:generate -w @crm/api
RUN npm run build -w @crm/api

FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false

WORKDIR /app/apps/api

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package-lock.json /app/
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/main.js"]
