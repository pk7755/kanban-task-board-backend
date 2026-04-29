import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { TeamController } from './team.controller.js';

@Module({
  controllers: [TeamController, UsersController],
  providers: [UsersService],
})
export class UsersModule {}
