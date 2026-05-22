# Production Dockerfile — Next.js Frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
RUN npm ci --workspace=@codeforge/web
COPY apps/web ./apps/web
RUN cd apps/web && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN adduser -D -u 1001 appuser
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public
USER appuser
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server.js"]
