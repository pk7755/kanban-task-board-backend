import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseArrayPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ColumnsService } from './columns.service.js';
import { CreateColumnDto } from './dto/create-column.dto.js';
import { UpdateColumnDto } from './dto/update-column.dto.js';
import { ReorderItemDto } from './dto/reorder-item.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@ApiTags('columns')
@ApiBearerAuth()
@Controller('columns')
export class ColumnsController {
  constructor(private readonly columnsService: ColumnsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a column in a board (owner only)' })
  @ApiResponse({ status: 201, description: 'Column created' })
  @ApiResponse({ status: 403, description: 'Not the board owner' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  create(@Body() dto: CreateColumnDto, @CurrentUser() user: JwtPayload) {
    return this.columnsService.create(dto, user.sub);
  }

  // Must be declared before PATCH :id to avoid "reorder" being matched as an ID param
  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk reorder columns by position (owner only)' })
  @ApiResponse({ status: 200, description: 'Columns reordered' })
  @ApiResponse({ status: 400, description: 'Invalid payload (duplicates, empty array)' })
  @ApiResponse({ status: 403, description: 'Not the board owner' })
  @ApiResponse({ status: 404, description: 'One or more columns not found' })
  reorder(
    @Body(new ParseArrayPipe({ items: ReorderItemDto })) items: ReorderItemDto[],
    @CurrentUser() user: JwtPayload,
  ) {
    return this.columnsService.reorder(items, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename column, change color or position (owner only)' })
  @ApiResponse({ status: 200, description: 'Column updated' })
  @ApiResponse({ status: 403, description: 'Not the board owner' })
  @ApiResponse({ status: 404, description: 'Column not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateColumnDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.columnsService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a column and all its tasks (owner only)' })
  @ApiResponse({ status: 200, description: 'Column deleted' })
  @ApiResponse({ status: 403, description: 'Not the board owner' })
  @ApiResponse({ status: 404, description: 'Column not found' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.columnsService.remove(id, user.sub);
  }
}
