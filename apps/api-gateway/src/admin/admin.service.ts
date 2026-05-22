// ============================================
// Admin Service — Analytics & Monitoring
// ============================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBus } from '../infrastructure/event-bus.service';
import { RecoveryService } from '../infrastructure/recovery.service';
import { MetricsService } from '../infrastructure/metrics.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
    private readonly recovery: RecoveryService,
    private readonly metrics: MetricsService,
  ) {}

  async getSystemMetrics() {
    const [
      totalUsers, totalWorkspaces, recentExecutions,
      pendingJobs, failedJobs, aiRequests,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.workspace.count(),
      this.prisma.executionJob.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      this.prisma.executionJob.count({ where: { status: 'PENDING' } }),
      this.prisma.executionJob.count({ where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      this.prisma.aiRequest.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);

    return {
      totalUsers,
      totalWorkspaces,
      recentExecutions,
      pendingJobs,
      failedJobs,
      aiRequests,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };
  }

  async getRecentAuditLogs(limit = 50) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, username: true, email: true } } },
    });
  }

  async getExecutionStats() {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const jobs = await this.prisma.executionJob.groupBy({
      by: ['status'],
      where: { createdAt: { gte: last24h } },
      _count: true,
    });

    const byLanguage = await this.prisma.executionJob.groupBy({
      by: ['language'],
      where: { createdAt: { gte: last24h } },
      _count: true,
    });

    return { byStatus: jobs, byLanguage };
  }

  async getUserGrowth() {
    // Get user signups over last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const growth: Record<string, number> = {};
    users.forEach((u) => {
      const day = u.createdAt.toISOString().split('T')[0];
      growth[day] = (growth[day] || 0) + 1;
    });

    return growth;
  }

  async getInfrastructureDashboard() {
    const [systemMetrics, executionStats, auditTimeline] = await Promise.all([
      this.getSystemMetrics(),
      this.getExecutionStats(),
      this.eventBus.getAuditTimeline('0', 50),
    ]);

    return {
      system: systemMetrics,
      execution: executionStats,
      infrastructure: {
        health: this.recovery.getSystemHealth(),
        services: this.recovery.getHealthStatus(),
        recoveryLog: this.recovery.getRecoveryLog().slice(-10),
      },
      events: {
        total: this.eventBus.getEventCount(),
        recentAudit: auditTimeline.slice(-20),
      },
    };
  }

  async getAuditTimeline(since = '0', count = 100) {
    return this.eventBus.getAuditTimeline(since, count);
  }
}

