import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AuditService } from './audit.service.js';
import { QueryAuditLogDto } from './dto/query-audit-log.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../../generated/prisma/enums.js';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Roles(Role.MANAGER)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List all audit log entries (manager only)' })
  @ApiResponse({ status: 200, description: 'Paginated audit logs returned' })
  @ApiResponse({ status: 403, description: 'Forbidden — managers only' })
  findAll(@Query() query: QueryAuditLogDto) {
    return this.auditService.findAll(query);
  }
}
