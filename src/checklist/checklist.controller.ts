import {
  Controller,
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
import { ChecklistService } from './checklist.service.js';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto.js';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@ApiTags('checklist')
@ApiBearerAuth()
@Controller()
export class ChecklistController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Post('tasks/:taskId/checklist')
  @ApiOperation({ summary: 'Add a checklist item to a task' })
  @ApiResponse({ status: 201, description: 'Checklist item created' })
  @ApiResponse({ status: 403, description: 'Not a board member' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  create(
    @Param('taskId') taskId: string,
    @Body() dto: CreateChecklistItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.checklistService.create(taskId, dto, user.sub);
  }

  @Patch('checklist/:id')
  @ApiOperation({ summary: 'Update a checklist item (text or done status)' })
  @ApiResponse({ status: 200, description: 'Checklist item updated' })
  @ApiResponse({ status: 403, description: 'Not a board member' })
  @ApiResponse({ status: 404, description: 'Checklist item not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.checklistService.update(id, dto, user.sub);
  }

  @Delete('checklist/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a checklist item' })
  @ApiResponse({ status: 200, description: 'Checklist item deleted' })
  @ApiResponse({ status: 403, description: 'Not a board member' })
  @ApiResponse({ status: 404, description: 'Checklist item not found' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.checklistService.remove(id, user.sub);
  }
}
