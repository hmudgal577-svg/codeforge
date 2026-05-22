import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateWorkspaceDto) {
    const workspace = await this.workspaceService.create(userId, dto);
    return { success: true, data: workspace };
  }

  @Get()
  @ApiOperation({ summary: 'List all workspaces for current user' })
  async findAll(@CurrentUser('id') userId: string) {
    const workspaces = await this.workspaceService.findAllForUser(userId);
    return { success: true, data: workspaces };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace by ID' })
  async findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const workspace = await this.workspaceService.findOne(id, userId);
    return { success: true, data: workspace };
  }

  @Put(':id/files/:fileId')
  @ApiOperation({ summary: 'Update file content' })
  async updateFile(
    @Param('id') workspaceId: string,
    @Param('fileId') fileId: string,
    @Body('content') content: string,
    @CurrentUser('id') userId: string,
  ) {
    const file = await this.workspaceService.updateFile(workspaceId, fileId, content, userId);
    return { success: true, data: file };
  }

  @Post(':id/files')
  @ApiOperation({ summary: 'Create a new file in workspace' })
  async createFile(
    @Param('id') workspaceId: string,
    @Body('name') name: string,
    @Body('path') path: string,
    @CurrentUser('id') userId: string,
  ) {
    const file = await this.workspaceService.createFile(workspaceId, name, path, userId);
    return { success: true, data: file };
  }

  @Delete(':id/files/:fileId')
  @ApiOperation({ summary: 'Delete a file' })
  async deleteFile(
    @Param('id') workspaceId: string,
    @Param('fileId') fileId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.workspaceService.deleteFile(workspaceId, fileId, userId);
    return { success: true, message: 'File deleted' };
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add member to workspace' })
  async addMember(
    @Param('id') workspaceId: string,
    @Body('userId') targetUserId: string,
    @Body('role') role: string,
    @CurrentUser('id') requesterId: string,
  ) {
    const member = await this.workspaceService.addMember(workspaceId, targetUserId, role, requesterId);
    return { success: true, data: member };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workspace' })
  async deleteWorkspace(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.workspaceService.deleteWorkspace(id, userId);
    return { success: true, message: 'Workspace deleted' };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update workspace name/description' })
  async updateWorkspace(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { name?: string; description?: string },
  ) {
    const workspace = await this.workspaceService.updateWorkspace(id, userId, body);
    return { success: true, data: workspace };
  }

  @Put(':id/files/:fileId/rename')
  @ApiOperation({ summary: 'Rename a file' })
  async renameFile(
    @Param('id') workspaceId: string,
    @Param('fileId') fileId: string,
    @Body('name') name: string,
    @CurrentUser('id') userId: string,
  ) {
    const file = await this.workspaceService.renameFile(workspaceId, fileId, name, userId);
    return { success: true, data: file };
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List workspace members' })
  async listMembers(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const members = await this.workspaceService.listMembers(id, userId);
    return { success: true, data: members };
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove workspace member' })
  async removeMember(
    @Param('id') workspaceId: string,
    @Param('memberId') memberId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.workspaceService.removeMember(workspaceId, memberId, userId);
    return { success: true, message: 'Member removed' };
  }

  @Get('search/users')
  @ApiOperation({ summary: 'Search users for invite' })
  async searchUsers(
    @Query('q') query: string,
    @Query('exclude') excludeWorkspaceId?: string,
  ) {
    const users = await this.workspaceService.searchUsers(query || '', excludeWorkspaceId);
    return { success: true, data: users };
  }
}
