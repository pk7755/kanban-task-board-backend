import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { CreateTaskDto } from './create-task.dto.js';

export class ChecklistItemInputDto {
  @ApiPropertyOptional({ example: 'Write unit tests' })
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  done!: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiPropertyOptional({ type: [ChecklistItemInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemInputDto)
  checklistItems?: ChecklistItemInputDto[];
}
