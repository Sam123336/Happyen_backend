import { Module } from '@nestjs/common';

import { UserRepository } from './user.repository.js';

@Module({
  exports: [UserRepository],
  providers: [UserRepository],
})
export class UsersModule {}
