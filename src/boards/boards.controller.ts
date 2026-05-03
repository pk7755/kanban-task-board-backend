import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BoardsService } from './boards.service.js';
import { CreateBoardDto } from './dto/create-board.dto.js';
import { UpdateBoardDto } from './dto/update-board.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@ApiTags('boards')
@ApiBearerAuth()
@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all boards the current user owns or is a member of',
  })
  @ApiResponse({ status: 200, description: 'List of boards' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.boardsService.findAll(user.sub);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new board (creator becomes owner and first member)',
  })
  @ApiResponse({ status: 201, description: 'Board created' })
  create(@Body() dto: CreateBoardDto, @CurrentUser() user: JwtPayload) {
    return this.boardsService.create(dto, user.sub);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get board detail with columns and tasks (members only)',
  })
  @ApiResponse({ status: 200, description: 'Board detail' })
  @ApiResponse({ status: 403, description: 'Not a board member' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.boardsService.findOne(id, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename board (owner only)' })
  @ApiResponse({ status: 200, description: 'Board updated' })
  @ApiResponse({ status: 403, description: 'Not the board owner' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBoardDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boardsService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete board (owner only, cascades columns/tasks)',
  })
  @ApiResponse({ status: 200, description: 'Board deleted' })
  @ApiResponse({ status: 403, description: 'Not the board owner' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.boardsService.remove(id, user.sub);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to board by email (owner only)' })
  @ApiResponse({ status: 201, description: 'Member added' })
  @ApiResponse({ status: 403, description: 'Not the board owner' })
  @ApiResponse({ status: 404, description: 'Board or user not found' })
  @ApiResponse({ status: 409, description: 'User is already a member' })
  addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boardsService.addMember(id, dto.email, user.sub);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a member from board (owner only, cannot remove owner)',
  })
  @ApiResponse({ status: 200, description: 'Member removed' })
  @ApiResponse({
    status: 403,
    description: 'Not the board owner or tried to remove owner',
  })
  @ApiResponse({ status: 404, description: 'Board or member not found' })
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boardsService.removeMember(id, userId, user.sub);
  }
}
