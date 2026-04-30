import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto.js';
import { Role } from '../../generated/prisma/enums.js';

const BCRYPT_ROUNDS = 10;

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  isActive: true,
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
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        avatarUrl: dto.avatarUrl ?? null,
        role: dto.role ?? Role.TEAM_MEMBER,
      },
      select: USER_SELECT,
    });
  }

  async findAll(query: FindAllUsersQuery = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const search = (query.search ?? '').trim();
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

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
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundException(`User with id "${id}" not found`);
    return user;
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, select: USER_SELECT });
  }

  async update(id: string, dto: UpdateUserDto, requesterId: string, requesterRole: Role) {
    await this.findOne(id);

    if (requesterRole !== Role.MANAGER && requesterId !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }

    if (dto.email) {
      const conflict = await this.prisma.user.findUnique({ where: { email: dto.email } });
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

  // ── Team management (MANAGER only) ──────────────────────────────────────────

  async findTeam(query: FindTeamQuery = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const search = (query.search ?? '').trim();
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.role) {
      where['role'] = query.role;
    }

    if (search) {
      where['OR'] = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

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

  async updateTeamMember(id: string, dto: UpdateTeamMemberDto, managerId: string) {
    await this.findOne(id);

    if (id === managerId && dto.role !== undefined) {
      throw new ForbiddenException('You cannot change your own role through this endpoint');
    }

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });
  }

  async removeTeamMember(id: string, managerId: string) {
    await this.findOne(id);

    if (id === managerId) {
      throw new ForbiddenException('You cannot deactivate your own account through this endpoint');
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });
  }

  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    await this.findOne(id);

    const tempPassword = randomBytes(8).toString('hex'); // 16-char hex string
    const hashed = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id },
      data: { password: hashed, refreshToken: null },
    });

    return { tempPassword };
  }
}
