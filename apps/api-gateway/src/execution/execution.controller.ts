import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ExecutionService } from './execution.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('execution')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('execution')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Get('languages')
  @ApiOperation({ summary: 'Get supported languages and availability' })
  async getLanguages() {
    const languages = await this.executionService.getSupportedLanguages();
    return { success: true, data: languages };
  }

  @Post()
  @ApiOperation({ summary: 'Submit code for execution' })
  async execute(
    @CurrentUser('id') userId: string,
    @Body('workspaceId') workspaceId: string,
    @Body('language') language: string,
    @Body('code') code: string,
    @Body('stdin') stdin?: string,
  ) {
    const result = await this.executionService.submitExecution(userId, workspaceId, language, code, stdin);
    return { success: true, data: result };
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get execution result' })
  async getResult(@Param('jobId') jobId: string) {
    const result = await this.executionService.getResult(jobId);
    return { success: true, data: result };
  }

  @Get('workspace/:workspaceId')
  @ApiOperation({ summary: 'List executions for workspace' })
  async listExecutions(@Param('workspaceId') workspaceId: string) {
    const results = await this.executionService.listExecutions(workspaceId);
    return { success: true, data: results };
  }
}
