import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto.js';
import { Role, AuditAction } from '../../generated/prisma/enums.js';

const BCRYPT_ROUNDS = 10;

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  isActive: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface FindAllUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
}

interface FindTeamQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role;
}
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, createdById?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        avatarUrl: dto.avatarUrl ?? null,
        role: dto.role ?? Role.TEAM_MEMBER,
      },
      select: USER_SELECT,
    });

    if (createdById) {
      await this.audit.log(
        createdById,
        AuditAction.USER_CREATED,
        'User',
        user.id,
        {
          email: user.email,
          role: user.role,
        },
      );
    }

    return user;
  }

  async findAll(query: FindAllUsersQuery = {}) {
    const where: Record<string, unknown> = { isDeleted: false }
    if ((query.search ?? '').trim()) {
      where['OR'] = [
        { email: { contains: query.search!.trim(), mode: 'insensitive' as const } },
        { name: { contains: query.search!.trim(), mode: 'insensitive' as const } },
      ]
    }
    return this.paginateUsers(where, query);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException(`User with id "${id}" not found`);
    return user;
  }

  findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email, isDeleted: false },
      select: USER_SELECT,
    });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    requesterId: string,
    requesterRole: Role,
  ) {
    await this.findOne(id);

    if (requesterRole !== Role.MANAGER && requesterId !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }

    if (dto.email) {
      const conflict = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });
  }

  async findTeam(query: FindTeamQuery = {}) {
    const where: Record<string, unknown> = { isDeleted: false };
    if (query.role) where['role'] = query.role;
    if ((query.search ?? '').trim()) {
      where['OR'] = [
        { email: { contains: query.search!.trim(), mode: 'insensitive' } },
        { name: { contains: query.search!.trim(), mode: 'insensitive' } },
      ];
    }
    return this.paginateUsers(where, query);
  }

  private async paginateUsers(
    where: Record<string, unknown>,
    query: { page?: number; limit?: number },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateTeamMember(
    id: string,
    dto: UpdateTeamMemberDto,
    managerId: string,
  ) {
    const existing = await this.findOne(id);
    if (id === managerId && dto.role !== undefined) {
      throw new ForbiddenException(
        'You cannot change your own role through this endpoint',
      );
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });
    if (dto.role !== undefined && dto.role !== existing.role) {
      await this.audit.log(managerId, AuditAction.ROLE_CHANGED, 'User', id, {
        from: existing.role,
        to: dto.role,
      });
    }
    return updated;
  }

  async removeTeamMember(id: string, managerId: string) {
    await this.findOne(id);

    if (id === managerId) {
      throw new ForbiddenException(
        'You cannot delete your own account through this endpoint',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isDeleted: true, isActive: false, refreshToken: null },
      select: USER_SELECT,
    });

    // Unassign all tasks belonging to this deleted user
    await this.prisma.task.updateMany({
      where: { assigneeId: id },
      data: { assigneeId: null },
    });

    await this.audit.log(managerId, AuditAction.USER_DEACTIVATED, 'User', id);

    return updated;
  }

  async resetPassword(
    id: string,
    managerId: string,
  ): Promise<{ tempPassword: string }> {
    await this.findOne(id);

    const tempPassword = randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id },
      data: { password: hashed, refreshToken: null },
    });

    await this.audit.log(managerId, AuditAction.PASSWORD_RESET, 'User', id);

    return { tempPassword };
  }
}
