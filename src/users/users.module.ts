import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from './entities/user.entity';
import { MailService } from 'src/mail/mail.service';
import { ServiceOrJwtGuard } from 'src/core/guards/service-or-jwt.guard';

@Module({
  controllers: [UsersController],
  providers: [UsersService, MailService, ServiceOrJwtGuard],
  imports: [MongooseModule.forFeature([{ name: 'User', schema: UserSchema }])],
  exports: [UsersService],
})
export class UsersModule {}
