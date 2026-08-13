import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EncryptionService } from 'src/core/services/encryption.service';
import { JwtTCPStrategy } from 'src/core/strategies/jwtTCP.strategy';
import { MailService } from 'src/mail/mail.service';
import { SessionsModule } from 'src/sessions/sessions.module';

@Module({
  imports: [SessionsModule],
  controllers: [AuthController],
  providers: [AuthService, MailService, EncryptionService, JwtTCPStrategy],
  exports: [AuthService],
})
export class AuthModule {}
