// @ts-nocheck
import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// ── Env setup ─────────────────────────────────────────────────────────────────

process.env['JWT_SECRET'] = 'test-jwt-secret-32-chars-minimum!!';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-32-chars-min!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MANAGER_ID = 'manager-uuid-1';
const MEMBER_ID = 'member-uuid-1';

const mockManager = {
  id: MANAGER_ID,
  email: 'manager@test.com',
  role: 'MANAGER',
  isActive: true,
  tokenVersion: 0,
};

const mockMember = {
  id: MEMBER_ID,
  email: 'member@test.com',
  role: 'TEAM_MEMBER',
  isActive: true,
  tokenVersion: 0,
};

const mockLog = {
  id: 'log-uuid-1',
  userId: MANAGER_ID,
  action: 'USER_CREATED',
  targetType: 'User',
  targetId: 'some-user-id',
  metadata: null,
  createdAt: new Date().toISOString(),
  user: { id: MANAGER_ID, name: 'Manager', email: 'manager@test.com' },
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUnique: jest.fn() },
  auditLog: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Audit Logs API (e2e)', () => {
  let app: INestApplication<App>;
  let managerToken: string;
  let memberToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const jwtService = app.get(JwtService);
    managerToken = jwtService.sign(
      {
        sub: MANAGER_ID,
        email: mockManager.email,
        role: 'MANAGER',
        tokenVersion: 0,
      },
      { secret: process.env['JWT_SECRET'], expiresIn: '1h' },
    );
    memberToken = jwtService.sign(
      {
        sub: MEMBER_ID,
        email: mockMember.email,
        role: 'TEAM_MEMBER',
        tokenVersion: 0,
      },
      { secret: process.env['JWT_SECRET'], expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockImplementation(({ where }) => {
      if (where.id === MANAGER_ID) return Promise.resolve(mockManager);
      if (where.id === MEMBER_ID) return Promise.resolve(mockMember);
      return Promise.resolve(null);
    });
  });

  // ── GET /audit-logs ───────────────────────────────────────────────────────

  describe('GET /api/v1/audit-logs', () => {
    it('✅ 200 manager can list audit logs', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockLog], 1]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.meta.total).toBe(1);
    });

    it('✅ 200 supports pagination params', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs?page=1&limit=10')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
    });

    it('🚫 403 team member cannot access audit logs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
    });

    it('🚫 401 without token', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/audit-logs');

      expect(res.status).toBe(401);
    });
  });
});
