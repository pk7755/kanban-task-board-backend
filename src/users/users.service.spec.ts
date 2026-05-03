import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role } from '../../generated/prisma/enums.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MANAGER_ID = 'manager-uuid-1';
const MEMBER_ID  = 'member-uuid-1';
const TEST_PASSWORD = 'SecurePass@123';

const mockManager = {
  id: MANAGER_ID,
  email: 'manager@example.com',
  name: 'Manager',
  role: Role.MANAGER,
  avatarUrl: null,
  isActive: true,
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany:   jest.fn(),
    count:      jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;

  beforeAll(() => {
    // nothing to pre-compute here — bcrypt is used inside the service,
    // we verify behaviour via Prisma call args
  });

  beforeEach(async () => {
    jest.resetAllMocks();

    mockPrisma.$transaction.mockImplementation((ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('✅ creates a new user with TEAM_MEMBER default role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockMember);

      const result = await service.create({
        email: 'member@example.com',
        password: TEST_PASSWORD,
        name: 'Member',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      const createData = mockPrisma.user.create.mock.calls[0][0].data;
      expect(createData.role).toBe(Role.TEAM_MEMBER);
      expect(result).toEqual(mockMember);
    });

    it('✅ stores a bcrypt hash — not the plaintext password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockMember);

      await service.create({ email: 'a@b.com', password: TEST_PASSWORD, name: 'A' });

      const savedPassword = mockPrisma.user.create.mock.calls[0][0].data.password;
      expect(savedPassword).not.toBe(TEST_PASSWORD);

      // Verify the stored value is a real bcrypt hash of the original password
      const matches = await bcrypt.compare(TEST_PASSWORD, savedPassword);
      expect(matches).toBe(true);
    });

    it('✅ respects an explicit role when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockManager);

      await service.create({ email: 'mgr@example.com', password: TEST_PASSWORD, name: 'Mgr', role: Role.MANAGER });

      const createData = mockPrisma.user.create.mock.calls[0][0].data;
      expect(createData.role).toBe(Role.MANAGER);
    });

    it('❌ throws ConflictException when email is already taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockMember);

      await expect(
        service.create({ email: 'member@example.com', password: TEST_PASSWORD, name: 'Dup' }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('✅ returns paginated users with default page=1, limit=10', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockManager]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result).toMatchObject({
        data: [mockManager],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });
    });

    it('✅ applies search filter across name and email (case-insensitive)', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockManager]);
      mockPrisma.user.count.mockResolvedValue(1);

      await service.findAll({ search: 'manager' });

      const whereArg = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: { contains: 'manager', mode: 'insensitive' } }),
          expect.objectContaining({ name:  { contains: 'manager', mode: 'insensitive' } }),
        ]),
      );
    });

    it('✅ respects custom page and limit', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(25);

      const result = await service.findAll({ page: 3, limit: 5 });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
      expect(result.pagination).toMatchObject({ page: 3, limit: 5, totalPages: 5 });
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('✅ returns user by ID', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockMember);

      const result = await service.findOne(MEMBER_ID);

      expect(result).toEqual(mockMember);
    });

    it('❌ throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findByEmail ────────────────────────────────────────────────────────────

  describe('findByEmail', () => {
    it('✅ returns user when email matches', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockMember);

      const result = await service.findByEmail(mockMember.email);

      expect(result).toEqual(mockMember);
    });

    it('✅ returns null when no user matches', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('no@one.com');

      expect(result).toBeNull();
    });
  });

  // ── update (own profile) ───────────────────────────────────────────────────

  describe('update', () => {
    it('✅ allows a user to update their own profile', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockMember)  // findOne guard
        .mockResolvedValueOnce(null);       // email conflict check
      mockPrisma.user.update.mockResolvedValue({ ...mockMember, name: 'New Name' });

      const result = await service.update(MEMBER_ID, { name: 'New Name' }, MEMBER_ID, Role.TEAM_MEMBER);

      expect(result.name).toBe('New Name');
    });

    it('✅ allows a MANAGER to update another user', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockMember);
      mockPrisma.user.update.mockResolvedValue(mockMember);

      await service.update(MEMBER_ID, { name: 'Changed' }, MANAGER_ID, Role.MANAGER);

      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('❌ throws ForbiddenException when a TEAM_MEMBER tries to update another user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockMember);

      await expect(
        service.update(MANAGER_ID, { name: 'Hack' }, MEMBER_ID, Role.TEAM_MEMBER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('❌ throws ConflictException when new email is already used by another user', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockMember)   // findOne
        .mockResolvedValueOnce(mockManager); // email conflict — different user

      await expect(
        service.update(MEMBER_ID, { email: mockManager.email }, MEMBER_ID, Role.TEAM_MEMBER),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── findTeam ───────────────────────────────────────────────────────────────

  describe('findTeam', () => {
    it('✅ returns all team members paginated', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockManager, mockMember]);
      mockPrisma.user.count.mockResolvedValue(2);

      const result = await service.findTeam();

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('✅ filters by role when provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockMember]);
      mockPrisma.user.count.mockResolvedValue(1);

      await service.findTeam({ role: Role.TEAM_MEMBER });

      const whereArg = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.role).toBe(Role.TEAM_MEMBER);
    });

    it('✅ applies search filter across name and email', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findTeam({ search: 'jane' });

      const whereArg = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg['OR']).toBeDefined();
    });
  });

  // ── updateTeamMember ───────────────────────────────────────────────────────

  describe('updateTeamMember', () => {
    it('✅ updates a team member name and status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockMember);
      mockPrisma.user.update.mockResolvedValue({ ...mockMember, name: 'Updated', isActive: false });

      const result = await service.updateTeamMember(
        MEMBER_ID,
        { name: 'Updated', isActive: false },
        MANAGER_ID,
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Updated', isActive: false }) }),
      );
      expect(result.name).toBe('Updated');
    });

    it('✅ allows manager to update their own name without changing role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockManager);
      mockPrisma.user.update.mockResolvedValue({ ...mockManager, name: 'Boss' });

      await service.updateTeamMember(MANAGER_ID, { name: 'Boss' }, MANAGER_ID);

      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('❌ throws ForbiddenException when manager tries to change their own role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockManager);

      await expect(
        service.updateTeamMember(MANAGER_ID, { role: Role.TEAM_MEMBER }, MANAGER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('❌ throws NotFoundException when target user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTeamMember('bad-id', { name: 'X' }, MANAGER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── removeTeamMember ───────────────────────────────────────────────────────

  describe('removeTeamMember', () => {
    it('✅ soft-deletes a team member (isActive → false)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockMember);
      mockPrisma.user.update.mockResolvedValue({ ...mockMember, isActive: false });

      await service.removeTeamMember(MEMBER_ID, MANAGER_ID);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });

    it('❌ throws ForbiddenException when manager tries to deactivate themselves', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockManager);

      await expect(service.removeTeamMember(MANAGER_ID, MANAGER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('❌ throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.removeTeamMember('bad-id', MANAGER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── resetPassword ──────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('✅ returns a 16-char temp password and invalidates the refresh token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockMember);
      mockPrisma.user.update.mockResolvedValue(mockMember);

      const result = await service.resetPassword(MEMBER_ID);

      expect(result).toHaveProperty('tempPassword');
      expect(typeof result.tempPassword).toBe('string');
      expect(result.tempPassword).toHaveLength(16);

      // Verify the stored password is a valid bcrypt hash of the returned temp password
      const storedHash = mockPrisma.user.update.mock.calls[0][0].data.password;
      const matches = await bcrypt.compare(result.tempPassword, storedHash);
      expect(matches).toBe(true);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ refreshToken: null }) }),
      );
    });

    it('❌ throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
