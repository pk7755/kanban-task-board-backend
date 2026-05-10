import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { MoveTaskDto } from './dto/move-task.dto.js';
import { Role, AuditAction } from '../../generated/prisma/enums.js';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    if (!board.members.some((m) => m.userId === userId))
      throw new ForbiddenException('You are not a member of this board');
    return board;
  }

  /** Validate that the intended assignee is an active, non-deleted board member. */
  private async assertAssigneeBoardMember(boardId: string, assigneeId: string | null | undefined) {
    if (!assigneeId) return; // unassigned is always valid
    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: assigneeId } },
      include: { user: { select: { isDeleted: true, isActive: true } } },
    });
    if (!membership || membership.user.isDeleted || !membership.user.isActive) {
      throw new BadRequestException(
        'Assignee must be an active member of this board',
      );
    }
  }

  private async findColumnOrThrow(id: string) {
    const column = await this.prisma.column.findUnique({ where: { id } });
    if (!column) throw new NotFoundException(`Column "${id}" not found`);
    return column;
  }

  private assertTaskOwner(
    task: { assigneeId: string | null },
    userId: string,
    userRole: Role,
  ) {
    if (userRole === Role.TEAM_MEMBER && task.assigneeId !== userId)
      throw new ForbiddenException('You can only modify your own tasks');
  }

  // ── POST /tasks ───────────────────────────────────────────────────────────────

  async create(dto: CreateTaskDto, userId: string, userRole: Role) {
    const column = await this.findColumnOrThrow(dto.columnId);
    await this.assertBoardMember(column.boardId, userId);

    // Team members can only assign tasks to themselves
    const assigneeId = userRole === Role.TEAM_MEMBER ? userId : dto.assigneeId;

    // Managers: validate the chosen assignee is a board member
    if (userRole !== Role.TEAM_MEMBER) {
      await this.assertAssigneeBoardMember(column.boardId, assigneeId);
    }

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
        assigneeId,
        ...(dto.tagIds?.length && {
          tags: { create: dto.tagIds.map((tagId) => ({ tagId })) },
        }),
      },
      include: {
        assignee: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        tags: { include: { tag: true } },
        checklistItems: { orderBy: { position: 'asc' } },
      },
    });
  }

  // ── PATCH /tasks/:id ──────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateTaskDto, userId: string, userRole: Role) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);
    this.assertTaskOwner(task, userId, userRole);

    // Team members cannot reassign tasks
    if (userRole === Role.TEAM_MEMBER && dto.assigneeId !== undefined)
      throw new ForbiddenException('Team members cannot reassign tasks');

    // Managers: validate the chosen assignee is a board member
    if (userRole !== Role.TEAM_MEMBER && dto.assigneeId !== undefined) {
      await this.assertAssigneeBoardMember(task.column.boardId, dto.assigneeId);
    }

    if (dto.columnId && dto.columnId !== task.columnId)
      await this.findColumnOrThrow(dto.columnId);

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        }),
        ...(dto.columnId !== undefined && { columnId: dto.columnId }),
        ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
        ...(dto.tagIds !== undefined && {
          tags: {
            deleteMany: {},
            create: dto.tagIds.map((tagId) => ({ tagId })),
          },
        }),
        ...(dto.checklistItems !== undefined && {
          checklistItems: {
            deleteMany: {},
            create: dto.checklistItems.map((item, index) => ({
              text: item.text,
              done: item.done,
              position: item.position ?? index,
            })),
          },
        }),
      },
      include: {
        assignee: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        tags: { include: { tag: true } },
        checklistItems: { orderBy: { position: 'asc' } },
      },
    });

    if (dto.assigneeId !== undefined && dto.assigneeId !== task.assigneeId) {
      await this.audit.log(userId, AuditAction.TICKET_REASSIGNED, 'Task', id, {
        from: task.assigneeId,
        to: dto.assigneeId,
      });
    }

    return updated;
  }

  // ── DELETE /tasks/:id ─────────────────────────────────────────────────────────

  async remove(id: string, userId: string, userRole: Role) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);
    this.assertTaskOwner(task, userId, userRole);

    await this.prisma.task.delete({ where: { id } });
    return { message: 'Task deleted successfully' };
  }

  // ── PATCH /tasks/:id/move ─────────────────────────────────────────────────────

  async move(id: string, dto: MoveTaskDto, userId: string, userRole: Role) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);
    this.assertTaskOwner(task, userId, userRole);

    const targetColumn = await this.findColumnOrThrow(dto.columnId);

    if (targetColumn.boardId !== task.column.boardId)
      throw new BadRequestException('Target column must be on the same board');

    await this.prisma.$transaction(async (tx) => {
      const isSameColumn = task.columnId === dto.columnId;
      const oldPosition = task.position;
      const newPosition = dto.position;

      if (isSameColumn) {
        if (oldPosition < newPosition) {
          await tx.task.updateMany({
            where: {
              columnId: dto.columnId,
              id: { not: id },
              position: { gt: oldPosition, lte: newPosition },
            },
            data: { position: { decrement: 1 } },
          });
        } else if (oldPosition > newPosition) {
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
        await tx.task.updateMany({
          where: { columnId: task.columnId, position: { gt: oldPosition } },
          data: { position: { decrement: 1 } },
        });
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
        assignee: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        tags: { include: { tag: true } },
        checklistItems: { orderBy: { position: 'asc' } },
      },
    });
  }

  // ── POST /tasks/:id/archive ───────────────────────────────────────────────────

  async archive(id: string, userId: string, userRole: Role) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);
    this.assertTaskOwner(task, userId, userRole);

    await this.prisma.task.update({ where: { id }, data: { archived: true } });
    return { message: 'Task archived successfully' };
  }

  // ── POST /tasks/:id/unarchive ─────────────────────────────────────────────────

  async unarchive(id: string, userId: string, userRole: Role) {
    const task = await this.findTaskOrThrow(id);
    await this.assertBoardMember(task.column.boardId, userId);
    this.assertTaskOwner(task, userId, userRole);

    await this.prisma.task.update({ where: { id }, data: { archived: false } });
    return { message: 'Task unarchived successfully' };
  }
}
