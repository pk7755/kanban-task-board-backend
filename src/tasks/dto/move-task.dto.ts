import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min } from 'class-validator';

export class MoveTaskDto {
  @ApiProperty({ example: 'column-uuid' })
  @IsString()
  columnId!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  position!: number;
}
