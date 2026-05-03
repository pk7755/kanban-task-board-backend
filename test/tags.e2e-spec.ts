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
const TAG_ID = 'tag-uuid-1';

const jwtUser = {
  id: USER_ID,
  email: 'user@test.com',
  role: 'MANAGER',
  isActive: true,
  tokenVersion: 0,
};

const mockBoard = {
  id: BOARD_ID,
  name: 'Test Board',
  ownerId: USER_ID,
  members: [{ userId: USER_ID }],
};

const mockTag = {
  id: TAG_ID,
  name: 'Bug',
  color: '#FF5733',
  boardId: BOARD_ID,
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUnique: jest.fn() },
  board: { findUnique: jest.fn() },
  tag: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Tags API (e2e)', () => {
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

  // ── GET /boards/:id/tags ──────────────────────────────────────────────────

  describe('GET /api/v1/boards/:id/tags', () => {
    it('✅ 200 returns tags for a board', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.findMany.mockResolvedValue([mockTag]);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/boards/${BOARD_ID}/tags`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([mockTag]);
    });

    it('✅ 200 returns empty array when no tags', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/boards/${BOARD_ID}/tags`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('🚫 401 when no token provided', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/boards/${BOARD_ID}/tags`,
      );
      expect(res.status).toBe(401);
    });

    it('🚫 403 when user is not a board member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/boards/${BOARD_ID}/tags`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('🚫 404 when board does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/boards/bad-board-id/tags')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ── POST /boards/:id/tags ─────────────────────────────────────────────────

  describe('POST /api/v1/boards/:id/tags', () => {
    it('✅ 201 creates a tag', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.create.mockResolvedValue(mockTag);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boards/${BOARD_ID}/tags`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Bug', color: '#FF5733' });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Bug');
      expect(res.body.data.color).toBe('#FF5733');
    });

    it('🚫 400 when name is missing', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/boards/${BOARD_ID}/tags`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ color: '#FF5733' });

      expect(res.status).toBe(400);
    });

    it('🚫 400 when color is not a valid hex color', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/boards/${BOARD_ID}/tags`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Bug', color: 'not-a-color' });

      expect(res.status).toBe(400);
    });

    it('🚫 401 when no token provided', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/boards/${BOARD_ID}/tags`)
        .send({ name: 'Bug', color: '#FF5733' });

      expect(res.status).toBe(401);
    });

    it('🚫 403 when user is not a board member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boards/${BOARD_ID}/tags`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Bug', color: '#FF5733' });

      expect(res.status).toBe(403);
    });

    it('🚫 404 when board does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/boards/bad-board-id/tags')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Bug', color: '#FF5733' });

      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /tags/:id ───────────────────────────────────────────────────────

  describe('PATCH /api/v1/tags/:id', () => {
    it('✅ 200 updates tag name', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(mockTag);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.update.mockResolvedValue({ ...mockTag, name: 'Feature' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tags/${TAG_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Feature' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Feature');
    });

    it('✅ 200 updates tag color', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(mockTag);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.update.mockResolvedValue({ ...mockTag, color: '#33FF57' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tags/${TAG_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ color: '#33FF57' });

      expect(res.status).toBe(200);
      expect(res.body.data.color).toBe('#33FF57');
    });

    it('🚫 400 when color is invalid hex', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tags/${TAG_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ color: 'red' });

      expect(res.status).toBe(400);
    });

    it('🚫 401 when no token provided', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tags/${TAG_ID}`)
        .send({ name: 'Feature' });

      expect(res.status).toBe(401);
    });

    it('🚫 403 when user is not a board member', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(mockTag);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tags/${TAG_ID}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Feature' });

      expect(res.status).toBe(403);
    });

    it('🚫 404 when tag does not exist', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/tags/bad-tag-id')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Feature' });

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /tags/:id ──────────────────────────────────────────────────────

  describe('DELETE /api/v1/tags/:id', () => {
    it('✅ 200 deletes a tag', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(mockTag);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.delete.mockResolvedValue(mockTag);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/tags/${TAG_ID}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ message: 'Tag deleted' });
    });

    it('🚫 401 when no token provided', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/api/v1/tags/${TAG_ID}`,
      );
      expect(res.status).toBe(401);
    });

    it('🚫 403 when user is not a board member', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(mockTag);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/tags/${TAG_ID}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('🚫 404 when tag does not exist', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .delete('/api/v1/tags/bad-tag-id')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(404);
    });
  });
});
