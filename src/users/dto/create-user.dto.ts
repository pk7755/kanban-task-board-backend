import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';
import { Role } from '../../../generated/prisma/enums.js';

export class CreateUserDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'John Doe', minLength: 2 })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'https://example.com/avatar.png', required: false })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiProperty({ enum: Role, default: Role.TEAM_MEMBER, required: false })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
