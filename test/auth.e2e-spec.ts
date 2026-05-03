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
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';

// ── Env setup ─────────────────────────────────────────────────────────────────

process.env['JWT_SECRET'] = 'test-jwt-secret-32-chars-minimum!!';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-32-chars-min!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'auth-user-uuid-1';
const TEST_PASSWORD = 'SecurePass@123';
const TEST_EMAIL = 'john@example.com';

let hashedPassword: string;

// User shape returned by JwtStrategy (must have id, role, isActive, tokenVersion)
const jwtUser = {
  id: USER_ID,
  email: TEST_EMAIL,
  role: Role.TEAM_MEMBER,
  isActive: true,
  tokenVersion: 0,
};

const baseUser = {
  ...jwtUser,
  name: 'John Doe',
  avatarUrl: null,
  createdAt: new Date(),
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// ── Auth helper ───────────────────────────────────────────────────────────────

function signToken(jwtService: JwtService, sub: string, role = Role.TEAM_MEMBER): string {
  return jwtService.sign(
    { sub, email: `${sub}@test.com`, role, tokenVersion: 0 },
    { secret: process.env['JWT_SECRET'], expiresIn: '1h' },
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Auth API (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let accessToken: string;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

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
    accessToken = signToken(jwtService, USER_ID);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // JwtStrategy calls user.findUnique for every protected request — return valid user by id
    mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === USER_ID) return Promise.resolve(jwtUser);
      return Promise.resolve(null);
    });
    // generateTokens (called after login/register/refresh) always updates the refresh token hash
    mockPrisma.user.update.mockResolvedValue({ ...jwtUser, refreshToken: 'hashed' });
  });

  // ── POST /auth/register ────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    const validBody = { email: TEST_EMAIL, password: TEST_PASSWORD, name: 'John Doe' };

    it('✅ registers a new user and returns tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null); // no email conflict
      mockPrisma.user.create.mockResolvedValue({ ...baseUser, password: hashedPassword });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(validBody)
        .expect(201);

      expect(res.body.data).toMatchObject({
        user: expect.objectContaining({ email: TEST_EMAIL }),
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('❌ returns 409 when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(validBody)
        .expect(409);
    });

    it('❌ returns 400 when email is invalid', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...validBody, email: 'not-an-email' })
        .expect(400);
    });

    it('❌ returns 400 when password is too short', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...validBody, password: 'short' })
        .expect(400);
    });

    it('❌ returns 400 when name is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(400);
    });

    it('⚠️ returns 400 for unknown extra fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...validBody, unknownField: 'x' })
        .expect(400);
    });
  });

  // ── POST /auth/login ───────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('✅ logs in and returns tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...jwtUser, password: hashedPassword });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('❌ returns 401 for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...jwtUser, password: hashedPassword });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: TEST_EMAIL, password: 'WrongPass@999' })
        .expect(401);
    });

    it('❌ returns 401 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: TEST_PASSWORD })
        .expect(401);
    });

    it('❌ returns 400 when email is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ password: TEST_PASSWORD })
        .expect(400);
    });
  });

  // ── GET /auth/me ───────────────────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('✅ returns the current user profile', async () => {
      // impl from beforeEach handles both JWT strategy + getMe service findUnique calls
      mockPrisma.user.findUnique.mockResolvedValue({ ...jwtUser, ...baseUser });

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({ email: TEST_EMAIL });
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('🔐 returns 401 for an invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer bad.token.here')
        .expect(401);
    });
  });

  // ── POST /auth/logout ──────────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('✅ logs out and returns 204', async () => {
      // beforeEach impl handles JWT validation; update mock handles the logout itself
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('🔐 returns 401 without token', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401);
    });
  });

  // ── POST /auth/refresh ─────────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('✅ issues a new token pair with a valid refresh token', async () => {
      const refreshToken = jwtService.sign(
        { sub: USER_ID, email: TEST_EMAIL, role: Role.TEAM_MEMBER, tokenVersion: 0 },
        { secret: process.env['JWT_REFRESH_SECRET'], expiresIn: '7d' },
      );
      const hashedRefresh = await bcrypt.hash(refreshToken, 10);

      mockPrisma.user.findUnique.mockResolvedValue({ ...jwtUser, refreshToken: hashedRefresh });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('❌ returns 401 for a tampered refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'tampered.token.value' })
        .expect(401);
    });

    it('❌ returns 400 when refreshToken field is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);
    });
  });
});
