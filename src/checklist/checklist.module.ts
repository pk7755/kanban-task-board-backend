import { Module } from '@nestjs/common';
import { ChecklistService } from './checklist.service.js';
import { ChecklistController } from './checklist.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ChecklistController],
  providers: [ChecklistService],
})
export class ChecklistModule {}
