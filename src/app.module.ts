import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import * as path from 'path';
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
import { LoggerModule } from 'nestjs-pino';
import { envValidationSchema } from './core/config/env.validation';
import { TenantMiddleware } from './core/database/tenant.middleware';



@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        timestamp: () => `,"time":"${new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'America/Bogota',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date()).replace(' ', 'T')}"`,
        transport: {
          targets: [
            {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
              },
              level: 'info',
            },
            {
              target: 'pino-roll',
              options: {
                file: path.join(process.cwd(), 'logs', 'app.log'),
                frequency: 'daily',
                mkdir: true,
              },
              level: 'info',
            },
          ],
        },
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*');
  }
}
