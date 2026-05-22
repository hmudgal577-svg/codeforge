// ============================================
// Infrastructure Module — Production Services
// ============================================
// Integrates event bus, security intelligence,
// observability metrics, and auto-recovery into
// the NestJS application lifecycle.

import { Module, Global, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus, EventStreams, EventTypes } from './event-bus.service';
import { SecurityIntelligence } from './security.service';
import { MetricsService } from './metrics.service';
import { RecoveryService } from './recovery.service';

@Global()
@Module({
  providers: [EventBus, SecurityIntelligence, MetricsService, RecoveryService],
  exports: [EventBus, SecurityIntelligence, MetricsService, RecoveryService],
})
export class InfrastructureModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Infrastructure');

  constructor(
    private readonly eventBus: EventBus,
    private readonly recovery: RecoveryService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit() {
    this.logger.log('🏗️  Infrastructure services initializing...');

    // Start recovery monitoring
    this.recovery.startMonitoring();

    // Log system boot event
    await this.eventBus.publish({
      stream: EventStreams.SYSTEM,
      type: EventTypes.SYS_HEALTH_CHECK,
      payload: { event: 'system_boot', timestamp: Date.now() },
    });

    this.logger.log('✅ Infrastructure ready (EventBus + Security + Metrics + Recovery)');
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down infrastructure...');
    await this.eventBus.shutdown();
    await this.recovery.shutdown();
  }
}
