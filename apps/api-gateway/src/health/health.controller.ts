import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../infrastructure/metrics.service';
import { RecoveryService } from '../infrastructure/recovery.service';
import { EventBus } from '../infrastructure/event-bus.service';
import { Response } from 'express';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly recovery: RecoveryService,
    private readonly eventBus: EventBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    const infraHealth = this.recovery.getSystemHealth();

    return {
      status: infraHealth.overall === 'critical' ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      infrastructure: infraHealth,
      events: this.eventBus.getEventCount(),
      memory: process.memoryUsage(),
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics' })
  async getMetrics(@Res() res: Response) {
    const metrics = await this.metrics.getMetrics();
    res.set('Content-Type', this.metrics.getContentType());
    res.end(metrics);
  }

  @Get('infrastructure')
  @ApiOperation({ summary: 'Infrastructure health details' })
  async getInfrastructure() {
    return {
      health: this.recovery.getSystemHealth(),
      services: this.recovery.getHealthStatus(),
      recoveryLog: this.recovery.getRecoveryLog().slice(-20),
    };
  }
}

