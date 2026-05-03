import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BoardsService } from './boards.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-uuid-1';
const MEMBER_ID = 'member-uuid-1';
const OTHER_USER_ID = 'other-uuid-1';
const BOARD_ID = 'board-uuid-1';

const mockBoard = {
  id: BOARD_ID,
  name: 'Sprint Board',
  ownerId: OWNER_ID,
  members: [{ userId: OWNER_ID }, { userId: MEMBER_ID }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockBoardWithCount = {
  ...mockBoard,
  _count: { members: 2 },
};

const mockMemberUser = {
  id: MEMBER_ID,
  email: 'member@example.com',
  name: 'Member',
  avatarUrl: null,
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('BoardsService', () => {
  let service: BoardsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BoardsService>(BoardsService);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('✅ returns all boards the user owns or is a member of', async () => {
      mockPrisma.board.findMany.mockResolvedValue([mockBoardWithCount]);

      const result = await service.findAll(OWNER_ID);

      expect(mockPrisma.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ ownerId: OWNER_ID }, { members: { some: { userId: OWNER_ID } } }] },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: BOARD_ID, name: 'Sprint Board', memberCount: 2 });
    });

    it('✅ returns empty array when user has no boards', async () => {
      mockPrisma.board.findMany.mockResolvedValue([]);

      const result = await service.findAll('lonely-user');

      expect(result).toEqual([]);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('✅ creates a board and adds creator as the first member', async () => {
      mockPrisma.board.create.mockResolvedValue(mockBoardWithCount);

      const result = await service.create({ name: 'Sprint Board' }, OWNER_ID);

      expect(mockPrisma.board.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Sprint Board',
            ownerId: OWNER_ID,
            members: { create: { userId: OWNER_ID } },
          }),
        }),
      );
      expect(result).toMatchObject({ id: BOARD_ID, ownerId: OWNER_ID });
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('✅ returns board detail with columns and members for a board member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [{ userId: OWNER_ID, joinedAt: new Date(), user: { id: OWNER_ID, name: 'Owner', email: 'o@x.com', avatarUrl: null } }],
        columns: [],
      });

      const result = await service.findOne(BOARD_ID, OWNER_ID);

      expect(result).toMatchObject({ id: BOARD_ID, columns: [], members: expect.any(Array) });
    });

    it('❌ throws NotFoundException when board does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id', OWNER_ID)).rejects.toThrow(NotFoundException);
    });

    it('❌ throws ForbiddenException when user is not a board member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [{ userId: OWNER_ID, joinedAt: new Date(), user: {} }],
        columns: [],
      });

      await expect(service.findOne(BOARD_ID, OTHER_USER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('✅ renames the board (owner only)', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.board.update.mockResolvedValue({ ...mockBoardWithCount, name: 'New Name' });

      const result = await service.update(BOARD_ID, { name: 'New Name' }, OWNER_ID);

      expect(mockPrisma.board.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'New Name' } }),
      );
      expect(result.name).toBe('New Name');
    });

    it('❌ throws ForbiddenException when a non-owner tries to update', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(service.update(BOARD_ID, { name: 'Hack' }, MEMBER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('❌ throws NotFoundException when board does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', { name: 'X' }, OWNER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('✅ deletes the board and returns success message', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.board.delete.mockResolvedValue(mockBoard);

      const result = await service.remove(BOARD_ID, OWNER_ID);

      expect(mockPrisma.board.delete).toHaveBeenCalledWith({ where: { id: BOARD_ID } });
      expect(result).toEqual({ message: 'Board deleted successfully' });
    });

    it('❌ throws ForbiddenException when a non-owner tries to delete', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(service.remove(BOARD_ID, MEMBER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('❌ throws NotFoundException when board does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id', OWNER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── addMember ──────────────────────────────────────────────────────────────

  describe('addMember', () => {
    it('✅ adds a new member by email', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.user.findUnique.mockResolvedValue(mockMemberUser);
      // not already a member
      mockPrisma.board.findUnique.mockResolvedValueOnce({
        ...mockBoard,
        members: [{ userId: OWNER_ID }],
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce({ ...mockMemberUser, id: OTHER_USER_ID });
      mockPrisma.boardMember.create.mockResolvedValue({});

      const result = await service.addMember(BOARD_ID, 'other@example.com', OWNER_ID);

      expect(mockPrisma.boardMember.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ boardId: BOARD_ID }) }),
      );
      expect(result.message).toContain('added to the board');
    });

    it('❌ throws ForbiddenException when non-owner tries to add a member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(service.addMember(BOARD_ID, 'x@example.com', MEMBER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('❌ throws NotFoundException when the target user email does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.addMember(BOARD_ID, 'nobody@example.com', OWNER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ throws ConflictException when user is already a member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard); // MEMBER_ID already in members
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockMemberUser, id: MEMBER_ID });

      await expect(
        service.addMember(BOARD_ID, mockMemberUser.email, OWNER_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── removeMember ───────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('✅ removes a member from the board', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard); // MEMBER_ID is in members
      mockPrisma.boardMember.delete.mockResolvedValue({});

      const result = await service.removeMember(BOARD_ID, MEMBER_ID, OWNER_ID);

      expect(mockPrisma.boardMember.delete).toHaveBeenCalledWith({
        where: { boardId_userId: { boardId: BOARD_ID, userId: MEMBER_ID } },
      });
      expect(result).toEqual({ message: 'Member removed from the board' });
    });

    it('❌ throws ForbiddenException when non-owner tries to remove a member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(service.removeMember(BOARD_ID, OWNER_ID, MEMBER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('❌ throws ForbiddenException when trying to remove the board owner', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(service.removeMember(BOARD_ID, OWNER_ID, OWNER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('❌ throws NotFoundException when target user is not a board member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [{ userId: OWNER_ID }], // OTHER_USER_ID is not a member
      });

      await expect(service.removeMember(BOARD_ID, OTHER_USER_ID, OWNER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
