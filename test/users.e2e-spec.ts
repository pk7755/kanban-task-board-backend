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

const MANAGER_ID = 'manager-uuid-1';
const MEMBER_ID = 'member-uuid-1';

// User shapes returned by JwtStrategy (must have id, role, isActive, tokenVersion)
const jwtUserMap: Record<string, object> = {
  [MANAGER_ID]: {
    id: MANAGER_ID,
    email: 'manager@t.com',
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
};

const mockManager = {
  id: MANAGER_ID,
  email: 'manager@example.com',
  name: 'Manager',
  role: Role.MANAGER,
  avatarUrl: null,
  isActive: true,
  tokenVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMember = {
  id: MEMBER_ID,
  email: 'member@example.com',
  name: 'Member',
  role: Role.TEAM_MEMBER,
  avatarUrl: null,
  isActive: true,
  tokenVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// ── Auth helper ───────────────────────────────────────────────────────────────

function signToken(jwtService: JwtService, sub: string, role: Role): string {
  return jwtService.sign(
    { sub, email: `${sub}@test.com`, role, tokenVersion: 0 },
    { secret: process.env['JWT_SECRET'], expiresIn: '1h' },
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Users API (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
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
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    managerToken = signToken(jwtService, MANAGER_ID, Role.MANAGER);
    memberToken = signToken(jwtService, MEMBER_ID, Role.TEAM_MEMBER);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // JwtStrategy calls user.findUnique by id for every protected request
    mockPrisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id && jwtUserMap[where.id])
          return Promise.resolve(jwtUserMap[where.id]);
        return Promise.resolve(null);
      },
    );
    // UsersService.findAll uses $transaction([findMany, count])
    mockPrisma.$transaction.mockImplementation((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as () => Promise<unknown>)(),
    );
  });

  // ── POST /users ────────────────────────────────────────────────────────────

  describe('POST /api/v1/users', () => {
    const validBody = {
      email: 'new@example.com',
      password: 'SecurePass@123',
      name: 'New User',
    };

    it('✅ MANAGER creates a new user', async () => {
      // JWT call (by id) → handled by smart impl
      // UsersService.create: findUnique(email) → null (not taken), then create
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return Promise.resolve(jwtUserMap[where.id] ?? null);
          return Promise.resolve(null); // email not taken
        },
      );
      mockPrisma.user.create.mockResolvedValue({
        ...mockMember,
        email: 'new@example.com',
        name: 'New User',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validBody)
        .expect(201);

      expect(res.body.data).toMatchObject({ email: 'new@example.com' });
    });

    it('🔐 returns 403 when a TEAM_MEMBER tries to create a user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${memberToken}`)
        .send(validBody)
        .expect(403);
    });

    it('❌ returns 409 when email already exists', async () => {
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return Promise.resolve(jwtUserMap[where.id] ?? null);
          return Promise.resolve(mockMember); // email conflict
        },
      );

      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...validBody, email: mockMember.email })
        .expect(409);
    });

    it('❌ returns 400 for invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...validBody, email: 'not-an-email' })
        .expect(400);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(validBody)
        .expect(401);
    });
  });

  // ── GET /users ─────────────────────────────────────────────────────────────

  describe('GET /api/v1/users', () => {
    it('✅ returns paginated users list', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockMember, mockManager]);
      mockPrisma.user.count.mockResolvedValue(2);

      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(2);
    });

    it('✅ supports search query param', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockManager]);
      mockPrisma.user.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .query({ search: 'manager' })
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(1);
    });

    it('✅ supports page and limit query params', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .query({ page: 2, limit: 5 })
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    });
  });

  // ── GET /users/by-email ────────────────────────────────────────────────────

  describe('GET /api/v1/users/by-email', () => {
    it('✅ returns user for a valid email', async () => {
      // JWT call (by id) handled by smart impl; service findByEmail (by email) returns mockMember
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return Promise.resolve(jwtUserMap[where.id] ?? null);
          if (where.email === mockMember.email)
            return Promise.resolve(mockMember);
          return Promise.resolve(null);
        },
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/users/by-email')
        .query({ email: mockMember.email })
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({ email: mockMember.email });
    });

    it('✅ returns null when email not found', async () => {
      // default impl returns null for email lookups; service returns null → 200 with null data
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/by-email')
        .query({ email: 'nobody@example.com' })
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data).toBeNull();
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/by-email')
        .query({ email: mockMember.email })
        .expect(401);
    });
  });

  // ── GET /users/:id ─────────────────────────────────────────────────────────

  describe('GET /api/v1/users/:id', () => {
    it('✅ returns a user by ID', async () => {
      // JWT call and service findOne both use where.id — smart impl returns mockMember for MEMBER_ID
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string } }) => {
          if (where.id === MEMBER_ID) return Promise.resolve(mockMember);
          if (where.id && jwtUserMap[where.id])
            return Promise.resolve(jwtUserMap[where.id]);
          return Promise.resolve(null);
        },
      );

      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${MEMBER_ID}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({ id: MEMBER_ID });
    });

    it('❌ returns 404 for a non-existent ID', async () => {
      // default impl returns null for unknown ids
      await request(app.getHttpServer())
        .get('/api/v1/users/non-existent-id')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(404);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/users/${MEMBER_ID}`)
        .expect(401);
    });
  });

  // ── PATCH /users/me ────────────────────────────────────────────────────────

  describe('PATCH /api/v1/users/me', () => {
    it('✅ updates own profile', async () => {
      // JWT call + service findOne (both by id) + service update
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return Promise.resolve(jwtUserMap[where.id] ?? null);
          return Promise.resolve(null);
        },
      );
      mockPrisma.user.update.mockResolvedValue({
        ...mockMember,
        name: 'Updated',
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Updated' })
        .expect(200);

      expect(res.body.data).toMatchObject({ name: 'Updated' });
    });

    it('❌ returns 409 when new email already taken', async () => {
      // JWT call → memberJwt; service findOne → mockMember; email conflict check → mockManager
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return Promise.resolve(jwtUserMap[where.id] ?? null);
          if (where.email === mockManager.email)
            return Promise.resolve(mockManager);
          return Promise.resolve(null);
        },
      );

      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ email: mockManager.email })
        .expect(409);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .send({ name: 'Hack' })
        .expect(401);
    });

    it('⚠️ returns 400 for unknown extra fields', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ unknownField: 'x' })
        .expect(400);
    });
  });
});
