import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { TasksQueryService } from './tasks-query.service.js';
import { TasksController } from './tasks.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TasksController],
  providers: [TasksService, TasksQueryService],
})
export class TasksModule {}
