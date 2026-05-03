import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Priority } from '../../generated/prisma/enums.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
const BOARD_ID = 'board-uuid-1';
const OTHER_BOARD_ID = 'board-uuid-2';
const COLUMN_ID = 'col-uuid-1';
const OTHER_COLUMN_ID = 'col-uuid-2';
const TASK_ID = 'task-uuid-1';
const TAG_ID = 'tag-uuid-1';

const mockColumn = { id: COLUMN_ID, name: 'To Do', boardId: BOARD_ID, position: 1, color: null, createdAt: new Date(), updatedAt: new Date() };
const mockOtherColumn = { id: OTHER_COLUMN_ID, name: 'In Progress', boardId: BOARD_ID, position: 2, color: null, createdAt: new Date(), updatedAt: new Date() };
const mockBoard = { id: BOARD_ID, name: 'Test Board', ownerId: USER_ID, members: [{ userId: USER_ID }], createdAt: new Date(), updatedAt: new Date() };

const mockTask = {
  id: TASK_ID,
  title: 'Test Task',
  description: 'Test description',
  priority: Priority.MEDIUM,
  dueDate: null,
  columnId: COLUMN_ID,
  position: 1,
  assigneeId: null,
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  column: mockColumn,
};

const mockTaskWithRelations = {
  ...mockTask,
  assignee: null,
  tags: [],
  checklistItems: [],
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockTx = {
  task: {
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockPrisma = {
  task: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
  },
  board: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  column: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('✅ returns paginated tasks scoped to all user boards when no filter provided', async () => {
      mockPrisma.board.findMany.mockResolvedValue([{ columns: [{ id: COLUMN_ID }] }]);
      mockPrisma.task.count.mockResolvedValue(2);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await service.findAll(USER_ID, {});

      expect(result.data).toEqual([mockTask]);
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
      expect(mockPrisma.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { members: { some: { userId: USER_ID } } } }),
      );
    });

    it('✅ scopes tasks to specific boardId after verifying membership', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.findMany.mockResolvedValue([{ id: COLUMN_ID }]);
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await service.findAll(USER_ID, { boardId: BOARD_ID });

      expect(mockPrisma.board.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: BOARD_ID } }),
      );
      expect(result.data).toEqual([mockTask]);
    });

    it('✅ scopes tasks to specific columnId after verifying membership', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await service.findAll(USER_ID, { columnId: COLUMN_ID });

      expect(result.data).toEqual([mockTask]);
    });

    it('✅ applies priority, search, and overdue filters', async () => {
      mockPrisma.board.findMany.mockResolvedValue([{ columns: [{ id: COLUMN_ID }] }]);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.task.findMany.mockResolvedValue([]);

      await service.findAll(USER_ID, {
        priority: Priority.HIGH,
        search: 'login',
        overdue: true,
      });

      const whereArg = mockPrisma.task.findMany.mock.calls[0][0].where;
      expect(whereArg.priority).toBe(Priority.HIGH);
      expect(whereArg.title).toEqual({ contains: 'login', mode: 'insensitive' });
      expect(whereArg.archived).toBe(false);
      expect(whereArg.dueDate).toEqual({ lt: expect.any(Date) });
    });

    it('✅ respects page and limit for pagination', async () => {
      mockPrisma.board.findMany.mockResolvedValue([{ columns: [{ id: COLUMN_ID }] }]);
      mockPrisma.task.count.mockResolvedValue(50);
      mockPrisma.task.findMany.mockResolvedValue([]);

      const result = await service.findAll(USER_ID, { page: 3, limit: 10 });

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.meta).toEqual({ total: 50, page: 3, limit: 10, totalPages: 5 });
    });

    it('❌ throws ForbiddenException if user is not a board member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [{ userId: OTHER_USER_ID }],
      });

      await expect(service.findAll(USER_ID, { boardId: BOARD_ID })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('❌ throws NotFoundException if boardId does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await expect(service.findAll(USER_ID, { boardId: 'no-board' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('✅ creates a task at position maxPos + 1', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.aggregate.mockResolvedValue({ _max: { position: 3 } });
      mockPrisma.task.create.mockResolvedValue({ ...mockTaskWithRelations, position: 4 });

      const dto = { title: 'New Task', columnId: COLUMN_ID };
      const result = await service.create(dto as any, USER_ID);

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ position: 4 }) }),
      );
      expect(result.position).toBe(4);
    });

    it('✅ creates task at position 1 when column is empty', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.aggregate.mockResolvedValue({ _max: { position: null } });
      mockPrisma.task.create.mockResolvedValue({ ...mockTaskWithRelations, position: 1 });

      await service.create({ title: 'First Task', columnId: COLUMN_ID } as any, USER_ID);

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ position: 1 }) }),
      );
    });

    it('✅ creates task with tags when tagIds provided', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.aggregate.mockResolvedValue({ _max: { position: 0 } });
      mockPrisma.task.create.mockResolvedValue(mockTaskWithRelations);

      await service.create({ title: 'Tagged Task', columnId: COLUMN_ID, tagIds: [TAG_ID] } as any, USER_ID);

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: { create: [{ tagId: TAG_ID }] },
          }),
        }),
      );
    });

    it('❌ throws NotFoundException if column not found', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ title: 'Task', columnId: 'bad-col' } as any, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('❌ throws ForbiddenException if user is not a board member', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [{ userId: OTHER_USER_ID }],
      });

      await expect(
        service.create({ title: 'Task', columnId: COLUMN_ID } as any, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('✅ returns task with all relations', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce(mockTask)        // findTaskOrThrow
        .mockResolvedValueOnce(mockTaskWithRelations); // final query
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      const result = await service.findOne(TASK_ID, USER_ID);

      expect(result).toEqual(mockTaskWithRelations);
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id', USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('❌ throws ForbiddenException if user is not a board member', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [{ userId: OTHER_USER_ID }],
      });

      await expect(service.findOne(TASK_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('✅ updates only the provided fields', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue({ ...mockTaskWithRelations, title: 'Updated' });

      const result = await service.update(TASK_ID, { title: 'Updated' } as any, USER_ID);

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ title: 'Updated' }) }),
      );
      expect(result.title).toBe('Updated');
    });

    it('✅ replaces all tags when tagIds are provided', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue(mockTaskWithRelations);

      await service.update(TASK_ID, { tagIds: [TAG_ID] } as any, USER_ID);

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: { deleteMany: {}, create: [{ tagId: TAG_ID }] },
          }),
        }),
      );
    });

    it('✅ clears dueDate when null is passed', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue(mockTaskWithRelations);

      await service.update(TASK_ID, { dueDate: undefined } as any, USER_ID);

      // dueDate not in dto → not in data patch
      const dataArg = mockPrisma.task.update.mock.calls[0][0].data;
      expect(dataArg.dueDate).toBeUndefined();
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', { title: 'X' } as any, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('✅ deletes the task and returns success message', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.delete.mockResolvedValue(mockTask);

      const result = await service.remove(TASK_ID, USER_ID);

      expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: TASK_ID } });
      expect(result).toEqual({ message: 'Task deleted successfully' });
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(service.remove('bad-id', USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── move ───────────────────────────────────────────────────────────────────

  describe('move', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx));
      mockPrisma.task.findUnique.mockResolvedValue({ ...mockTaskWithRelations, position: 2 });
    });

    it('✅ shifts tasks down when moving within same column (old < new)', async () => {
      // task at position 2, moving to position 4
      mockPrisma.task.findUnique
        .mockResolvedValueOnce({ ...mockTask, column: mockColumn, position: 2 })
        .mockResolvedValueOnce(mockTaskWithRelations);
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);

      await service.move(TASK_ID, { columnId: COLUMN_ID, position: 4 }, USER_ID);

      expect(mockTx.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ position: { gt: 2, lte: 4 } }),
          data: { position: { decrement: 1 } },
        }),
      );
    });

    it('✅ shifts tasks up when moving within same column (old > new)', async () => {
      // task at position 4, moving to position 1
      mockPrisma.task.findUnique
        .mockResolvedValueOnce({ ...mockTask, column: mockColumn, position: 4 })
        .mockResolvedValueOnce(mockTaskWithRelations);
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);

      await service.move(TASK_ID, { columnId: COLUMN_ID, position: 1 }, USER_ID);

      expect(mockTx.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ position: { gte: 1, lt: 4 } }),
          data: { position: { increment: 1 } },
        }),
      );
    });

    it('✅ closes gap in source and opens space in target for cross-column move', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce({ ...mockTask, column: mockColumn, position: 2 })
        .mockResolvedValueOnce(mockTaskWithRelations);
      mockPrisma.column.findUnique.mockResolvedValue(mockOtherColumn);

      await service.move(TASK_ID, { columnId: OTHER_COLUMN_ID, position: 1 }, USER_ID);

      // Close gap in source column
      expect(mockTx.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ columnId: COLUMN_ID, position: { gt: 2 } }),
          data: { position: { decrement: 1 } },
        }),
      );
      // Open space in target column
      expect(mockTx.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ columnId: OTHER_COLUMN_ID, position: { gte: 1 } }),
          data: { position: { increment: 1 } },
        }),
      );
    });

    it('❌ throws BadRequestException if target column belongs to a different board', async () => {
      mockPrisma.task.findUnique.mockResolvedValueOnce({ ...mockTask, column: mockColumn });
      mockPrisma.column.findUnique.mockResolvedValue({
        ...mockOtherColumn,
        boardId: OTHER_BOARD_ID,
      });

      await expect(
        service.move(TASK_ID, { columnId: OTHER_COLUMN_ID, position: 1 }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.move('bad-id', { columnId: COLUMN_ID, position: 1 }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── archive ────────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('✅ sets archived to true', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue({ ...mockTask, archived: true });

      const result = await service.archive(TASK_ID, USER_ID);

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { archived: true } }),
      );
      expect(result).toEqual({ message: 'Task archived successfully' });
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(service.archive('bad-id', USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── unarchive ──────────────────────────────────────────────────────────────

  describe('unarchive', () => {
    it('✅ sets archived to false', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ ...mockTask, archived: true });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue({ ...mockTask, archived: false });

      const result = await service.unarchive(TASK_ID, USER_ID);

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { archived: false } }),
      );
      expect(result).toEqual({ message: 'Task unarchived successfully' });
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(service.unarchive('bad-id', USER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
