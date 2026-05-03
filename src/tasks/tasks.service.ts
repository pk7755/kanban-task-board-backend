import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { MoveTaskDto } from './dto/move-task.dto.js';
import { Priority } from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async findTaskOrThrow(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { column: true },
    });
    if (!task) throw new NotFoundException(`Task "${id}" not found`);
    return task;
  }

  private async assertBoardMember(boardId: string, userId: string) {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: { members: true },
    });
    if (!board) throw new NotFoundException(`Board "${boardId}" not found`);
    const isMember = board.members.some((m) => m.userId === userId);
    if (!isMember) throw new ForbiddenException('You are not a member of this board');
    return board;
  }

  private async findColumnOrThrow(id: string) {
    const column = await this.prisma.column.findUnique({ where: { id } });
    if (!column) throw new NotFoundException(`Column "${id}" not found`);
    return column;
  }

  // ── GET /tasks ────────────────────────────────────────────────────────────────

  async findAll(
    userId: string,
    query: {
      boardId?: string;
      columnId?: string;
      priority?: Priority;
      assigneeId?: string;
      tagIds?: string[];
      search?: string;
      dueBefore?: string;
      dueAfter?: string;
      overdue?: boolean;
      page?: number;
      limit?: number;
      sort?: string;
    },
  ) {
    const {
      boardId,
      columnId,
      priority,
      assigneeId,
      tagIds,
      search,
      dueBefore,
      dueAfter,
      overdue,
      page = 1,
      limit = 20,
      sort = 'createdAt:desc',
    } = query;

    // Resolve which columns the user can access
    let allowedColumnIds: string[] | undefined;

    if (columnId) {
      const column = await this.findColumnOrThrow(columnId);
      await this.assertBoardMember(column.boardId, userId);
      allowedColumnIds = [columnId];
    } else if (boardId) {
      await this.assertBoardMember(boardId, userId);
      const columns = await this.prisma.column.findMany({
        where: { boardId },
        select: { id: true },
      });
      allowedColumnIds = columns.map((c) => c.id);
    } else {
      // Scope to all boards the user is a member of
      const boards = await this.prisma.board.findMany({
        where: { members: { some: { userId } } },
        select: { columns: { select: { id: true } } },
      });
      allowedColumnIds = boards.flatMap((b) => b.columns.map((c) => c.id));
    }

    const where: Prisma.TaskWhereInput = {
      columnId: { in: allowedColumnIds },
      ...(priority && { priority }),
      ...(assigneeId && { assigneeId }),
      ...(tagIds?.length && { tags: { some: { tagId: { in: tagIds } } } }),
      ...(search && { title: { contains: search, mode: 'insensitive' } }),
      ...(overdue
        ? { dueDate: { lt: new Date() }, archived: false }
        : {
            ...(dueBefore && { dueDate: { lte: new Date(dueBefore) } }),
            ...(dueAfter && { dueDate: { gte: new Date(dueAfter) } }),
          }),
    };

    const [field, dir] = sort.split(':');
    const orderBy = { [field]: dir === 'asc' ? 'asc' : 'desc' } as Prisma.TaskOrderByWithRelationInput;

    const [total, tasks] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          tags: { include: { tag: true } },
          _count: { select: { checklistItems: true } },
        },
      }),
    ]);

    return {
      data: tasks,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── POST /tasks ───────────────────────────────────────────────────────────────

  async create(dto: CreateTaskDto, userId: string) {
    const column = await this.findColumnOrThrow(dto.columnId);
    await this.assertBoardMember(column.boardId, userId);

    const maxPos = await this.prisma.task.aggregate({
      where: { columnId: dto.columnId },
      _max: { position: true },
    });
    const position = (maxPos._max.position ?? 0) + 1;

    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        columnId: dto.columnId,
        position,
        assigneeId: dto.assigneeId,
        ...(dto.tagIds?.length && {
          tags: { create: dto.tagIds.map((tagId) => ({ tagId })) },
        }),
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        tags: { include: { tag: true } },
      },
    });
  }

  // ── GET /tasks/:id ────────────────────────────────────────────────────────────

  async findOne(id: string, userId: string) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);

    return this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        tags: { include: { tag: true } },
        checklistItems: { orderBy: { position: 'asc' } },
      },
    });
  }

  // ── PATCH /tasks/:id ──────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateTaskDto, userId: string) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);

    // If moving to a different column, validate target column membership
    if (dto.columnId && dto.columnId !== task.columnId) {
      await this.findColumnOrThrow(dto.columnId);
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.columnId !== undefined && { columnId: dto.columnId }),
        ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
        ...(dto.tagIds !== undefined && {
          tags: {
            deleteMany: {},
            create: dto.tagIds.map((tagId) => ({ tagId })),
          },
        }),
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        tags: { include: { tag: true } },
      },
    });
  }

  // ── DELETE /tasks/:id ─────────────────────────────────────────────────────────

  async remove(id: string, userId: string) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);

    await this.prisma.task.delete({ where: { id } });
    return { message: 'Task deleted successfully' };
  }

  // ── PATCH /tasks/:id/move ─────────────────────────────────────────────────────

  async move(id: string, dto: MoveTaskDto, userId: string) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);

    const targetColumn = await this.findColumnOrThrow(dto.columnId);

    // Ensure target column belongs to the same board
    if (targetColumn.boardId !== task.column.boardId) {
      throw new BadRequestException('Target column must be on the same board');
    }

    await this.prisma.$transaction(async (tx) => {
      const isSameColumn = task.columnId === dto.columnId;
      const oldPosition = task.position;
      const newPosition = dto.position;

      if (isSameColumn) {
        if (oldPosition < newPosition) {
          // Shift tasks between old and new position up
          await tx.task.updateMany({
            where: {
              columnId: dto.columnId,
              id: { not: id },
              position: { gt: oldPosition, lte: newPosition },
            },
            data: { position: { decrement: 1 } },
          });
        } else if (oldPosition > newPosition) {
          // Shift tasks between new and old position down
          await tx.task.updateMany({
            where: {
              columnId: dto.columnId,
              id: { not: id },
              position: { gte: newPosition, lt: oldPosition },
            },
            data: { position: { increment: 1 } },
          });
        }
      } else {
        // Close the gap in the source column
        await tx.task.updateMany({
          where: { columnId: task.columnId, position: { gt: oldPosition } },
          data: { position: { decrement: 1 } },
        });
        // Open space in the target column
        await tx.task.updateMany({
          where: { columnId: dto.columnId, position: { gte: newPosition } },
          data: { position: { increment: 1 } },
        });
      }

      await tx.task.update({
        where: { id },
        data: { columnId: dto.columnId, position: newPosition },
      });
    });

    return this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        tags: { include: { tag: true } },
      },
    });
  }

  // ── POST /tasks/:id/archive ───────────────────────────────────────────────────

  async archive(id: string, userId: string) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);

    await this.prisma.task.update({ where: { id }, data: { archived: true } });
    return { message: 'Task archived successfully' };
  }

  // ── POST /tasks/:id/unarchive ─────────────────────────────────────────────────

  async unarchive(id: string, userId: string) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);

    await this.prisma.task.update({ where: { id }, data: { archived: false } });
    return { message: 'Task unarchived successfully' };
  }
}

