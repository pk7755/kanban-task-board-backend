import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
} from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role } from '../../generated/prisma/enums.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const TEST_PASSWORD = 'SecurePass@123';

// Real hashes computed once — avoids ESM spy issues and mirrors the real auth flow
let hashedPassword: string;
let hashedRefreshToken: string;

const baseUser = {
  id: USER_ID,
  email: 'john@example.com',
  name: 'John Doe',
  role: Role.MANAGER,
  avatarUrl: null,
  isActive: true,
  tokenVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

let mockUser: typeof baseUser & { password: string; refreshToken: string };

const mockUserSelect = {
  id: baseUser.id,
  email: baseUser.email,
  name: baseUser.name,
  role: baseUser.role,
  avatarUrl: baseUser.avatarUrl,
  createdAt: baseUser.createdAt,
  tokenVersion: baseUser.tokenVersion,
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockJwtService = {
  signAsync: jest.fn(),
  verify: jest.fn(),
};

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('test-secret-32-chars-minimum!!!!'),
  get: jest.fn().mockReturnValue('15m'),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
    hashedRefreshToken = await bcrypt.hash('mock-jwt-token', 10);

    mockUser = {
      ...baseUser,
      password: hashedPassword,
      refreshToken: hashedRefreshToken,
    };
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');
    mockPrisma.user.update.mockResolvedValue(mockUser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('✅ registers a new user and returns user + token pair', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUserSelect);

      const result = await service.register({
        email: 'john@example.com',
        password: TEST_PASSWORD,
        name: 'John Doe',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        user: expect.objectContaining({ email: 'john@example.com' }),
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });
    });

    it('✅ stores a bcrypt hash — not the plaintext password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUserSelect);

      await service.register({
        email: 'a@b.com',
        password: TEST_PASSWORD,
        name: 'A',
      });

      const savedPassword =
        mockPrisma.user.create.mock.calls[0][0].data.password;
      expect(savedPassword).not.toBe(TEST_PASSWORD);

      const matches = await bcrypt.compare(TEST_PASSWORD, savedPassword);
      expect(matches).toBe(true);
    });

    it('❌ throws ConflictException when email is already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'john@example.com',
          password: TEST_PASSWORD,
          name: 'John',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('✅ returns tokens for valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.login({
        email: mockUser.email,
        password: TEST_PASSWORD,
      });

      expect(result).toMatchObject({
        user: expect.objectContaining({ email: mockUser.email }),
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });
    });

    it('❌ throws UnauthorizedException when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: TEST_PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('❌ throws UnauthorizedException when password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Real bcrypt.compare — 'wrong-password' will not match hashedPassword
      await expect(
        service.login({ email: mockUser.email, password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refreshTokens ──────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    const validPayload = {
      sub: USER_ID,
      email: baseUser.email,
      role: Role.MANAGER,
      tokenVersion: 0,
    };

    it('✅ issues new token pair for a valid refresh token', async () => {
      mockJwtService.verify.mockReturnValue(validPayload);
      // mockUser.refreshToken is a real bcrypt hash of 'mock-jwt-token'
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.refreshTokens('mock-jwt-token');

      expect(result).toMatchObject({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });
    });

    it('❌ throws UnauthorizedException for an invalid/expired refresh token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshTokens('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('❌ throws UnauthorizedException when user has no stored refresh token', async () => {
      mockJwtService.verify.mockReturnValue(validPayload);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshToken: null,
      });

      await expect(service.refreshTokens('mock-jwt-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('❌ throws UnauthorizedException when tokenVersion does not match', async () => {
      mockJwtService.verify.mockReturnValue({
        ...validPayload,
        tokenVersion: 99,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tokenVersion: 0,
      });

      await expect(service.refreshTokens('mock-jwt-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('❌ throws UnauthorizedException when refresh token is tampered', async () => {
      mockJwtService.verify.mockReturnValue(validPayload);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Real bcrypt.compare('tampered', hashedRefreshToken) → false
      await expect(
        service.refreshTokens('tampered-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── getMe ──────────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('✅ returns the current user profile', async () => {
      const profile = {
        id: USER_ID,
        email: baseUser.email,
        name: baseUser.name,
        role: baseUser.role,
        avatarUrl: null,
        createdAt: baseUser.createdAt,
      };
      mockPrisma.user.findUnique.mockResolvedValue(profile);

      const result = await service.getMe(USER_ID);

      expect(result).toEqual(profile);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID } }),
      );
    });

    it('❌ throws UnauthorizedException when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('bad-id')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('✅ clears the refresh token and increments tokenVersion', async () => {
      await service.logout(USER_ID);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { refreshToken: null, tokenVersion: { increment: 1 } },
      });
    });
  });
});
