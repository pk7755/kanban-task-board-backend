import { PartialType } from '@nestjs/swagger';
import { CreateBoardDto } from './create-board.dto.js';

export class UpdateBoardDto extends PartialType(CreateBoardDto) {}
