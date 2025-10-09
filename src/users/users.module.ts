import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {  UserSchema } from './entities/user.entity';
import { MailService } from 'src/mail/mail.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, MailService],
  imports: [
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }])
  ],
  exports: [UsersService]
})
export class UsersModule {}
