// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TagsService } from './tags.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
const BOARD_ID = 'board-uuid-1';
const TAG_ID = 'tag-uuid-1';

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
  board: { findUnique: jest.fn() },
  tag: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('TagsService', () => {
  let service: TagsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('✅ returns all tags for a board', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.findMany.mockResolvedValue([mockTag]);

      const result = await service.findAll(BOARD_ID, USER_ID);

      expect(result).toEqual([mockTag]);
      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({
        where: { boardId: BOARD_ID },
      });
    });

    it('✅ returns empty array when board has no tags', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.findMany.mockResolvedValue([]);

      const result = await service.findAll(BOARD_ID, USER_ID);

      expect(result).toEqual([]);
    });

    it('🚫 throws NotFoundException when board does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await expect(service.findAll('bad-id', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('🚫 throws ForbiddenException when user is not a board member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(service.findAll(BOARD_ID, OTHER_USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('✅ creates and returns a tag', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.create.mockResolvedValue(mockTag);

      const result = await service.create(
        BOARD_ID,
        { name: 'Bug', color: '#FF5733' },
        USER_ID,
      );

      expect(result).toEqual(mockTag);
      expect(mockPrisma.tag.create).toHaveBeenCalledWith({
        data: { name: 'Bug', color: '#FF5733', boardId: BOARD_ID },
      });
    });

    it('🚫 throws NotFoundException when board does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await expect(
        service.create('bad-id', { name: 'Bug', color: '#FF5733' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('🚫 throws ForbiddenException when user is not a board member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(
        service.create(
          BOARD_ID,
          { name: 'Bug', color: '#FF5733' },
          OTHER_USER_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('✅ updates tag name', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(mockTag);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.update.mockResolvedValue({ ...mockTag, name: 'Feature' });

      const result = await service.update(TAG_ID, { name: 'Feature' }, USER_ID);

      expect(result.name).toBe('Feature');
      expect(mockPrisma.tag.update).toHaveBeenCalledWith({
        where: { id: TAG_ID },
        data: { name: 'Feature' },
      });
    });

    it('✅ updates tag color', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(mockTag);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.update.mockResolvedValue({ ...mockTag, color: '#33FF57' });

      const result = await service.update(
        TAG_ID,
        { color: '#33FF57' },
        USER_ID,
      );

      expect(result.color).toBe('#33FF57');
    });

    it('🚫 throws NotFoundException when tag does not exist', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(null);

      await expect(
        service.update('bad-id', { name: 'x' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('🚫 throws ForbiddenException when user is not a board member', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(mockTag);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(
        service.update(TAG_ID, { name: 'x' }, OTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('✅ deletes a tag and returns confirmation message', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(mockTag);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.delete.mockResolvedValue(mockTag);

      const result = await service.remove(TAG_ID, USER_ID);

      expect(result).toEqual({ message: 'Tag deleted' });
      expect(mockPrisma.tag.delete).toHaveBeenCalledWith({
        where: { id: TAG_ID },
      });
    });

    it('🚫 throws NotFoundException when tag does not exist', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('🚫 throws ForbiddenException when user is not a board member', async () => {
      mockPrisma.tag.findUnique.mockResolvedValue(mockTag);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(service.remove(TAG_ID, OTHER_USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
