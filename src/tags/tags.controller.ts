import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { TagsService } from './tags.service.js';
import { CreateTagDto } from './dto/create-tag.dto.js';
import { UpdateTagDto } from './dto/update-tag.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@ApiTags('tags')
@ApiBearerAuth()
@Controller()
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get('boards/:id/tags')
  @ApiOperation({ summary: 'List all tags for a board' })
  @ApiResponse({ status: 200, description: 'Tags returned' })
  @ApiResponse({ status: 403, description: 'Not a board member' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  findAll(@Param('id') boardId: string, @CurrentUser() user: JwtPayload) {
    return this.tagsService.findAll(boardId, user.sub);
  }

  @Post('boards/:id/tags')
  @ApiOperation({ summary: 'Create a tag on a board' })
  @ApiResponse({ status: 201, description: 'Tag created' })
  @ApiResponse({ status: 403, description: 'Not a board member' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  create(
    @Param('id') boardId: string,
    @Body() dto: CreateTagDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tagsService.create(boardId, dto, user.sub);
  }

  @Patch('tags/:id')
  @ApiOperation({ summary: 'Update a tag name or color' })
  @ApiResponse({ status: 200, description: 'Tag updated' })
  @ApiResponse({ status: 403, description: 'Not a board member' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tagsService.update(id, dto, user.sub);
  }

  @Delete('tags/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiResponse({ status: 200, description: 'Tag deleted' })
  @ApiResponse({ status: 403, description: 'Not a board member' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tagsService.remove(id, user.sub);
  }
}
