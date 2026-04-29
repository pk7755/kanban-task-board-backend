import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Role } from '../../../generated/prisma/enums.js';

export class UpdateRoleDto {
  @ApiProperty({ enum: Role, example: Role.TEAM_MEMBER })
  @IsEnum(Role)
  role!: Role;
}
