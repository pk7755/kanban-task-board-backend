import { ApiProperty } from '@nestjs/swagger';
import { IsHexColor, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ example: 'Bug', minLength: 1, maxLength: 50 })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiProperty({ example: '#FF5733' })
  @IsHexColor()
  color!: string;
}
