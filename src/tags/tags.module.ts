import { Module } from '@nestjs/common';
import { TagsService } from './tags.service.js';
import { TagsController } from './tags.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [TagsController],
  providers: [TagsService],
})
export class TagsModule {}
