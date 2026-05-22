// ============================================
// Root Application Module
// ============================================
// Assembles all feature modules, configures global
// providers, throttling, and database connection.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { ExecutionModule } from './execution/execution.module';
import { AiModule } from './ai/ai.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { NotificationModule } from './notification/notification.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

@Module({
  imports: [
    // ── Configuration ───────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    // ── Rate Limiting ───────────────────────────
    // 100 requests per 60 seconds per IP
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    // ── Database ────────────────────────────────
    PrismaModule,

    // ── Feature Modules ─────────────────────────
    AuthModule,
    WorkspaceModule,
    ExecutionModule,
    AiModule,
    CollaborationModule,
    AdminModule,
    HealthModule,
    NotificationModule,

    // ── Production Infrastructure ────────────────
    InfrastructureModule,
  ],
  providers: [
    // Apply rate limiting globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
