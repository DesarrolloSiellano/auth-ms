import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import * as path from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TcpDocsController } from './core/controllers/tcp-docs.controller';
import { RestDocsController } from './core/controllers/rest-docs.controller';

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
import { MassiveUsersModule } from './massive-users/massive-users.module';
import { TenantConfigModule } from './tenant-config/tenant-config.module';
import { AuditModule } from './audit/audit.module';
import { ReportsModule } from './reports/reports.module';
import { LoggerModule } from 'nestjs-pino';
import { envValidationSchema } from './core/config/env.validation';
import { IdempotencyModule } from './core/idempotency/idempotency.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';
import { MustChangePasswordInterceptor } from './core/interceptors/must-change-password.interceptor';
import { IdempotencyInterceptor } from './core/interceptors/idempotency.interceptor';
import { RpcIdempotencyInterceptor } from './core/interceptors/RCPIdempotency.interceptor';
import { TenantContextInterceptor } from './core/interceptors/tenant-context.interceptor';
import { RpcTenantContextInterceptor } from './core/interceptors/rpc-tenant-context.interceptor';
import { ServiceAuthGuard } from './core/guards/service-auth.guard';
import { RpcThrottlerGuard } from './core/guards/rpc-throttler.guard';
import { ParamFormatGuard } from './core/guards/param-format.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        timestamp: () =>
          `,"time":"${new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'America/Bogota',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
            .format(new Date())
            .replace(' ', 'T')}"`,
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
    IdempotencyModule,
    UsersModule,
    AuthModule,
    RolesModule,
    PermissionsModule,
    ModulesModule,
    SessionsModule,
    CompaniesModule,
    MailModule,
    MassiveUsersModule,
    TenantConfigModule,
    AuditModule,
    ReportsModule,
  ],
  controllers: [AppController, TcpDocsController, RestDocsController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RpcTenantContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RpcIdempotencyInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ServiceAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RpcThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ParamFormatGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MustChangePasswordInterceptor,
    },
  ],
  exports: [MailModule],
})
export class AppModule {}
