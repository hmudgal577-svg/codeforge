// ============================================
// Auth Controller — HTTP Endpoints
// ============================================

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);

    // Set refresh token in httpOnly cookie for security
    this.setRefreshCookie(res, result.refreshToken);

    return {
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);

    this.setRefreshCookie(res, result.refreshToken);

    return {
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Try cookie first, then body
    const refreshToken = req.cookies?.refreshToken || dto.refreshToken;

    if (!refreshToken) {
      return { success: false, error: 'No refresh token provided' };
    }

    const tokens = await this.authService.refreshTokens(refreshToken);

    this.setRefreshCookie(res, tokens.refreshToken);

    return {
      success: true,
      data: { accessToken: tokens.accessToken },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate tokens' })
  async logout(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken;
    await this.authService.logout(userId, refreshToken);

    // Clear cookie
    res.clearCookie('refreshToken');

    return { success: true, message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser('id') userId: string) {
    const user = await this.authService.getProfile(userId);
    return { success: true, data: user };
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user profile' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() body: { username?: string; avatarUrl?: string },
  ) {
    const user = await this.authService.updateProfile(userId, body);
    return { success: true, data: user };
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    await this.authService.changePassword(userId, body.oldPassword, body.newPassword);
    return { success: true, message: 'Password changed successfully' };
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete account permanently' })
  async deleteAccount(
    @CurrentUser('id') userId: string,
    @Body() body: { password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.deleteAccount(userId, body.password);
    res.clearCookie('refreshToken');
    return { success: true, message: 'Account deleted' };
  }

  // ── Helper ──────────────────────────────────

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refreshToken', token, {
      httpOnly: true,     // Not accessible via JavaScript (XSS protection)
      secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
      sameSite: 'lax',    // CSRF protection
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/v1/auth',  // Only sent to auth endpoints
    });
  }
}
