import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('analyze')
  @ApiOperation({ summary: 'Submit code for AI analysis' })
  async analyze(
    @CurrentUser('id') userId: string,
    @Body('workspaceId') workspaceId: string,
    @Body('type') type: string,
    @Body('code') code: string,
    @Body('language') language: string,
  ) {
    const result = await this.aiService.analyze(userId, workspaceId, type, code, language);
    return { success: true, data: result };
  }

  @Get('result/:requestId')
  @ApiOperation({ summary: 'Get AI analysis result' })
  async getResult(@Param('requestId') requestId: string) {
    const result = await this.aiService.getResult(requestId);
    return { success: true, data: result };
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI assistant' })
  async chat(
    @Body('message') message: string,
    @Body('history') history: Array<{ role: string; content: string }>,
  ) {
    const response = await this.aiService.chat(message, history || []);
    return { success: true, data: { response } };
  }
}
