// ============================================
// Auth Service — Core Authentication Logic
// ============================================
// Handles registration, login, JWT issuance,
// refresh token rotation, and logout.
//
// Security decisions:
// - bcrypt with 12 salt rounds (balances security vs performance)
// - Refresh token rotation: old token invalidated on each refresh
// - Tokens stored in DB for revocation capability
// - Access tokens are short-lived (15m), refresh tokens long-lived (7d)

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;       // User ID
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Register ──────────────────────────────────

  async register(dto: RegisterDto) {
    // Check if user exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        existingUser.email === dto.email
          ? 'Email already registered'
          : 'Username already taken',
      );
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    this.logger.log(`User registered: ${user.email}`);

    return { user, ...tokens };
  }

  // ── Login ─────────────────────────────────────

  async login(dto: LoginDto) {
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Use generic message to prevent user enumeration
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        resource: 'auth',
      },
    });

    this.logger.log(`User logged in: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  // ── Refresh Token ─────────────────────────────

  async refreshTokens(refreshToken: string) {
    // Find the refresh token in DB
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old refresh token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    // Generate new token pair
    const tokens = await this.generateTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role,
    );

    return tokens;
  }

  // ── Logout ────────────────────────────────────

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      // Revoke specific refresh token
      await this.prisma.refreshToken.updateMany({
        where: { token: refreshToken, userId },
        data: { revoked: true },
      });
    } else {
      // Revoke all refresh tokens for user
      await this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revoked: true },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'LOGOUT',
        resource: 'auth',
      },
    });

    this.logger.log(`User logged out: ${userId}`);
  }

  // ── Get Current User ──────────────────────────

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ── Token Generation ──────────────────────────

  private async generateTokens(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };

    // Access token (short-lived)
    const accessToken = this.jwt.sign(payload);

    // Refresh token (long-lived, stored in DB)
    const refreshToken = uuidv4();
    const refreshExpiry = this.config.get<string>('JWT_REFRESH_EXPIRATION', '7d');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(refreshExpiry) || 7);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  // ── Validate JWT Payload ──────────────────────

  async validateUser(payload: JwtPayload) {
    return this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        avatarUrl: true,
      },
    });
  }

  // ── Update Profile ────────────────────────────

  async updateProfile(userId: string, data: { username?: string; avatarUrl?: string }) {
    if (data.username) {
      const existing = await this.prisma.user.findFirst({
        where: { username: data.username, NOT: { id: userId } },
      });
      if (existing) throw new ConflictException('Username already taken');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.username && { username: data.username }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      },
      select: {
        id: true, email: true, username: true, role: true,
        avatarUrl: true, createdAt: true, updatedAt: true,
      },
    });

    this.logger.log(`Profile updated: ${user.email}`);
    return user;
  }

  // ── Change Password ───────────────────────────

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const isOldValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldValid) throw new UnauthorizedException('Current password is incorrect');

    const hashedNew = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNew },
    });

    // Revoke all refresh tokens for security
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    });

    await this.prisma.auditLog.create({
      data: { userId, action: 'PASSWORD_CHANGE', resource: 'auth' },
    });

    this.logger.log(`Password changed: ${user.email}`);
  }

  // ── Delete Account ────────────────────────────

  async deleteAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new UnauthorizedException('Invalid password');

    await this.prisma.auditLog.create({
      data: { userId, action: 'ACCOUNT_DELETE', resource: 'auth' },
    });

    // Cascading delete handles related records
    await this.prisma.user.delete({ where: { id: userId } });

    this.logger.log(`Account deleted: ${user.email}`);
  }
}
