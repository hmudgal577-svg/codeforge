import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get system metrics (admin only)' })
  async getMetrics() {
    const metrics = await this.adminService.getSystemMetrics();
    return { success: true, data: metrics };
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get recent audit logs' })
  async getAuditLogs() {
    const logs = await this.adminService.getRecentAuditLogs();
    return { success: true, data: logs };
  }

  @Get('execution-stats')
  @ApiOperation({ summary: 'Get execution statistics' })
  async getExecutionStats() {
    const stats = await this.adminService.getExecutionStats();
    return { success: true, data: stats };
  }

  @Get('user-growth')
  @ApiOperation({ summary: 'Get user growth data' })
  async getUserGrowth() {
    const growth = await this.adminService.getUserGrowth();
    return { success: true, data: growth };
  }

  @Get('infrastructure')
  @ApiOperation({ summary: 'Full infrastructure dashboard (admin only)' })
  async getInfrastructureDashboard() {
    const dashboard = await this.adminService.getInfrastructureDashboard();
    return { success: true, data: dashboard };
  }

  @Get('audit-timeline')
  @ApiOperation({ summary: 'Event audit timeline' })
  async getAuditTimeline() {
    const timeline = await this.adminService.getAuditTimeline();
    return { success: true, data: timeline };
  }
}
