// ============================================
// Prisma Service — Database Connection Manager
// ============================================
// Handles connection lifecycle and provides the
// Prisma client to all modules via DI.

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('✅ Database connected');
    } catch (error) {
      this.logger.warn('⚠️ Database connection failed — running in offline mode');
      this.logger.warn('   Start PostgreSQL: docker compose up -d postgres');
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.$disconnect();
      this.logger.log('Database disconnected');
    }
  }

  isConnected() {
    return this.connected;
  }
}
