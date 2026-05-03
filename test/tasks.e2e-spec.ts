import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Priority } from '../generated/prisma/enums.js';

// ── Env setup (must happen before AppModule loads ConfigService) ──────────────
process.env['JWT_SECRET'] = 'test-jwt-secret-32-chars-minimum!!';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-32-chars-min!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test'; // never hit — Prisma is mocked

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
const BOARD_ID = 'board-uuid-1';
const COLUMN_ID = 'col-uuid-1';
const OTHER_COLUMN_ID = 'col-uuid-2';
const TASK_ID = 'task-uuid-1';
const TAG_ID = 'tag-uuid-1';

const mockColumn = { id: COLUMN_ID, name: 'To Do', boardId: BOARD_ID, position: 1, color: null, createdAt: new Date(), updatedAt: new Date() };
const mockBoard = { id: BOARD_ID, name: 'Test Board', ownerId: USER_ID, members: [{ userId: USER_ID }] };
const mockTask = {
  id: TASK_ID,
  title: 'Test Task',
  description: 'A test task',
  priority: Priority.MEDIUM,
  dueDate: null,
  columnId: COLUMN_ID,
  position: 1,
  assigneeId: null,
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  column: mockColumn,
  assignee: null,
  tags: [],
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockTx = { task: { update: jest.fn(), updateMany: jest.fn() } };

const mockPrisma = {
  task: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
  },
  board: { findUnique: jest.fn(), findMany: jest.fn() },
  column: { findUnique: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// ── Auth helper ───────────────────────────────────────────────────────────────

function signToken(jwtService: JwtService, sub: string, role = 'MANAGER'): string {
  return jwtService.sign(
    { sub, email: `${sub}@test.com`, role, tokenVersion: 0 },
    { secret: process.env['JWT_SECRET'], expiresIn: '1h' },
  );
}

// ── E2E Suite ─────────────────────────────────────────────────────────────────

describe('Tasks API (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let memberToken: string;
  let nonMemberToken: string;

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
    memberToken = signToken(jwtService, USER_ID);
    nonMemberToken = signToken(jwtService, OTHER_USER_ID);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /api/v1/tasks ──────────────────────────────────────────────────────

  describe('GET /api/v1/tasks', () => {
    it('✅ returns paginated tasks for authenticated member', async () => {
      mockPrisma.board.findMany.mockResolvedValue([{ columns: [{ id: COLUMN_ID }] }]);
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toMatchObject({ total: 1, page: 1, limit: 20 });
    });

    it('✅ accepts boardId, priority, search and overdue query params', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.findMany.mockResolvedValue([{ id: COLUMN_ID }]);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.task.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .query({ boardId: BOARD_ID, priority: 'HIGH', search: 'login', overdue: 'true' })
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);
    });

    it('🔐 returns 401 when no token provided', async () => {
      await request(app.getHttpServer()).get('/api/v1/tasks').expect(401);
    });

    it('🔐 returns 401 for an invalid / malformed token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Authorization', 'Bearer totally.invalid.token')
        .expect(401);
    });
  });

  // ── POST /api/v1/tasks ─────────────────────────────────────────────────────

  describe('POST /api/v1/tasks', () => {
    const validBody = { title: 'New Task', columnId: COLUMN_ID };

    it('✅ creates a task and returns 201', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.aggregate.mockResolvedValue({ _max: { position: 0 } });
      mockPrisma.task.create.mockResolvedValue({ ...mockTask, id: 'new-task-uuid' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send(validBody)
        .expect(201);

      expect(res.body.data.title).toBe('New Task');
    });

    it('✅ creates task with optional fields (priority, dueDate, assigneeId, tagIds)', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.aggregate.mockResolvedValue({ _max: { position: 1 } });
      mockPrisma.task.create.mockResolvedValue(mockTask);

      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Full Task',
          columnId: COLUMN_ID,
          priority: 'HIGH',
          dueDate: '2025-12-31T23:59:59.000Z',
          assigneeId: USER_ID,
          tagIds: [TAG_ID],
        })
        .expect(201);
    });

    it('❌ returns 400 when title is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ columnId: COLUMN_ID })
        .expect(400);
    });

    it('❌ returns 400 when columnId is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task without column' })
        .expect(400);
    });

    it('❌ returns 400 for unknown fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task', columnId: COLUMN_ID, unknownField: 'oops' })
        .expect(400);
    });

    it('❌ returns 400 when priority has an invalid value', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task', columnId: COLUMN_ID, priority: 'SUPER_HIGH' })
        .expect(400);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer()).post('/api/v1/tasks').send(validBody).expect(401);
    });

    it('🚫 returns 403 when user is not a board member', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [{ userId: 'someone-else' }],
      });

      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${nonMemberToken}`)
        .send(validBody)
        .expect(403);
    });

    it('🚫 returns 404 when column does not exist', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task', columnId: 'no-such-col' })
        .expect(404);
    });
  });

  // ── GET /api/v1/tasks/:id ──────────────────────────────────────────────────

  describe('GET /api/v1/tasks/:id', () => {
    it('✅ returns a single task with relations', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce({ ...mockTask, checklistItems: [] });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tasks/${TASK_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(TASK_ID);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer()).get(`/api/v1/tasks/${TASK_ID}`).expect(401);
    });

    it('🚫 returns 404 when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/v1/tasks/non-existent-id')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(404);
    });

    it('🚫 returns 403 when user is not a board member', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [{ userId: 'someone-else' }],
      });

      await request(app.getHttpServer())
        .get(`/api/v1/tasks/${TASK_ID}`)
        .set('Authorization', `Bearer ${nonMemberToken}`)
        .expect(403);
    });
  });

  // ── PATCH /api/v1/tasks/:id ────────────────────────────────────────────────

  describe('PATCH /api/v1/tasks/:id', () => {
    it('✅ updates task title', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue({ ...mockTask, title: 'Updated Title' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${TASK_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect(res.body.data.title).toBe('Updated Title');
    });

    it('✅ updates multiple fields in a single request', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue(mockTask);

      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${TASK_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Updated', priority: 'LOW', description: 'New desc' })
        .expect(200);
    });

    it('❌ returns 400 for invalid priority value', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${TASK_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ priority: 'INVALID' })
        .expect(400);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${TASK_ID}`)
        .send({ title: 'X' })
        .expect(401);
    });

    it('🚫 returns 404 when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/v1/tasks/bad-id')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'X' })
        .expect(404);
    });
  });

  // ── DELETE /api/v1/tasks/:id ───────────────────────────────────────────────

  describe('DELETE /api/v1/tasks/:id', () => {
    it('✅ deletes task and returns 200', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.delete.mockResolvedValue(mockTask);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/tasks/${TASK_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('Task deleted successfully');
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer()).delete(`/api/v1/tasks/${TASK_ID}`).expect(401);
    });

    it('🚫 returns 404 when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/v1/tasks/bad-id')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(404);
    });
  });

  // ── PATCH /api/v1/tasks/:id/move ──────────────────────────────────────────

  describe('PATCH /api/v1/tasks/:id/move', () => {
    const validMoveBody = { columnId: COLUMN_ID, position: 3 };

    it('✅ moves task and returns updated task', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce({ ...mockTask, column: mockColumn })
        .mockResolvedValueOnce(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx));

      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${TASK_ID}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send(validMoveBody)
        .expect(200);
    });

    it('❌ returns 400 when columnId is missing', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${TASK_ID}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ position: 2 })
        .expect(400);
    });

    it('❌ returns 400 when position is less than 1', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${TASK_ID}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ columnId: COLUMN_ID, position: 0 })
        .expect(400);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${TASK_ID}/move`)
        .send(validMoveBody)
        .expect(401);
    });

    it('🚫 returns 404 when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/v1/tasks/bad-id/move')
        .set('Authorization', `Bearer ${memberToken}`)
        .send(validMoveBody)
        .expect(404);
    });

    it('⚠️ returns 400 when target column is on a different board', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ ...mockTask, column: mockColumn });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.findUnique.mockResolvedValue({ ...mockColumn, id: OTHER_COLUMN_ID, boardId: 'other-board' });

      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${TASK_ID}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ columnId: OTHER_COLUMN_ID, position: 1 })
        .expect(400);
    });
  });

  // ── POST /api/v1/tasks/:id/archive ─────────────────────────────────────────

  describe('POST /api/v1/tasks/:id/archive', () => {
    it('✅ archives the task and returns 200', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue({ ...mockTask, archived: true });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${TASK_ID}/archive`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('Task archived successfully');
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/${TASK_ID}/archive`)
        .expect(401);
    });

    it('🚫 returns 404 when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/tasks/bad-id/archive')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(404);
    });
  });

  // ── POST /api/v1/tasks/:id/unarchive ───────────────────────────────────────

  describe('POST /api/v1/tasks/:id/unarchive', () => {
    it('✅ unarchives the task and returns 200', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ ...mockTask, archived: true });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue({ ...mockTask, archived: false });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${TASK_ID}/unarchive`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('Task unarchived successfully');
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/${TASK_ID}/unarchive`)
        .expect(401);
    });

    it('🚫 returns 404 when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/tasks/bad-id/unarchive')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(404);
    });
  });
});
