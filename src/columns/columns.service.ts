import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreateColumnDto } from './dto/create-column.dto.js';
import { UpdateColumnDto } from './dto/update-column.dto.js';
import { ReorderItemDto } from './dto/reorder-item.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async findColumnOrThrow(id: string) {
    const column = await this.prisma.column.findUnique({ where: { id } });
    if (!column) throw new NotFoundException(`Column "${id}" not found`);
    return column;
  }

  private async findBoardOrThrow(id: string) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!board) throw new NotFoundException(`Board "${id}" not found`);
    return board;
  }

  private assertOwner(board: { ownerId: string }, userId: string) {
    if (board.ownerId !== userId)
      throw new ForbiddenException('Only the board owner can do this');
  }

  // ── POST /columns ────────────────────────────────────────────────────────────

  async create(dto: CreateColumnDto, userId: string) {
    const board = await this.findBoardOrThrow(dto.boardId);
    this.assertOwner(board, userId);

    const maxPos = await this.prisma.column.aggregate({
      where: { boardId: dto.boardId },
      _max: { position: true },
    });
    const position = (maxPos._max.position ?? 0) + 1;

    return this.prisma.column.create({
      data: { name: dto.name, boardId: dto.boardId, position, color: dto.color },
    });
  }

  // ── PATCH /columns/:id ───────────────────────────────────────────────────────

  async update(id: string, dto: UpdateColumnDto, userId: string) {
    const column = await this.findColumnOrThrow(id);
    const board = await this.findBoardOrThrow(column.boardId);
    this.assertOwner(board, userId);

    return this.prisma.column.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
    });
  }

  // ── DELETE /columns/:id ──────────────────────────────────────────────────────

  async remove(id: string, userId: string) {
    const column = await this.findColumnOrThrow(id);
    const board = await this.findBoardOrThrow(column.boardId);
    this.assertOwner(board, userId);

    await this.prisma.column.delete({ where: { id } });
    return { message: 'Column deleted successfully' };
  }

  // ── PATCH /columns/reorder ───────────────────────────────────────────────────

  async reorder(items: ReorderItemDto[], userId: string) {
    if (!items.length) throw new BadRequestException('items array must not be empty');

    const ids = items.map((i) => i.id);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Duplicate column IDs in request');

    const positions = items.map((i) => i.position);
    if (new Set(positions).size !== positions.length)
      throw new BadRequestException('Duplicate positions in request');

    const columns = await this.prisma.column.findMany({ where: { id: { in: ids } } });
    if (columns.length !== ids.length)
      throw new NotFoundException('One or more columns not found');

    const boardIds = new Set(columns.map((c) => c.boardId));
    if (boardIds.size !== 1)
      throw new BadRequestException('All columns must belong to the same board');

    const board = await this.findBoardOrThrow([...boardIds][0]);
    this.assertOwner(board, userId);

    await this.prisma.$transaction(
      items.map(({ id, position }) =>
        this.prisma.column.update({ where: { id }, data: { position } }),
      ),
    );

    return { message: 'Columns reordered successfully' };
  }
}
