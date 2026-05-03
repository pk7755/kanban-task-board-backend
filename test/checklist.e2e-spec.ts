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

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
const BOARD_ID = 'board-uuid-1';
const TASK_ID = 'task-uuid-1';
const ITEM_ID = 'item-uuid-1';

const jwtUser = {
  id: USER_ID,
  email: 'user@test.com',
  role: 'MANAGER',
  isActive: true,
  tokenVersion: 0,
};

const mockTask = {
  id: TASK_ID,
  title: 'Test Task',
  columnId: 'col-uuid-1',
  column: {
    board: {
      id: BOARD_ID,
      members: [{ userId: USER_ID }],
    },
  },
};

const mockItem = {
  id: ITEM_ID,
  taskId: TASK_ID,
  text: 'Write tests',
  done: false,
  position: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUnique: jest.fn() },
  task: { findUnique: jest.fn() },
  checklistItem: {
    findUnique: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Checklist API (e2e)', () => {
  let app: INestApplication<App>;
  let memberToken: string;
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const jwtService = app.get(JwtService);
    memberToken = jwtService.sign(
      {
        sub: USER_ID,
        email: jwtUser.email,
        role: jwtUser.role,
        tokenVersion: 0,
      },
      { secret: process.env['JWT_SECRET'], expiresIn: '1h' },
    );
    otherToken = jwtService.sign(
      {
        sub: OTHER_USER_ID,
        email: 'other@test.com',
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
    // JWT validation: return correct user for each token
    mockPrisma.user.findUnique.mockImplementation(({ where }) => {
      if (where.id === USER_ID) return Promise.resolve(jwtUser);
      if (where.id === OTHER_USER_ID)
        return Promise.resolve({
          ...jwtUser,
          id: OTHER_USER_ID,
          tokenVersion: 0,
        });
      return Promise.resolve(null);
    });
  });

  // ── POST /tasks/:taskId/checklist ─────────────────────────────────────────

  describe('POST /api/v1/tasks/:taskId/checklist', () => {
    it('✅ creates a checklist item and returns 201', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.aggregate.mockResolvedValue({
        _max: { position: 1 },
      });
      mockPrisma.checklistItem.create.mockResolvedValue({
        ...mockItem,
        position: 2,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${TASK_ID}/checklist`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ text: 'Write tests' })
        .expect(201);

      expect(res.body.data).toMatchObject({ text: 'Write tests', done: false });
    });

    it('✅ assigns position 1 when checklist is empty', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.aggregate.mockResolvedValue({
        _max: { position: null },
      });
      mockPrisma.checklistItem.create.mockResolvedValue({
        ...mockItem,
        position: 1,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${TASK_ID}/checklist`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ text: 'First item' })
        .expect(201);

      expect(res.body.data.position).toBe(1);
    });

    it('❌ returns 400 when text is missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/${TASK_ID}/checklist`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({})
        .expect(400);
    });

    it('❌ returns 400 when text is empty string', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/${TASK_ID}/checklist`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ text: '' })
        .expect(400);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/${TASK_ID}/checklist`)
        .send({ text: 'Write tests' })
        .expect(401);
    });

    it('🚫 returns 404 when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/tasks/non-existent/checklist')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ text: 'Write tests' })
        .expect(404);
    });

    it('🚫 returns 403 when user is not a board member', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);

      await request(app.getHttpServer())
        .post(`/api/v1/tasks/${TASK_ID}/checklist`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ text: 'Write tests' })
        .expect(403);
    });
  });

  // ── PATCH /checklist/:id ──────────────────────────────────────────────────

  describe('PATCH /api/v1/checklist/:id', () => {
    it('✅ updates text and returns 200', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.update.mockResolvedValue({
        ...mockItem,
        text: 'Updated',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/checklist/${ITEM_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ text: 'Updated' })
        .expect(200);

      expect(res.body.data).toMatchObject({ text: 'Updated' });
    });

    it('✅ marks item as done', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.update.mockResolvedValue({
        ...mockItem,
        done: true,
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/checklist/${ITEM_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ done: true })
        .expect(200);

      expect(res.body.data.done).toBe(true);
    });

    it('✅ marks item as undone', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue({
        ...mockItem,
        done: true,
      });
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.update.mockResolvedValue({
        ...mockItem,
        done: false,
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/checklist/${ITEM_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ done: false })
        .expect(200);

      expect(res.body.data.done).toBe(false);
    });

    it('❌ returns 400 for unknown fields', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/checklist/${ITEM_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ unknownField: 'value' })
        .expect(400);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/checklist/${ITEM_ID}`)
        .send({ done: true })
        .expect(401);
    });

    it('🚫 returns 404 when item does not exist', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/v1/checklist/non-existent')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ done: true })
        .expect(404);
    });

    it('🚫 returns 403 when user is not a board member', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);

      await request(app.getHttpServer())
        .patch(`/api/v1/checklist/${ITEM_ID}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ done: true })
        .expect(403);
    });
  });

  // ── DELETE /checklist/:id ─────────────────────────────────────────────────

  describe('DELETE /api/v1/checklist/:id', () => {
    it('✅ deletes item and returns 200 with message', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.delete.mockResolvedValue(mockItem);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/checklist/${ITEM_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        message: 'Checklist item deleted',
      });
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/checklist/${ITEM_ID}`)
        .expect(401);
    });

    it('🚫 returns 404 when item does not exist', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/v1/checklist/non-existent')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(404);
    });

    it('🚫 returns 403 when user is not a board member', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);

      await request(app.getHttpServer())
        .delete(`/api/v1/checklist/${ITEM_ID}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });
  });
});
