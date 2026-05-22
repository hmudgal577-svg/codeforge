// ============================================
// Notification Service — Business Logic
// ============================================
// Handles fetching, creating, and managing user
// notifications. Used by other services to push
// system events to users.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // List notifications for a user
  async listForUser(userId: string, limit = 30, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Get unread count
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  // Mark single notification as read
  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  // Mark all notifications as read
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return { updated: result.count };
  }

  // Delete a notification
  async delete(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  // ── Helper: Create notification (used by other services) ──

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, message, metadata },
    });

    this.logger.log(`Notification created for user ${userId}: ${title}`);
    return notification;
  }

  // Notify workspace invite
  async notifyWorkspaceInvite(userId: string, workspaceName: string, inviterName: string) {
    return this.create(
      userId,
      'WORKSPACE_INVITE',
      'Workspace Invitation',
      `${inviterName} invited you to join "${workspaceName}"`,
    );
  }

  // Notify execution complete
  async notifyExecutionComplete(userId: string, language: string, status: string) {
    return this.create(
      userId,
      'EXECUTION_COMPLETE',
      'Execution Complete',
      `Your ${language} code execution ${status === 'COMPLETED' ? 'succeeded' : 'failed'}.`,
    );
  }

  // Notify AI analysis complete
  async notifyAiComplete(userId: string, type: string) {
    return this.create(
      userId,
      'AI_COMPLETE',
      'AI Analysis Ready',
      `Your ${type.toLowerCase()} analysis is complete.`,
    );
  }
}
