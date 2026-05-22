// ============================================
// Auth Service Tests
// ============================================

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

// Mock Prisma
const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
};

const mockJwt = { sign: jest.fn().mockReturnValue('mock-jwt-token') };
const mockConfig = { get: jest.fn().mockReturnValue('7d') };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create a new user and return tokens', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1', email: 'test@test.com', username: 'testuser', role: 'USER', createdAt: new Date(),
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        email: 'test@test.com', username: 'testuser', password: 'StrongP@ss1',
      });

      expect(result.user.email).toBe('test@test.com');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw ConflictException if email exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ email: 'test@test.com' });

      await expect(service.register({
        email: 'test@test.com', username: 'testuser', password: 'StrongP@ss1',
      })).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException for invalid email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({
        email: 'wrong@test.com', password: 'password',
      })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('should throw for revoked token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({ revoked: true });

      await expect(service.refreshTokens('revoked-token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
