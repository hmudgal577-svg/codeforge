// ============================================
// Workspace Service — Business Logic
// ============================================

import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Create workspace and add owner as member
  async create(userId: string, dto: CreateWorkspaceDto) {
    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name,
        description: dto.description,
        language: dto.language || 'javascript',
        isPublic: dto.isPublic || false,
        ownerId: userId,
        members: {
          create: { userId, role: 'OWNER' },
        },
        // Create root folder
        folders: {
          create: { name: 'root', path: '/' },
        },
        // Create default entry file
        files: {
          create: {
            name: dto.language === 'python' ? 'main.py'
              : dto.language === 'java' ? 'Main.java'
              : dto.language === 'cpp' ? 'main.cpp'
              : 'index.js',
            path: dto.language === 'python' ? '/main.py'
              : dto.language === 'java' ? '/Main.java'
              : dto.language === 'cpp' ? '/main.cpp'
              : '/index.js',
            content: this.getBoilerplate(dto.language || 'javascript'),
            language: dto.language || 'javascript',
          },
        },
      },
      include: {
        members: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
        files: true,
        folders: true,
      },
    });

    this.logger.log(`Workspace created: ${workspace.name} by user ${userId}`);
    return workspace;
  }

  // List user's workspaces
  async findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        owner: { select: { id: true, username: true, avatarUrl: true } },
        members: { select: { userId: true, role: true } },
        _count: { select: { files: true, members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // Get single workspace with all data
  async findOne(workspaceId: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: { select: { id: true, username: true, avatarUrl: true } },
        members: {
          include: { user: { select: { id: true, username: true, avatarUrl: true } } },
        },
        files: { orderBy: { path: 'asc' } },
        folders: { orderBy: { path: 'asc' } },
      },
    });

    if (!workspace) throw new NotFoundException('Workspace not found');

    // Check access
    const isMember = workspace.members.some((m) => m.userId === userId);
    if (!workspace.isPublic && !isMember) {
      throw new ForbiddenException('Access denied');
    }

    return workspace;
  }

  // Update file content
  async updateFile(workspaceId: string, fileId: string, content: string, userId: string) {
    await this.checkMemberAccess(workspaceId, userId, ['OWNER', 'EDITOR']);

    return this.prisma.file.update({
      where: { id: fileId, workspaceId },
      data: { content, updatedAt: new Date() },
    });
  }

  // Create file
  async createFile(workspaceId: string, name: string, path: string, userId: string, folderId?: string) {
    await this.checkMemberAccess(workspaceId, userId, ['OWNER', 'EDITOR']);

    const lang = this.detectLanguage(name);
    return this.prisma.file.create({
      data: { name, path, content: '', language: lang, workspaceId, folderId },
    });
  }

  // Delete file
  async deleteFile(workspaceId: string, fileId: string, userId: string) {
    await this.checkMemberAccess(workspaceId, userId, ['OWNER', 'EDITOR']);
    return this.prisma.file.delete({ where: { id: fileId, workspaceId } });
  }

  // Add member to workspace
  async addMember(workspaceId: string, targetUserId: string, role: string, requesterId: string) {
    await this.checkMemberAccess(workspaceId, requesterId, ['OWNER']);

    return this.prisma.workspaceMember.create({
      data: {
        userId: targetUserId,
        workspaceId,
        role: role as any,
      },
    });
  }

  // Check member access
  private async checkMemberAccess(workspaceId: string, userId: string, allowedRoles: string[]) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });

    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return member;
  }

  // Language boilerplate
  private getBoilerplate(language: string): string {
    const templates: Record<string, string> = {
      javascript: '// Welcome to CodeForge!\nconsole.log("Hello, World!");\n',
      python: '# Welcome to CodeForge!\nprint("Hello, World!")\n',
      cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}\n',
      java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
    };
    return templates[language] || templates.javascript;
  }

  private detectLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      js: 'javascript', ts: 'typescript', py: 'python',
      cpp: 'cpp', cc: 'cpp', java: 'java', rs: 'rust',
      go: 'go', rb: 'ruby', html: 'html', css: 'css',
      json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml',
    };
    return map[ext || ''] || 'plaintext';
  }

  // Delete workspace (owner only)
  async deleteWorkspace(workspaceId: string, userId: string) {
    await this.checkMemberAccess(workspaceId, userId, ['OWNER']);
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
    this.logger.log(`Workspace deleted: ${workspaceId} by user ${userId}`);
  }

  // Update workspace name/description
  async updateWorkspace(workspaceId: string, userId: string, data: { name?: string; description?: string }) {
    await this.checkMemberAccess(workspaceId, userId, ['OWNER']);
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });
  }

  // Rename file
  async renameFile(workspaceId: string, fileId: string, newName: string, userId: string) {
    await this.checkMemberAccess(workspaceId, userId, ['OWNER', 'EDITOR']);
    const file = await this.prisma.file.findUnique({ where: { id: fileId, workspaceId } });
    if (!file) throw new NotFoundException('File not found');

    const newPath = file.path.replace(file.name, newName);
    const newLang = this.detectLanguage(newName);

    return this.prisma.file.update({
      where: { id: fileId },
      data: { name: newName, path: newPath, language: newLang },
    });
  }

  // List members
  async listMembers(workspaceId: string, userId: string) {
    await this.checkMemberAccess(workspaceId, userId, ['OWNER', 'EDITOR', 'VIEWER']);
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, username: true, email: true, avatarUrl: true } } },
    });
  }

  // Remove member
  async removeMember(workspaceId: string, memberId: string, requesterId: string) {
    await this.checkMemberAccess(workspaceId, requesterId, ['OWNER']);
    const member = await this.prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role === 'OWNER') throw new ForbiddenException('Cannot remove workspace owner');
    return this.prisma.workspaceMember.delete({ where: { id: memberId } });
  }

  // Search users by username/email for invite
  async searchUsers(query: string, excludeWorkspaceId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, email: true, avatarUrl: true },
      take: 10,
    });

    if (excludeWorkspaceId) {
      const members = await this.prisma.workspaceMember.findMany({
        where: { workspaceId: excludeWorkspaceId },
        select: { userId: true },
      });
      const memberIds = new Set(members.map((m) => m.userId));
      return users.filter((u) => !memberIds.has(u.id));
    }

    return users;
  }
}
