import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTagDto } from './dto/create-tag.dto.js';
import { UpdateTagDto } from './dto/update-tag.dto.js';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  private async findBoardOrThrow(boardId: string) {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: { members: true },
    });
    if (!board) throw new NotFoundException(`Board "${boardId}" not found`);
    return board;
  }

  private assertMember(
    board: { members: { userId: string }[] },
    userId: string,
  ) {
    if (!board.members.some((m) => m.userId === userId))
      throw new ForbiddenException('You are not a member of this board');
  }

  private async findTagOrThrow(id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException(`Tag "${id}" not found`);
    return tag;
  }

  // ── GET /boards/:id/tags ──────────────────────────────────────────────────

  async findAll(boardId: string, userId: string) {
    const board = await this.findBoardOrThrow(boardId);
    this.assertMember(board, userId);
    return this.prisma.tag.findMany({ where: { boardId } });
  }

  // ── POST /boards/:id/tags ─────────────────────────────────────────────────

  async create(boardId: string, dto: CreateTagDto, userId: string) {
    const board = await this.findBoardOrThrow(boardId);
    this.assertMember(board, userId);
    return this.prisma.tag.create({ data: { ...dto, boardId } });
  }

  // ── PATCH /tags/:id ───────────────────────────────────────────────────────

  async update(id: string, dto: UpdateTagDto, userId: string) {
    const tag = await this.findTagOrThrow(id);
    const board = await this.findBoardOrThrow(tag.boardId);
    this.assertMember(board, userId);
    return this.prisma.tag.update({ where: { id }, data: dto });
  }

  // ── DELETE /tags/:id ──────────────────────────────────────────────────────

  async remove(id: string, userId: string) {
    const tag = await this.findTagOrThrow(id);
    const board = await this.findBoardOrThrow(tag.boardId);
    this.assertMember(board, userId);
    await this.prisma.tag.delete({ where: { id } });
    return { message: 'Tag deleted' };
  }
}
