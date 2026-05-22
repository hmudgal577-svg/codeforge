# Production Dockerfile — API Gateway
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/api-gateway/package*.json ./apps/api-gateway/
COPY packages/shared-types/package*.json ./packages/shared-types/
RUN npm ci --workspace=@codeforge/api-gateway
COPY apps/api-gateway ./apps/api-gateway
COPY packages/shared-types ./packages/shared-types
RUN cd apps/api-gateway && npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN adduser -D -u 1001 appuser
COPY --from=builder /app/apps/api-gateway/dist ./dist
COPY --from=builder /app/apps/api-gateway/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
USER appuser
EXPOSE 4000
CMD ["node", "dist/main.js"]
