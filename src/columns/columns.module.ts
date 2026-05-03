import { Module } from '@nestjs/common';
import { ColumnsService } from './columns.service.js';
import { ColumnsController } from './columns.controller.js';

@Module({
  controllers: [ColumnsController],
  providers: [ColumnsService],
})
export class ColumnsModule {}
