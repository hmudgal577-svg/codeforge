# CLAUDE.md — Developer Guidelines

Welcome to the CodeForge monorepo. This file documents the commands and coding standards for this project.

## Core Commands

### Development & Build
* **Start Dev Server (All apps & workers)**: `npm run dev`
* **Build Project**: `npm run build`
* **Clean Build Caches & Node Modules**: `npm run clean`

### Database (Prisma)
* **Generate Client**: `npm run db:generate`
* **Run Migrations (Dev)**: `npm run db:migrate`
* **Push Schema Directly**: `npm run db:push`
* **Seed Database**: `npm run db:seed`

### Docker & Infrastructure
* **Start Dev Infra (Postgres, Redis, RabbitMQ)**: `npm run docker:dev`
* **Stop Dev Infra**: `npm run docker:down`
* **Start Production Containers**: `npm run docker:prod`

### Test & Lint
* **Run Tests (Vitest / Jest via Turbo)**: `npm run test`
* **Lint Codebase**: `npm run lint`

---

## Coding Guidelines

### Architecture Rules
1. **Monorepo Separation**: 
   - Gateway/REST APIs belong in `apps/api-gateway`.
   - Web interface UI belongs in `apps/web`.
   - Microservices and worker processes belong in `services/`.
   - Reusable utilities/logic belong in `packages/`.
2. **Shared Types**: Use `@codeforge/shared-types` for any interfaces shared between frontend, backend, or workers.
3. **Event-Driven Pub/Sub**: Communicate between independent microservices using the `@codeforge/event-bus` (Redis Streams) or RabbitMQ queues.

### Code Style
* **Language**: TypeScript (strict type checking enabled).
* **Formatting**: Prettier + ESLint configuration rules from `@codeforge/config`.
* **Async/Await**: Always use async/await over raw Promises.
* **Error Handling**: Use explicit try-catch blocks in async actions, logging errors through `@codeforge/observability`.
