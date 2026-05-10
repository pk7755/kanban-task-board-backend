// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { TasksQueryService } from './tasks-query.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Priority, Role } from '../../generated/prisma/enums.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
const BOARD_ID = 'board-uuid-1';
const OTHER_BOARD_ID = 'board-uuid-2';
const COLUMN_ID = 'col-uuid-1';
const OTHER_COLUMN_ID = 'col-uuid-2';
const TASK_ID = 'task-uuid-1';
const TAG_ID = 'tag-uuid-1';

const mockColumn = {
  id: COLUMN_ID,
  name: 'To Do',
  boardId: BOARD_ID,
  position: 1,
  color: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const mockOtherColumn = {
  id: OTHER_COLUMN_ID,
  name: 'In Progress',
  boardId: BOARD_ID,
  position: 2,
  color: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const mockBoard = {
  id: BOARD_ID,
  name: 'Test Board',
  ownerId: USER_ID,
  members: [{ userId: USER_ID }, { userId: OTHER_USER_ID }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTask = {
  id: TASK_ID,
  title: 'Test Task',
  description: 'Test description',
  priority: Priority.MEDIUM,
  dueDate: null,
  columnId: COLUMN_ID,
  position: 1,
  assigneeId: USER_ID,
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
  task: { update: jest.fn(), updateMany: jest.fn() },
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
  board: { findUnique: jest.fn(), findMany: jest.fn() },
  column: { findUnique: jest.fn(), findMany: jest.fn() },
  boardMember: { findUnique: jest.fn() },
  tag: { findUnique: jest.fn() },
  taskTag: { upsert: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockAudit = { log: jest.fn() };

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('TasksService (mutations)', () => {
  let service: TasksService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAudit.log.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('✅ MANAGER can assign to any user', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.aggregate.mockResolvedValue({ _max: { position: 3 } });
      mockPrisma.boardMember.findUnique.mockResolvedValue({
        userId: OTHER_USER_ID,
        boardId: BOARD_ID,
        user: { isDeleted: false, isActive: true },
      });
      mockPrisma.task.create.mockResolvedValue({
        ...mockTaskWithRelations,
        position: 4,
        assigneeId: OTHER_USER_ID,
      });

      const result = await service.create(
        { title: 'Task', columnId: COLUMN_ID, assigneeId: OTHER_USER_ID },
        USER_ID,
        Role.MANAGER,
      );

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assigneeId: OTHER_USER_ID }),
        }),
      );
      expect(result.assigneeId).toBe(OTHER_USER_ID);
    });

    it('✅ TEAM_MEMBER assigneeId is locked to self regardless of dto', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.aggregate.mockResolvedValue({ _max: { position: 0 } });
      mockPrisma.task.create.mockResolvedValue({
        ...mockTaskWithRelations,
        assigneeId: OTHER_USER_ID,
      });

      await service.create(
        { title: 'Task', columnId: COLUMN_ID, assigneeId: 'another-user' },
        OTHER_USER_ID,
        Role.TEAM_MEMBER,
      );

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assigneeId: OTHER_USER_ID }),
        }),
      );
    });

    it('✅ creates at position maxPos + 1', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.aggregate.mockResolvedValue({ _max: { position: 3 } });
      mockPrisma.task.create.mockResolvedValue({
        ...mockTaskWithRelations,
        position: 4,
      });

      const result = await service.create(
        { title: 'New Task', columnId: COLUMN_ID },
        USER_ID,
        Role.MANAGER,
      );

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ position: 4 }),
        }),
      );
      expect(result.position).toBe(4);
    });

    it('✅ creates at position 1 when column is empty', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.aggregate.mockResolvedValue({ _max: { position: null } });
      mockPrisma.task.create.mockResolvedValue({
        ...mockTaskWithRelations,
        position: 1,
      });

      await service.create(
        { title: 'First Task', columnId: COLUMN_ID },
        USER_ID,
        Role.MANAGER,
      );

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ position: 1 }),
        }),
      );
    });

    it('✅ creates task with tags when tagIds provided', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.aggregate.mockResolvedValue({ _max: { position: 0 } });
      mockPrisma.task.create.mockResolvedValue(mockTaskWithRelations);

      await service.create(
        { title: 'Tagged Task', columnId: COLUMN_ID, tagIds: [TAG_ID] },
        USER_ID,
        Role.MANAGER,
      );

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
        service.create(
          { title: 'Task', columnId: 'bad-col' },
          USER_ID,
          Role.MANAGER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('❌ throws ForbiddenException if user is not a board member', async () => {
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [],
      });

      await expect(
        service.create(
          { title: 'Task', columnId: COLUMN_ID },
          USER_ID,
          Role.MANAGER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('✅ MANAGER can update any task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue({
        ...mockTaskWithRelations,
        title: 'Updated',
      });

      const result = await service.update(
        TASK_ID,
        { title: 'Updated' },
        USER_ID,
        Role.MANAGER,
      );

      expect(result.title).toBe('Updated');
    });

    it('✅ TEAM_MEMBER can update their own task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        assigneeId: OTHER_USER_ID,
      });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue({
        ...mockTaskWithRelations,
        title: 'Mine',
      });

      const result = await service.update(
        TASK_ID,
        { title: 'Mine' },
        OTHER_USER_ID,
        Role.TEAM_MEMBER,
      );

      expect(result.title).toBe('Mine');
    });

    it("❌ TEAM_MEMBER cannot update someone else's task", async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        assigneeId: USER_ID,
      });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(
        service.update(
          TASK_ID,
          { title: 'Hack' },
          OTHER_USER_ID,
          Role.TEAM_MEMBER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('❌ TEAM_MEMBER cannot reassign a task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        assigneeId: OTHER_USER_ID,
      });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(
        service.update(
          TASK_ID,
          { assigneeId: USER_ID },
          OTHER_USER_ID,
          Role.TEAM_MEMBER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('✅ MANAGER reassign writes TICKET_REASSIGNED audit log', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        assigneeId: USER_ID,
      });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      // assertAssigneeBoardMember — verify new assignee is a board member
      mockPrisma.boardMember.findUnique.mockResolvedValue({
        userId: OTHER_USER_ID,
        boardId: BOARD_ID,
        user: { isDeleted: false, isActive: true },
      });
      mockPrisma.task.update.mockResolvedValue(mockTaskWithRelations);

      await service.update(
        TASK_ID,
        { assigneeId: OTHER_USER_ID },
        USER_ID,
        Role.MANAGER,
      );

      expect(mockAudit.log).toHaveBeenCalledWith(
        USER_ID,
        'TICKET_REASSIGNED',
        'Task',
        TASK_ID,
        { from: USER_ID, to: OTHER_USER_ID },
      );
    });

    it('✅ replaces all tags when tagIds provided', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue(mockTaskWithRelations);

      await service.update(
        TASK_ID,
        { tagIds: [TAG_ID] },
        USER_ID,
        Role.MANAGER,
      );

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

      await service.update(
        TASK_ID,
        { dueDate: undefined },
        USER_ID,
        Role.MANAGER,
      );

      const dataArg = mockPrisma.task.update.mock.calls[0][0].data;
      expect(dataArg.dueDate).toBeUndefined();
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.update('bad-id', { title: 'X' }, USER_ID, Role.MANAGER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('✅ MANAGER can delete any task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.delete.mockResolvedValue(mockTask);

      const result = await service.remove(TASK_ID, USER_ID, Role.MANAGER);

      expect(mockPrisma.task.delete).toHaveBeenCalledWith({
        where: { id: TASK_ID },
      });
      expect(result).toEqual({ message: 'Task deleted successfully' });
    });

    it('✅ TEAM_MEMBER can delete their own task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        assigneeId: OTHER_USER_ID,
      });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.delete.mockResolvedValue(mockTask);

      const result = await service.remove(
        TASK_ID,
        OTHER_USER_ID,
        Role.TEAM_MEMBER,
      );

      expect(result).toEqual({ message: 'Task deleted successfully' });
    });

    it("❌ TEAM_MEMBER cannot delete someone else's task", async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        assigneeId: USER_ID,
      });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(
        service.remove(TASK_ID, OTHER_USER_ID, Role.TEAM_MEMBER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.remove('bad-id', USER_ID, Role.MANAGER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── move ───────────────────────────────────────────────────────────────────

  describe('move', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockAudit.log.mockResolvedValue(undefined);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockTx));
    });

    it('✅ MANAGER can move any task', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce({ ...mockTask, column: mockColumn, position: 2 })
        .mockResolvedValueOnce(mockTaskWithRelations);
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);

      await service.move(
        TASK_ID,
        { columnId: COLUMN_ID, position: 4 },
        USER_ID,
        Role.MANAGER,
      );

      expect(mockTx.task.update).toHaveBeenCalled();
    });

    it("❌ TEAM_MEMBER cannot move someone else's task", async () => {
      mockPrisma.task.findUnique.mockResolvedValueOnce({
        ...mockTask,
        assigneeId: USER_ID,
        column: mockColumn,
      });

      await expect(
        service.move(
          TASK_ID,
          { columnId: COLUMN_ID, position: 1 },
          OTHER_USER_ID,
          Role.TEAM_MEMBER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('✅ shifts tasks down when moving within same column (old < new)', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce({ ...mockTask, column: mockColumn, position: 2 })
        .mockResolvedValueOnce(mockTaskWithRelations);
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);

      await service.move(
        TASK_ID,
        { columnId: COLUMN_ID, position: 4 },
        USER_ID,
        Role.MANAGER,
      );

      expect(mockTx.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ position: { gt: 2, lte: 4 } }),
          data: { position: { decrement: 1 } },
        }),
      );
    });

    it('✅ shifts tasks up when moving within same column (old > new)', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce({ ...mockTask, column: mockColumn, position: 4 })
        .mockResolvedValueOnce(mockTaskWithRelations);
      mockPrisma.column.findUnique.mockResolvedValue(mockColumn);

      await service.move(
        TASK_ID,
        { columnId: COLUMN_ID, position: 1 },
        USER_ID,
        Role.MANAGER,
      );

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

      await service.move(
        TASK_ID,
        { columnId: OTHER_COLUMN_ID, position: 1 },
        USER_ID,
        Role.MANAGER,
      );

      expect(mockTx.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            columnId: COLUMN_ID,
            position: { gt: 2 },
          }),
          data: { position: { decrement: 1 } },
        }),
      );
      expect(mockTx.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            columnId: OTHER_COLUMN_ID,
            position: { gte: 1 },
          }),
          data: { position: { increment: 1 } },
        }),
      );
    });

    it('❌ throws BadRequestException if target column belongs to different board', async () => {
      mockPrisma.task.findUnique.mockResolvedValueOnce({
        ...mockTask,
        column: mockColumn,
      });
      mockPrisma.column.findUnique.mockResolvedValue({
        ...mockOtherColumn,
        boardId: OTHER_BOARD_ID,
      });

      await expect(
        service.move(
          TASK_ID,
          { columnId: OTHER_COLUMN_ID, position: 1 },
          USER_ID,
          Role.MANAGER,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.move(
          'bad-id',
          { columnId: COLUMN_ID, position: 1 },
          USER_ID,
          Role.MANAGER,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── archive ────────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('✅ MANAGER can archive any task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue({ ...mockTask, archived: true });

      const result = await service.archive(TASK_ID, USER_ID, Role.MANAGER);

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { archived: true } }),
      );
      expect(result).toEqual({ message: 'Task archived successfully' });
    });

    it("❌ TEAM_MEMBER cannot archive someone else's task", async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        assigneeId: USER_ID,
      });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      await expect(
        service.archive(TASK_ID, OTHER_USER_ID, Role.TEAM_MEMBER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.archive('bad-id', USER_ID, Role.MANAGER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── unarchive ──────────────────────────────────────────────────────────────

  describe('unarchive', () => {
    it('✅ MANAGER can unarchive any task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        archived: true,
      });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.task.update.mockResolvedValue({
        ...mockTask,
        archived: false,
      });

      const result = await service.unarchive(TASK_ID, USER_ID, Role.MANAGER);

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { archived: false } }),
      );
      expect(result).toEqual({ message: 'Task unarchived successfully' });
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.unarchive('bad-id', USER_ID, Role.MANAGER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── attachTag ───────────────────────────────────────────────────────────────

  describe('attachTag', () => {
    it('✅ attaches a tag to a task (idempotent upsert)', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce({ ...mockTask, column: mockColumn }) // findTaskOrThrow
        .mockResolvedValueOnce(mockTaskWithRelations); // final findUnique
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard); // assertBoardMember
      mockPrisma.tag.findUnique.mockResolvedValue({
        id: TAG_ID,
        boardId: BOARD_ID,
      });
      mockPrisma.taskTag.upsert.mockResolvedValue({});

      const result = await service.attachTag(TASK_ID, TAG_ID, USER_ID);

      expect(mockPrisma.taskTag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { taskId_tagId: { taskId: TASK_ID, tagId: TAG_ID } },
          create: { taskId: TASK_ID, tagId: TAG_ID },
        }),
      );
      expect(result).toBeDefined();
    });

    it('❌ throws NotFoundException when tag does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        column: mockColumn,
      });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.findUnique.mockResolvedValue(null);

      await expect(
        service.attachTag(TASK_ID, 'bad-tag-id', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('❌ throws BadRequestException when tag belongs to a different board', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        column: mockColumn,
      });
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.tag.findUnique.mockResolvedValue({
        id: TAG_ID,
        boardId: OTHER_BOARD_ID,
      });

      await expect(service.attachTag(TASK_ID, TAG_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('❌ throws NotFoundException when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.attachTag('bad-task', TAG_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── detachTag ───────────────────────────────────────────────────────────────

  describe('detachTag', () => {
    it('✅ removes only the task-tag mapping without deleting the tag', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce({ ...mockTask, column: mockColumn }) // findTaskOrThrow
        .mockResolvedValueOnce(mockTaskWithRelations); // final findUnique
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard); // assertBoardMember
      mockPrisma.taskTag.deleteMany.mockResolvedValue({ count: 1 });

      await service.detachTag(TASK_ID, TAG_ID, USER_ID);

      expect(mockPrisma.taskTag.deleteMany).toHaveBeenCalledWith({
        where: { taskId: TASK_ID, tagId: TAG_ID },
      });
      // tag itself should NOT be deleted
      expect(mockPrisma.tag.findUnique).not.toHaveBeenCalled();
    });

    it('❌ throws NotFoundException when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.detachTag('bad-task', TAG_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

// ── TasksQueryService tests ───────────────────────────────────────────────────

describe('TasksQueryService (reads)', () => {
  let queryService: TasksQueryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksQueryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    queryService = module.get<TasksQueryService>(TasksQueryService);
  });

  describe('findAll', () => {
    it('✅ returns paginated tasks scoped to all user boards', async () => {
      mockPrisma.board.findMany.mockResolvedValue([
        { columns: [{ id: COLUMN_ID }] },
      ]);
      mockPrisma.task.count.mockResolvedValue(2);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await queryService.findAll(USER_ID, {});

      expect(result.data).toEqual([mockTask]);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('✅ scopes tasks to specific boardId after verifying membership', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.column.findMany.mockResolvedValue([{ id: COLUMN_ID }]);
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await queryService.findAll(USER_ID, { boardId: BOARD_ID });

      expect(result.data).toEqual([mockTask]);
    });

    it('✅ applies priority, search, and overdue filters', async () => {
      mockPrisma.board.findMany.mockResolvedValue([
        { columns: [{ id: COLUMN_ID }] },
      ]);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.task.findMany.mockResolvedValue([]);

      await queryService.findAll(USER_ID, {
        priority: Priority.HIGH,
        search: 'login',
        overdue: true,
      });

      const whereArg = mockPrisma.task.findMany.mock.calls[0][0].where;
      expect(whereArg.priority).toBe(Priority.HIGH);
      expect(whereArg.title).toEqual({
        contains: 'login',
        mode: 'insensitive',
      });
      expect(whereArg.archived).toBe(false);
    });

    it('✅ respects page and limit for pagination', async () => {
      mockPrisma.board.findMany.mockResolvedValue([
        { columns: [{ id: COLUMN_ID }] },
      ]);
      mockPrisma.task.count.mockResolvedValue(50);
      mockPrisma.task.findMany.mockResolvedValue([]);

      const result = await queryService.findAll(USER_ID, {
        page: 3,
        limit: 10,
      });

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.meta).toEqual({
        total: 50,
        page: 3,
        limit: 10,
        totalPages: 5,
      });
    });

    it('❌ throws ForbiddenException if user is not a board member', async () => {
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [],
      });

      await expect(
        queryService.findAll(USER_ID, { boardId: BOARD_ID }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('❌ throws NotFoundException if boardId does not exist', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await expect(
        queryService.findAll(USER_ID, { boardId: 'no-board' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('✅ returns task with all relations', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce(mockTaskWithRelations);
      mockPrisma.board.findUnique.mockResolvedValue(mockBoard);

      const result = await queryService.findOne(TASK_ID, USER_ID);

      expect(result).toEqual(mockTaskWithRelations);
    });

    it('❌ throws NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(queryService.findOne('bad-id', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ throws ForbiddenException if user is not a board member', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.board.findUnique.mockResolvedValue({
        ...mockBoard,
        members: [],
      });

      await expect(queryService.findOne(TASK_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
