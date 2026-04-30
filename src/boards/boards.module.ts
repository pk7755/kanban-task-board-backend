import { Module } from '@nestjs/common';
import { BoardsService } from './boards.service.js';
import { BoardsController } from './boards.controller.js';

@Module({
  controllers: [BoardsController],
  providers: [BoardsService],
})
export class BoardsModule {}
