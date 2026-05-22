// ============================================
// Execution Service Tests
// ============================================

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionService } from '../src/execution/execution.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

const mockPrisma = {
  executionJob: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn((key: string, def: any) => def),
};

describe('ExecutionService', () => {
  let service: ExecutionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ExecutionService>(ExecutionService);
    jest.clearAllMocks();
  });

  describe('submitExecution', () => {
    it('should reject unsupported languages', async () => {
      await expect(
        service.submitExecution('user1', 'ws1', 'ruby', 'puts "hello"')
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject code exceeding size limit', async () => {
      const hugeCode = 'x'.repeat(200 * 1024); // 200KB
      await expect(
        service.submitExecution('user1', 'ws1', 'python', hugeCode)
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a job and return jobId', async () => {
      mockPrisma.executionJob.create.mockResolvedValue({ id: 'job-1', status: 'PENDING' });
      mockPrisma.executionJob.update.mockResolvedValue({});

      const result = await service.submitExecution('user1', 'ws1', 'python', 'print("hi")');
      expect(result.jobId).toBe('job-1');
      expect(result.status).toBe('PENDING');
    });
  });

  describe('getResult', () => {
    it('should throw for non-existent job', async () => {
      mockPrisma.executionJob.findUnique.mockResolvedValue(null);
      await expect(service.getResult('invalid-id')).rejects.toThrow(BadRequestException);
    });
  });
});
