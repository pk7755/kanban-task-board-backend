import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBoardDto } from './dto/create-board.dto.js';
import { UpdateBoardDto } from './dto/update-board.dto.js';

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async findBoardOrThrow(id: string) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!board) throw new NotFoundException(`Board "${id}" not found`);
    return board;
  }

  private assertMember(
    board: { members: { userId: string }[] },
    userId: string,
  ) {
    const isMember = board.members.some((m) => m.userId === userId);
    if (!isMember)
      throw new ForbiddenException('You are not a member of this board');
  }

  private assertOwner(board: { ownerId: string }, userId: string) {
    if (board.ownerId !== userId)
      throw new ForbiddenException('Only the board owner can do this');
  }

  // ── GET /boards ────────────────────────────────────────────────────────────

  async findAll(userId: string) {
    const boards = await this.prisma.board.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            members: { where: { user: { isDeleted: false } } },
          },
        },
      },
    });

    return boards.map((b) => ({
      id: b.id,
      name: b.name,
      ownerId: b.ownerId,
      memberCount: b._count.members,
      createdAt: b.createdAt,
    }));
  }

  // ── POST /boards ───────────────────────────────────────────────────────────

  async create(dto: CreateBoardDto, ownerId: string) {
    const board = await this.prisma.board.create({
      data: {
        name: dto.name,
        ownerId,
        members: { create: { userId: ownerId } },
      },
      include: { _count: { select: { members: true } } },
    });

    return {
      id: board.id,
      name: board.name,
      ownerId: board.ownerId,
      memberCount: board._count.members,
      createdAt: board.createdAt,
    };
  }

  // ── GET /boards/:id ────────────────────────────────────────────────────────

  async findOne(id: string, userId: string) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: {
        members: {
          where: { user: { isDeleted: false } },
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true, isActive: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        columns: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              where: { archived: false },
              orderBy: { position: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                priority: true,
                position: true,
                assigneeId: true,
                archived: true,
                dueDate: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!board) throw new NotFoundException(`Board "${id}" not found`);
    this.assertMember(board, userId);

    return {
      id: board.id,
      name: board.name,
      ownerId: board.ownerId,
      memberCount: board.members.length,
      createdAt: board.createdAt,
      columns: board.columns.map((col) => ({
        id: col.id,
        name: col.name,
        position: col.position,
        color: col.color,
        tasks: col.tasks,
      })),
      members: board.members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        isActive: m.user.isActive,
        joinedAt: m.joinedAt,
      })),
    };
  }

  // ── PATCH /boards/:id ──────────────────────────────────────────────────────

  async update(id: string, dto: UpdateBoardDto, userId: string) {
    const board = await this.findBoardOrThrow(id);
    this.assertOwner(board, userId);

    const updated = await this.prisma.board.update({
      where: { id },
      data: { name: dto.name },
      include: { _count: { select: { members: true } } },
    });

    return {
      id: updated.id,
      name: updated.name,
      ownerId: updated.ownerId,
      memberCount: updated._count.members,
      createdAt: updated.createdAt,
    };
  }

  // ── DELETE /boards/:id ─────────────────────────────────────────────────────

  async remove(id: string, userId: string) {
    const board = await this.findBoardOrThrow(id);
    this.assertOwner(board, userId);

    await this.prisma.board.delete({ where: { id } });
    return { message: 'Board deleted successfully' };
  }

  // ── POST /boards/:id/members ───────────────────────────────────────────────

  async addMember(boardId: string, email: string, requesterId: string) {
    const board = await this.findBoardOrThrow(boardId);
    this.assertOwner(board, requesterId);

    const user = await this.prisma.user.findFirst({
      where: { email, isDeleted: false },
    });
    if (!user)
      throw new NotFoundException(`No user found with email "${email}"`);
    if (!user.isActive)
      throw new ConflictException('Cannot add an inactive user to a board');
    const alreadyMember = board.members.some((m) => m.userId === user.id);
    if (alreadyMember)
      throw new ConflictException('User is already a member of this board');

    await this.prisma.boardMember.create({
      data: { boardId, userId: user.id },
    });

    return { message: `${user.name} added to the board` };
  }

  // ── DELETE /boards/:id/members/:userId ─────────────────────────────────────

  async removeMember(
    boardId: string,
    targetUserId: string,
    requesterId: string,
  ) {
    const board = await this.findBoardOrThrow(boardId);
    this.assertOwner(board, requesterId);

    if (targetUserId === board.ownerId) {
      throw new ForbiddenException('Cannot remove the board owner');
    }

    const isMember = board.members.some((m) => m.userId === targetUserId);
    if (!isMember)
      throw new NotFoundException('User is not a member of this board');

    await this.prisma.boardMember.delete({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });

    return { message: 'Member removed from the board' };
  }
}
