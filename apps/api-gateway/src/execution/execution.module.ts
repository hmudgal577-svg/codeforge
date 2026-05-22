// ============================================
// Execution Module — Secure Code Execution
// ============================================
// Manages code execution requests, queues jobs via BullMQ,
// and returns results through WebSocket streaming.

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';

@Module({
  imports: [ConfigModule],
  controllers: [ExecutionController],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
