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
import { Role } from '../generated/prisma/enums.js';

// ── Env setup ─────────────────────────────────────────────────────────────────

process.env['JWT_SECRET'] = 'test-jwt-secret-32-chars-minimum!!';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-32-chars-min!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-uuid-1';
const OTHER_ID = 'other-uuid-1';
const BOARD_ID = 'board-uuid-1';
const COLUMN_ID = 'col-uuid-1';
const COLUMN_ID_2 = 'col-uuid-2';

const jwtUserMap: Record<string, object> = {
  [OWNER_ID]: {
    id: OWNER_ID,
    email: 'owner@t.com',
    role: Role.MANAGER,
    isActive: true,
    tokenVersion: 0,
  },
  [OTHER_ID]: {
    id: OTHER_ID,
    email: 'other@t.com',
    role: Role.TEAM_MEMBER,
    isActive: true,
    tokenVersion: 0,
  },
};

const mockBoard = {
  id: BOARD_ID,
  name: 'Test Board',
  ownerId: OWNER_ID,
  members: [{ userId: OWNER_ID }],
};

const mockColumn = {
  id: COLUMN_ID,
  name: 'To Do',
  boardId: BOARD_ID,
  position: 1,
  color: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockColumn2 = {
  id: COLUMN_ID_2,
  name: 'In Progress',
  boardId: BOARD_ID,
  position: 2,
  color: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockPrisma = {
  board: { findUnique: jest.fn() },
  column: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// ── Auth helper ───────────────────────────────────────────────────────────────

function signToken(
  jwtService: JwtService,
  sub: string,
  role = Role.MANAGER,
): string {
  return jwtService.sign(
    { sub, email: `${sub}@test.com`, role, tokenVersion: 0 },
    { secret: process.env['JWT_SECRET'], expiresIn: '1h' },
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Columns API (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let ownerToken: string;
  let otherToken: string;

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
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    ownerToken = signToken(jwtService, OWNER_ID);
    otherToken = signToken(jwtService, OTHER_ID, Role.TEAM_MEMBER);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // JwtStrategy calls user.findUnique(id) for every protected request — return right user by id
    mockPrisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id?: string } }) => {
        if (where.id && jwtUserMap[where.id])
          return Promise.resolve(jwtUserMap[where.id]);
        return Promise.resolve(null);
      },
    );
    mockPrisma.$transaction.mockImplementation((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as () => Promise<unknown>)(),
    );
  });

  // ── POST /columns ──────────────────────────────────────────────────────────

  describe('POST /api/v1/columns', () => {
    it('✅ owner creates a column', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.aggregate.mockResolvedValue({ _max: { position: 1 } });
      mockPrisma.column.create.mockResolvedValue(mockColumn);

      const res = await request(app.getHttpServer())
        .post('/api/v1/columns')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'To Do', boardId: BOARD_ID })
        .expect(201);

      expect(res.body.data).toMatchObject({ name: 'To Do', boardId: BOARD_ID });
    });

    it('✅ creates first column with position 1 when board has no columns', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.aggregate.mockResolvedValue({
        _max: { position: null },
      });
      mockPrisma.column.create.mockResolvedValue({
        ...mockColumn,
        position: 1,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/columns')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'To Do', boardId: BOARD_ID })
        .expect(201);

      expect(res.body.data).toMatchObject({ position: 1 });
    });

    it('❌ returns 403 when a non-owner tries to create a column', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await request(app.getHttpServer())
        .post('/api/v1/columns')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'To Do', boardId: BOARD_ID })
        .expect(403);
    });

    it('❌ returns 404 when board not found', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/columns')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'To Do', boardId: 'non-existent' })
        .expect(404);
    });

    it('❌ returns 400 when name is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/columns')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ boardId: BOARD_ID })
        .expect(400);
    });

    it('❌ returns 400 when boardId is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/columns')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'To Do' })
        .expect(400);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/columns')
        .send({ name: 'To Do', boardId: BOARD_ID })
        .expect(401);
    });
  });

  // ── PATCH /columns/reorder ─────────────────────────────────────────────────

  describe('PATCH /api/v1/columns/reorder', () => {
    const reorderBody = [
      { id: COLUMN_ID, position: 2 },
      { id: COLUMN_ID_2, position: 1 },
    ];

    it('✅ owner reorders columns', async () => {
      mockPrisma.column.findMany.mockResolvedValue([mockColumn, mockColumn2]);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.update
        .mockResolvedValueOnce({ ...mockColumn, position: 2 })
        .mockResolvedValueOnce({ ...mockColumn2, position: 1 });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/columns/reorder')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(reorderBody)
        .expect(200);

      expect(res.body.data).toMatchObject({
        message: expect.stringContaining('reordered'),
      });
    });

    it('❌ returns 400 for an empty array', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/columns/reorder')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send([])
        .expect(400);
    });

    it('❌ returns 400 for duplicate column IDs', async () => {
      mockPrisma.column.findMany.mockResolvedValue([mockColumn]);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await request(app.getHttpServer())
        .patch('/api/v1/columns/reorder')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send([
          { id: COLUMN_ID, position: 1 },
          { id: COLUMN_ID, position: 2 },
        ])
        .expect(400);
    });

    it('❌ returns 404 when a column ID is not found', async () => {
      mockPrisma.column.findMany.mockResolvedValue([mockColumn]); // only 1, but 2 sent

      await request(app.getHttpServer())
        .patch('/api/v1/columns/reorder')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send([
          { id: COLUMN_ID, position: 1 },
          { id: 'ghost-id', position: 2 },
        ])
        .expect(404);
    });

    it('❌ returns 403 when a non-owner tries to reorder', async () => {
      mockPrisma.column.findMany.mockResolvedValue([mockColumn, mockColumn2]);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await request(app.getHttpServer())
        .patch('/api/v1/columns/reorder')
        .set('Authorization', `Bearer ${otherToken}`)
        .send(reorderBody)
        .expect(403);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/columns/reorder')
        .send(reorderBody)
        .expect(401);
    });
  });

  // ── PATCH /columns/:id ─────────────────────────────────────────────────────

  describe('PATCH /api/v1/columns/:id', () => {
    it('✅ owner updates a column name', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.update.mockResolvedValue({
        ...mockColumn,
        name: 'Done',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/columns/${COLUMN_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Done' })
        .expect(200);

      expect(res.body.data).toMatchObject({ name: 'Done' });
    });

    it('✅ owner updates a column color', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.update.mockResolvedValue({
        ...mockColumn,
        color: '#00FF00',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/columns/${COLUMN_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ color: '#00FF00' })
        .expect(200);

      expect(res.body.data).toMatchObject({ color: '#00FF00' });
    });

    it('❌ returns 403 when a non-owner tries to update', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await request(app.getHttpServer())
        .patch(`/api/v1/columns/${COLUMN_ID}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked' })
        .expect(403);
    });

    it('❌ returns 404 for a non-existent column', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/v1/columns/non-existent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'X' })
        .expect(404);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/columns/${COLUMN_ID}`)
        .send({ name: 'X' })
        .expect(401);
    });
  });

  // ── DELETE /columns/:id ────────────────────────────────────────────────────

  describe('DELETE /api/v1/columns/:id', () => {
    it('✅ owner deletes a column', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.delete.mockResolvedValue(mockColumn);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/columns/${COLUMN_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        message: expect.stringContaining('deleted'),
      });
    });

    it('❌ returns 403 when a non-owner tries to delete', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await request(app.getHttpServer())
        .delete(`/api/v1/columns/${COLUMN_ID}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('❌ returns 404 for a non-existent column', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/v1/columns/non-existent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/columns/${COLUMN_ID}`)
        .expect(401);
    });
  });
});
