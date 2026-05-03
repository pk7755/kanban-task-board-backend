import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
import { TasksService } from './tasks.service.js';
import { TasksQueryService } from './tasks-query.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { MoveTaskDto } from './dto/move-task.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';
import { Priority } from '../../generated/prisma/enums.js';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly tasksQueryService: TasksQueryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tasks with filters and pagination' })
  @ApiQuery({ name: 'boardId', required: false })
  @ApiQuery({ name: 'columnId', required: false })
  @ApiQuery({ name: 'priority', required: false, enum: Priority })
  @ApiQuery({ name: 'assigneeId', required: false })
  @ApiQuery({ name: 'tagIds', required: false, type: [String] })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'dueBefore', required: false })
  @ApiQuery({ name: 'dueAfter', required: false })
  @ApiQuery({ name: 'overdue', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sort', required: false, example: 'createdAt:desc' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('boardId') boardId?: string,
    @Query('columnId') columnId?: string,
    @Query('priority') priority?: Priority,
    @Query('assigneeId') assigneeId?: string,
    @Query('tagIds') tagIds?: string | string[],
    @Query('search') search?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('dueAfter') dueAfter?: string,
    @Query('overdue') overdue?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    return this.tasksQueryService.findAll(user.sub, {
      boardId,
      columnId,
      priority,
      assigneeId,
      tagIds: tagIds ? (Array.isArray(tagIds) ? tagIds : [tagIds]) : undefined,
      search,
      dueBefore,
      dueAfter,
      overdue: overdue === 'true',
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      sort,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a task' })
  @ApiResponse({ status: 201, description: 'Task created' })
  @ApiResponse({ status: 403, description: 'Not a board member' })
  @ApiResponse({ status: 404, description: 'Column not found' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: JwtPayload) {
    return this.tasksService.create(dto, user.sub, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasksQueryService.findOne(id, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Not a board member' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.update(id, dto, user.sub, user.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: 200, description: 'Task deleted' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({
    status: 403,
    description: 'Not a board member or not assignee',
  })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasksService.remove(id, user.sub, user.role);
  }

  @Patch(':id/move')
  @ApiOperation({
    summary: 'Move task to a column at a specific position (reorders siblings)',
  })
  @ApiResponse({ status: 200, description: 'Task moved' })
  @ApiResponse({
    status: 400,
    description: 'Target column is on a different board',
  })
  @ApiResponse({ status: 404, description: 'Task or column not found' })
  move(
    @Param('id') id: string,
    @Body() dto: MoveTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.move(id, dto, user.sub, user.role);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a task' })
  @ApiResponse({ status: 200, description: 'Task archived' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  archive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasksService.archive(id, user.sub, user.role);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unarchive a task' })
  @ApiResponse({ status: 200, description: 'Task unarchived' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  unarchive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasksService.unarchive(id, user.sub, user.role);
  }
}
