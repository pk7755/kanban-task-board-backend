// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ColumnsService } from './columns.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-uuid-1';
const NON_OWNER_ID = 'member-uuid-1';
const BOARD_ID = 'board-uuid-1';
const OTHER_BOARD_ID = 'board-uuid-2';
const COL_A = 'col-uuid-a';
const COL_B = 'col-uuid-b';

const mockBoard = {
  id: BOARD_ID,
  name: 'Test Board',
  ownerId: OWNER_ID,
  members: [{ userId: OWNER_ID }],
};

const mockColumnA = {
  id: COL_A,
  name: 'To Do',
  boardId: BOARD_ID,
  position: 1,
  color: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const mockColumnB = {
  id: COL_B,
  name: 'Done',
  boardId: BOARD_ID,
  position: 2,
  color: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  column: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
  },
  board: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ColumnsService', () => {
  let service: ColumnsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: array-based $transaction resolves all ops in parallel
    mockPrisma.$transaction.mockImplementation((ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ColumnsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ColumnsService>(ColumnsService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('✅ creates column at position maxPos + 1', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.aggregate.mockResolvedValue({ _max: { position: 2 } });
      mockPrisma.column.create.mockResolvedValue({
        ...mockColumnA,
        position: 3,
      });

      const result = await service.create(
        { name: 'In Progress', boardId: BOARD_ID },
        OWNER_ID,
      );

      expect(mockPrisma.column.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ position: 3 }),
        }),
      );
      expect(result.position).toBe(3);
    });

    it('✅ creates first column at position 1 when board is empty', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.aggregate.mockResolvedValue({
        _max: { position: null },
      });
      mockPrisma.column.create.mockResolvedValue({
        ...mockColumnA,
        position: 1,
      });

      await service.create({ name: 'To Do', boardId: BOARD_ID }, OWNER_ID);

      expect(mockPrisma.column.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ position: 1 }),
        }),
      );
    });

    it('✅ stores optional color when provided', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.aggregate.mockResolvedValue({ _max: { position: 0 } });
      mockPrisma.column.create.mockResolvedValue({
        ...mockColumnA,
        color: '#FF5733',
      });

      await service.create(
        { name: 'To Do', boardId: BOARD_ID, color: '#FF5733' },
        OWNER_ID,
      );

      const createData = mockPrisma.column.create.mock.calls[0][0].data;
      expect(createData.color).toBe('#FF5733');
    });

    it('❌ throws NotFoundException when board does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Col', boardId: 'bad-board' }, OWNER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('❌ throws ForbiddenException when requester is not the board owner', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(
        service.create({ name: 'Col', boardId: BOARD_ID }, NON_OWNER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('✅ updates column name', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumnA);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.update.mockResolvedValue({
        ...mockColumnA,
        name: 'Renamed',
      });

      const result = await service.update(COL_A, { name: 'Renamed' }, OWNER_ID);

      expect(mockPrisma.column.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Renamed' }),
        }),
      );
      expect(result.name).toBe('Renamed');
    });

    it('✅ updates color only when provided', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumnA);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.update.mockResolvedValue({
        ...mockColumnA,
        color: '#00FF00',
      });

      await service.update(COL_A, { color: '#00FF00' }, OWNER_ID);

      const updateData = mockPrisma.column.update.mock.calls[0][0].data;
      expect(updateData.color).toBe('#00FF00');
      expect(updateData.name).toBeUndefined();
    });

    it('✅ updates position when provided', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumnA);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.update.mockResolvedValue({
        ...mockColumnA,
        position: 5,
      });

      await service.update(COL_A, { position: 5 }, OWNER_ID);

      const updateData = mockPrisma.column.update.mock.calls[0][0].data;
      expect(updateData.position).toBe(5);
    });

    it('❌ throws NotFoundException when column does not exist', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(null);

      await expect(
        service.update('bad-col', { name: 'X' }, OWNER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('❌ throws ForbiddenException when requester is not the board owner', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumnA);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(
        service.update(COL_A, { name: 'Hack' }, NON_OWNER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('✅ deletes the column and returns success message', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumnA);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.delete.mockResolvedValue(mockColumnA);

      const result = await service.remove(COL_A, OWNER_ID);

      expect(mockPrisma.column.delete).toHaveBeenCalledWith({
        where: { id: COL_A },
      });
      expect(result).toEqual({ message: 'Column deleted successfully' });
    });

    it('❌ throws ForbiddenException when non-owner tries to delete', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumnA);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(service.remove(COL_A, NON_OWNER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('❌ throws NotFoundException when column does not exist', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-col', OWNER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── reorder ────────────────────────────────────────────────────────────────

  describe('reorder', () => {
    const validItems = [
      { id: COL_A, position: 2 },
      { id: COL_B, position: 1 },
    ];

    it('✅ reorders columns in a transaction', async () => {
      mockPrisma.column.findMany.mockResolvedValue([mockColumnA, mockColumnB]);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.update.mockResolvedValue(mockColumnA);

      const result = await service.reorder(validItems, OWNER_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Columns reordered successfully' });
    });

    it('✅ calls column.update for each item in the transaction', async () => {
      mockPrisma.column.findMany.mockResolvedValue([mockColumnA, mockColumnB]);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.update.mockResolvedValue(mockColumnA);

      await service.reorder(validItems, OWNER_ID);

      // $transaction receives an array of update promises — one per item
      const txArg = mockPrisma.$transaction.mock.calls[0][0];
      expect(Array.isArray(txArg)).toBe(true);
      expect(txArg).toHaveLength(2);
    });

    it('❌ throws BadRequestException for an empty items array', async () => {
      await expect(service.reorder([], OWNER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('❌ throws BadRequestException when there are duplicate column IDs', async () => {
      await expect(
        service.reorder(
          [
            { id: COL_A, position: 1 },
            { id: COL_A, position: 2 },
          ],
          OWNER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('❌ throws BadRequestException when there are duplicate positions', async () => {
      await expect(
        service.reorder(
          [
            { id: COL_A, position: 1 },
            { id: COL_B, position: 1 },
          ],
          OWNER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('❌ throws NotFoundException when one or more columns are not found', async () => {
      mockPrisma.column.findMany.mockResolvedValue([mockColumnA]); // only 1 returned, 2 requested

      await expect(service.reorder(validItems, OWNER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ throws BadRequestException when columns belong to different boards', async () => {
      mockPrisma.column.findMany.mockResolvedValue([
        mockColumnA,
        { ...mockColumnB, boardId: OTHER_BOARD_ID },
      ]);

      await expect(service.reorder(validItems, OWNER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('❌ throws ForbiddenException when requester is not the board owner', async () => {
      mockPrisma.column.findMany.mockResolvedValue([mockColumnA, mockColumnB]);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard); // OWNER_ID is owner

      await expect(service.reorder(validItems, NON_OWNER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
