import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../../generated/prisma/enums.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@ApiTags('team-management')
@ApiBearerAuth()
@Roles(Role.MANAGER)
@Controller('users/team')
export class TeamController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List all team members — supports ?search=, ?role=, pagination',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, enum: Role })
  @ApiResponse({ status: 200, description: 'Paginated list of team members' })
  findTeam(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: Role,
  ) {
    return this.usersService.findTeam({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      role,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new team member',
    description:
      'Manager can create accounts with any role including MANAGER. ' +
      'Newly created users must change their password on first login (recommended practice).',
  })
  @ApiResponse({
    status: 201,
    description: 'Team member created',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  createTeamMember(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: "Update a team member's name, role, or active status",
    description: 'Manager cannot change their own role through this endpoint.',
  })
  @ApiResponse({
    status: 200,
    description: 'Team member updated',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — attempted self-role change',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateTeamMember(
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.usersService.updateTeamMember(id, dto, requester.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete a team member (sets isActive = false)',
    description:
      'Hard delete is not allowed. Manager cannot deactivate their own account here.',
  })
  @ApiResponse({
    status: 200,
    description: 'Team member deactivated',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — attempted self-deactivation',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  removeTeamMember(
    @Param('id') id: string,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.usersService.removeTeamMember(id, requester.sub);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reset a team member's password",
    description:
      'Generates a one-time temporary password (16-char hex). ' +
      'The plaintext is returned ONCE in this response and never stored. ' +
      "The user's refresh tokens are also invalidated.",
  })
  @ApiResponse({
    status: 200,
    description: 'Temporary password generated',
    schema: { example: { tempPassword: 'a3f1c9e2b7d04581' } },
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  resetPassword(@Param('id') id: string) {
    return this.usersService.resetPassword(id);
  }
}
