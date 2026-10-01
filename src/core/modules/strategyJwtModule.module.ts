import { Global, Module } from '@nestjs/common';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SessionsModule } from 'src/sessions/sessions.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: await configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: await configService.get('JWT_ACCESS_EXPIRATION', '1h'),
          algorithm: 'HS256',
          issuer: await configService.get('JWT_ISSUER', 'bponet-auth'),
          audience: await configService.get('JWT_AUDIENCE', 'bponet-apps'),
        },
      }),
    }),
    SessionsModule,
  ],
  providers: [JwtStrategy],
  exports: [PassportModule, JwtModule, JwtStrategy],
})
export class StrategyJwtGlobalModule {}
