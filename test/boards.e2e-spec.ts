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
const MEMBER_ID = 'member-uuid-1';
const OTHER_ID = 'other-uuid-1';
const BOARD_ID = 'board-uuid-1';

const jwtUserMap: Record<string, object> = {
  [OWNER_ID]: {
    id: OWNER_ID,
    email: 'owner@t.com',
    role: Role.MANAGER,
    isActive: true,
    tokenVersion: 0,
  },
  [MEMBER_ID]: {
    id: MEMBER_ID,
    email: 'member@t.com',
    role: Role.TEAM_MEMBER,
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

const mockMemberUser = {
  id: MEMBER_ID,
  email: 'member@example.com',
  name: 'Member',
  role: Role.TEAM_MEMBER,
  avatarUrl: null,
  isActive: true,
};

const mockBoard = {
  id: BOARD_ID,
  name: 'Test Board',
  ownerId: OWNER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  members: [{ userId: OWNER_ID }],
  _count: { members: 1 },
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockPrisma = {
  board: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  boardMember: {
    create: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
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

describe('Boards API (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let ownerToken: string;
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
    memberToken = signToken(jwtService, MEMBER_ID, Role.TEAM_MEMBER);
    otherToken = signToken(jwtService, OTHER_ID, Role.TEAM_MEMBER);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Smart mock: JwtStrategy calls user.findUnique by id for every protected request
    mockPrisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id && jwtUserMap[where.id])
          return Promise.resolve(jwtUserMap[where.id]);
        return Promise.resolve(null);
      },
    );
  });

  // ── GET /boards ────────────────────────────────────────────────────────────

  describe('GET /api/v1/boards', () => {
    it('✅ returns boards for the authenticated user', async () => {
      mockPrisma.board.findMany.mockResolvedValue([mockBoard]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/boards')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ name: 'Test Board' });
    });

    it('✅ returns empty list when user has no boards', async () => {
      mockPrisma.board.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/boards')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/boards').expect(401);
    });
  });

  // ── POST /boards ───────────────────────────────────────────────────────────

  describe('POST /api/v1/boards', () => {
    it('✅ creates a board and returns 201', async () => {
      mockPrisma.board.create.mockResolvedValue(mockBoard);

      const res = await request(app.getHttpServer())
        .post('/api/v1/boards')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Board' })
        .expect(201);

      expect(res.body.data).toMatchObject({ name: 'Test Board' });
    });

    it('❌ returns 400 when name is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/boards')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(400);
    });

    it('❌ returns 400 when name is empty string', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/boards')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '' })
        .expect(400);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/boards')
        .send({ name: 'Test' })
        .expect(401);
    });
  });

  // ── GET /boards/:id ────────────────────────────────────────────────────────

  describe('GET /api/v1/boards/:id', () => {
    it('✅ returns board detail for a member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [
          {
            userId: OWNER_ID,
            user: {
              id: OWNER_ID,
              name: 'Owner',
              email: 'o@t.com',
              avatarUrl: null,
            },
          },
          {
            userId: MEMBER_ID,
            user: {
              id: MEMBER_ID,
              name: 'Member',
              email: 'm@t.com',
              avatarUrl: null,
            },
          },
        ],
        columns: [],
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/boards/${BOARD_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({ id: BOARD_ID });
    });

    it('❌ returns 403 for a non-member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        columns: [],
      }); // only OWNER_ID in members

      await request(app.getHttpServer())
        .get(`/api/v1/boards/${BOARD_ID}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('❌ returns 404 for a non-existent board', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/v1/boards/non-existent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/boards/${BOARD_ID}`)
        .expect(401);
    });
  });

  // ── PATCH /boards/:id ──────────────────────────────────────────────────────

  describe('PATCH /api/v1/boards/:id', () => {
    it('✅ owner renames the board', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.board.update.mockResolvedValue({
        ...mockBoard,
        name: 'Renamed',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/boards/${BOARD_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Renamed' })
        .expect(200);

      expect(res.body.data).toMatchObject({ name: 'Renamed' });
    });

    it('❌ returns 403 when a non-owner tries to rename', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await request(app.getHttpServer())
        .patch(`/api/v1/boards/${BOARD_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Renamed' })
        .expect(403);
    });

    it('❌ returns 404 for a non-existent board', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/v1/boards/non-existent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Renamed' })
        .expect(404);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/boards/${BOARD_ID}`)
        .send({ name: 'X' })
        .expect(401);
    });
  });

  // ── DELETE /boards/:id ─────────────────────────────────────────────────────

  describe('DELETE /api/v1/boards/:id', () => {
    it('✅ owner deletes the board', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.board.delete.mockResolvedValue(mockBoard);

      await request(app.getHttpServer())
        .delete(`/api/v1/boards/${BOARD_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
    });

    it('❌ returns 403 when a non-owner tries to delete', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await request(app.getHttpServer())
        .delete(`/api/v1/boards/${BOARD_ID}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('❌ returns 404 for a non-existent board', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/v1/boards/non-existent')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/boards/${BOARD_ID}`)
        .expect(401);
    });
  });

  // ── POST /boards/:id/members ───────────────────────────────────────────────

  describe('POST /api/v1/boards/:id/members', () => {
    it('✅ owner adds a new member by email', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      // JWT call uses where.id; addMember service uses where.email
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return Promise.resolve(jwtUserMap[where.id] ?? null);
          if (where.email === mockMemberUser.email)
            return Promise.resolve(mockMemberUser);
          return Promise.resolve(null);
        },
      );
      mockPrisma.boardMember.create.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boards/${BOARD_ID}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: mockMemberUser.email })
        .expect(201);

      expect(res.body.data).toMatchObject({
        message: expect.stringContaining('added'),
      });
    });

    it('❌ returns 409 when user is already a member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [{ userId: OWNER_ID }, { userId: MEMBER_ID }],
      });
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return Promise.resolve(jwtUserMap[where.id] ?? null);
          return Promise.resolve(mockMemberUser);
        },
      );

      await request(app.getHttpServer())
        .post(`/api/v1/boards/${BOARD_ID}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: mockMemberUser.email })
        .expect(409);
    });

    it('❌ returns 404 when user email not found', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      // email lookup returns null → 404

      await request(app.getHttpServer())
        .post(`/api/v1/boards/${BOARD_ID}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'nobody@example.com' })
        .expect(404);
    });

    it('❌ returns 403 when a non-owner tries to add a member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await request(app.getHttpServer())
        .post(`/api/v1/boards/${BOARD_ID}/members`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ email: 'anyone@example.com' })
        .expect(403);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/boards/${BOARD_ID}/members`)
        .send({ email: 'x@x.com' })
        .expect(401);
    });
  });

  // ── DELETE /boards/:id/members/:userId ─────────────────────────────────────

  describe('DELETE /api/v1/boards/:id/members/:userId', () => {
    const boardWithMember = {
      ...mockBoard,
      members: [{ userId: OWNER_ID }, { userId: MEMBER_ID }],
    };

    it('✅ owner removes a member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(boardWithMember);
      mockPrisma.boardMember.delete.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/boards/${BOARD_ID}/members/${MEMBER_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        message: expect.stringContaining('removed'),
      });
    });

    it('❌ returns 403 when trying to remove the owner', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await request(app.getHttpServer())
        .delete(`/api/v1/boards/${BOARD_ID}/members/${OWNER_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });

    it('❌ returns 404 when target user is not a member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard); // only OWNER_ID

      await request(app.getHttpServer())
        .delete(`/api/v1/boards/${BOARD_ID}/members/${OTHER_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('❌ returns 403 when a non-owner tries to remove a member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(boardWithMember);

      await request(app.getHttpServer())
        .delete(`/api/v1/boards/${BOARD_ID}/members/${MEMBER_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/boards/${BOARD_ID}/members/${MEMBER_ID}`)
        .expect(401);
    });
  });
});
