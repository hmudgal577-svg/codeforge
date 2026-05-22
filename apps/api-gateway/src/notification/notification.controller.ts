// ============================================
// Notification Controller — REST Endpoints
// ============================================

import {
  Controller, Get, Patch, Delete, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  async list(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const notifications = await this.notificationService.listForUser(
      userId,
      limit ? parseInt(limit) : 30,
      unreadOnly === 'true',
    );
    return { success: true, data: notifications };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async unreadCount(@CurrentUser('id') userId: string) {
    const count = await this.notificationService.getUnreadCount(userId);
    return { success: true, data: { count } };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const notification = await this.notificationService.markAsRead(id, userId);
    return { success: true, data: notification };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    const result = await this.notificationService.markAllAsRead(userId);
    return { success: true, data: result };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.notificationService.delete(id, userId);
    return { success: true, message: 'Notification deleted' };
  }
}
