// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditAction } from '../../generated/prisma/enums.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const TARGET_ID = 'target-uuid-1';

const mockLog = {
  id: 'log-uuid-1',
  userId: USER_ID,
  action: AuditAction.USER_CREATED,
  targetType: 'User',
  targetId: TARGET_ID,
  metadata: null,
  createdAt: new Date(),
  user: { id: USER_ID, name: 'Manager', email: 'manager@test.com' },
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockPrisma = {
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  // ── log ────────────────────────────────────────────────────────────────────

  describe('log', () => {
    it('✅ creates an audit log entry', async () => {
      mockPrisma.auditLog.create.mockResolvedValue(mockLog);

      await service.log(USER_ID, AuditAction.USER_CREATED, 'User', TARGET_ID);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          action: AuditAction.USER_CREATED,
          targetType: 'User',
          targetId: TARGET_ID,
        }),
      });
    });

    it('✅ includes metadata when provided', async () => {
      mockPrisma.auditLog.create.mockResolvedValue(mockLog);
      const meta = { from: 'TEAM_MEMBER', to: 'MANAGER' };

      await service.log(
        USER_ID,
        AuditAction.ROLE_CHANGED,
        'User',
        TARGET_ID,
        meta,
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ metadata: meta }),
      });
    });

    it('✅ omits metadata key when not provided', async () => {
      mockPrisma.auditLog.create.mockResolvedValue(mockLog);

      await service.log(
        USER_ID,
        AuditAction.USER_DEACTIVATED,
        'User',
        TARGET_ID,
      );

      const callArg = mockPrisma.auditLog.create.mock.calls[0][0];
      expect(callArg.data).not.toHaveProperty('metadata');
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('✅ returns paginated audit logs', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockLog], 1]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toEqual([mockLog]);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('✅ paginates correctly on page 2', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 25]);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });

    it('✅ defaults to page 1 and limit 20', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll({});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('✅ caps limit at 100', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll({ limit: 999 });

      expect(result.meta.limit).toBe(100);
    });
  });
});
