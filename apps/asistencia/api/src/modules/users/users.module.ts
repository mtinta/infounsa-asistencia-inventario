import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersImportController } from './users-import.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersImportController, UsersController],
  providers: [UsersService],
})
export class UsersModule {}
