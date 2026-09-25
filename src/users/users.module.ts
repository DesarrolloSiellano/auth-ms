import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserAdminService } from './user-admin.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from './entities/user.entity';
import { MailService } from 'src/mail/mail.service';
import { ServiceOrJwtGuard } from 'src/core/guards/service-or-jwt.guard';
import { SessionsModule } from 'src/sessions/sessions.module';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UserAdminService,
    MailService,
    ServiceOrJwtGuard,
  ],
  imports: [
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    SessionsModule,
  ],
  exports: [UsersService, UserAdminService],
})
export class UsersModule {}
