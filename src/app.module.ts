import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ConfigModule } from '@nestjs/config';

import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RolesModule } from './roles/roles.module';

import { PermissionsModule } from './permissions/permissions.module';
import { ModulesModule } from './modules/modules.module';
import { SetDataInitModule } from './set-data-init/set-data-init.module';
import { DatabaseModule } from './core/database/database.module';
import { SessionsModule } from './sessions/sessions.module';
import { StrategyJwtGlobalModule } from './core/modules/strategyJwtModule.module';
import { CompaniesModule } from './companies/companies.module';
import { MailModule } from './mail/mail.module';



@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'], // Hace que ConfigService esté disponible globalmente
    }),
    StrategyJwtGlobalModule,
    DatabaseModule,
    SetDataInitModule,
    UsersModule,
    AuthModule,
    RolesModule,
    PermissionsModule,
    ModulesModule,
    SessionsModule,
    CompaniesModule,
    MailModule
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [MailModule],
})
export class AppModule {}
