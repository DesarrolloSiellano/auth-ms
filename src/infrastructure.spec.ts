/**
 * Smoke test de infraestructura: al importar AppModule se ejecutan las
 * definiciones de los módulos Nest, los decoradores y los esquemas Mongoose
 * (cubriendo las líneas de *.module.ts y entities/*.entity.ts).
 */
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ModulesModule } from './modules/modules.module';
import { CompaniesModule } from './companies/companies.module';
import { SessionsModule } from './sessions/sessions.module';
import { SetDataInitModule } from './set-data-init/set-data-init.module';
import { MailModule } from './mail/mail.module';
import { DatabaseModule } from './core/database/database.module';
import { IdempotencyModule } from './core/idempotency/idempotency.module';
import { StrategyJwtGlobalModule } from './core/modules/strategyJwtModule.module';

describe('Infrastructure modules', () => {
  it('carga todos los módulos sin errores', () => {
    expect(AppModule).toBeDefined();
    expect(AuthModule).toBeDefined();
    expect(UsersModule).toBeDefined();
    expect(RolesModule).toBeDefined();
    expect(PermissionsModule).toBeDefined();
    expect(ModulesModule).toBeDefined();
    expect(CompaniesModule).toBeDefined();
    expect(SessionsModule).toBeDefined();
    expect(SetDataInitModule).toBeDefined();
    expect(MailModule).toBeDefined();
    expect(DatabaseModule).toBeDefined();
    expect(IdempotencyModule).toBeDefined();
    expect(StrategyJwtGlobalModule).toBeDefined();
  });
});
