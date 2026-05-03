// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChecklistService } from './checklist.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
const BOARD_ID = 'board-uuid-1';
const TASK_ID = 'task-uuid-1';
const ITEM_ID = 'item-uuid-1';

const mockTask = {
  id: TASK_ID,
  title: 'Test Task',
  columnId: 'col-uuid-1',
  column: {
    board: {
      id: BOARD_ID,
      members: [{ userId: USER_ID }],
    },
  },
};

const mockItem = {
  id: ITEM_ID,
  taskId: TASK_ID,
  text: 'Write tests',
  done: false,
  position: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockPrisma = {
  task: { findUnique: jest.fn() },
  checklistItem: {
    findUnique: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ChecklistService', () => {
  let service: ChecklistService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ChecklistService>(ChecklistService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('✅ creates a checklist item at next position', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.aggregate.mockResolvedValue({
        _max: { position: 2 },
      });
      mockPrisma.checklistItem.create.mockResolvedValue({
        ...mockItem,
        position: 3,
      });

      const result = await service.create(
        TASK_ID,
        { text: 'Write tests' },
        USER_ID,
      );

      expect(result.position).toBe(3);
      expect(mockPrisma.checklistItem.create).toHaveBeenCalledWith({
        data: { taskId: TASK_ID, text: 'Write tests', position: 3 },
      });
    });

    it('✅ assigns position 1 when checklist is empty', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.aggregate.mockResolvedValue({
        _max: { position: null },
      });
      mockPrisma.checklistItem.create.mockResolvedValue({
        ...mockItem,
        position: 1,
      });

      await service.create(TASK_ID, { text: 'First item' }, USER_ID);

      expect(mockPrisma.checklistItem.create).toHaveBeenCalledWith({
        data: { taskId: TASK_ID, text: 'First item', position: 1 },
      });
    });

    it('🚫 throws NotFoundException when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.create('bad-task-id', { text: 'Test' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('🚫 throws ForbiddenException when user is not a board member', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);

      await expect(
        service.create(TASK_ID, { text: 'Test' }, OTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('✅ updates text of a checklist item', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.update.mockResolvedValue({
        ...mockItem,
        text: 'Updated text',
      });

      const result = await service.update(
        ITEM_ID,
        { text: 'Updated text' },
        USER_ID,
      );

      expect(result.text).toBe('Updated text');
      expect(mockPrisma.checklistItem.update).toHaveBeenCalledWith({
        where: { id: ITEM_ID },
        data: { text: 'Updated text' },
      });
    });

    it('✅ marks a checklist item as done', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.update.mockResolvedValue({
        ...mockItem,
        done: true,
      });

      const result = await service.update(ITEM_ID, { done: true }, USER_ID);

      expect(result.done).toBe(true);
    });

    it('🚫 throws NotFoundException when item does not exist', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(null);

      await expect(
        service.update('bad-id', { text: 'x' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('🚫 throws ForbiddenException when user is not a board member', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);

      await expect(
        service.update(ITEM_ID, { done: true }, OTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('✅ deletes a checklist item and returns confirmation message', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.checklistItem.delete.mockResolvedValue(mockItem);

      const result = await service.remove(ITEM_ID, USER_ID);

      expect(result).toEqual({ message: 'Checklist item deleted' });
      expect(mockPrisma.checklistItem.delete).toHaveBeenCalledWith({
        where: { id: ITEM_ID },
      });
    });

    it('🚫 throws NotFoundException when item does not exist', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('🚫 throws ForbiddenException when user is not a board member', async () => {
      mockPrisma.checklistItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);

      await expect(service.remove(ITEM_ID, OTHER_USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
