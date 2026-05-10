import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Priority } from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class TasksQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async assertBoardMember(boardId: string, userId: string) {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: { members: true },
    });
    if (!board) throw new NotFoundException(`Board "${boardId}" not found`);
    if (!board.members.some((m) => m.userId === userId))
      throw new ForbiddenException('You are not a member of this board');
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
    const orderBy = {
      [field]: dir === 'asc' ? 'asc' : 'desc',
    } as Prisma.TaskOrderByWithRelationInput;

    const [total, tasks] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          assignee: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          tags: { include: { tag: true } },
          checklistItems: { orderBy: { position: 'asc' } },
        },
      }),
    ]);

    return {
      data: tasks,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── GET /tasks/:id ────────────────────────────────────────────────────────────

  async findOne(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { column: true },
    });
    if (!task) throw new NotFoundException(`Task "${id}" not found`);
    await this.assertBoardMember(task.column.boardId, userId);

    return this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        tags: { include: { tag: true } },
        checklistItems: { orderBy: { position: 'asc' } },
      },
    });
  }
}
