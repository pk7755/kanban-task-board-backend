import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto.js';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto.js';

@Injectable()
export class ChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTaskMember(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: { include: { board: { include: { members: true } } } },
      },
    });
    if (!task) throw new NotFoundException(`Task "${taskId}" not found`);

    const isMember = task.column.board.members.some((m) => m.userId === userId);
    if (!isMember)
      throw new ForbiddenException('You are not a member of this board');

    return task;
  }

  private async findItemOrThrow(id: string) {
    const item = await this.prisma.checklistItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`Checklist item "${id}" not found`);
    return item;
  }

  // ── POST /tasks/:taskId/checklist ─────────────────────────────────────────

  async create(taskId: string, dto: CreateChecklistItemDto, userId: string) {
    await this.assertTaskMember(taskId, userId);

    const { _max } = await this.prisma.checklistItem.aggregate({
      where: { taskId },
      _max: { position: true },
    });

    return this.prisma.checklistItem.create({
      data: {
        taskId,
        text: dto.text,
        position: (_max.position ?? 0) + 1,
      },
    });
  }

  // ── PATCH /checklist/:id ──────────────────────────────────────────────────

  async update(id: string, dto: UpdateChecklistItemDto, userId: string) {
    const item = await this.findItemOrThrow(id);
    await this.assertTaskMember(item.taskId, userId);

    return this.prisma.checklistItem.update({
      where: { id },
      data: dto,
    });
  }

  // ── DELETE /checklist/:id ─────────────────────────────────────────────────

  async remove(id: string, userId: string) {
    const item = await this.findItemOrThrow(id);
    await this.assertTaskMember(item.taskId, userId);

    await this.prisma.checklistItem.delete({ where: { id } });
    return { message: 'Checklist item deleted' };
  }
}
