import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { SERVICE_ROUTE_KEY } from '../decorators/service-route.decorator';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Canal TCP: TODOS los handlers @MessagePattern exigen serviceKey en el payload
    if (context.getType() === 'rpc') {
      const data = context.switchToRpc().getData();
      return this.verifyKey(data?.serviceKey);
    }

    // Canal HTTP: exige la clave solo en rutas marcadas con @ServiceRoute()
    const isServiceRoute = this.reflector.getAllAndOverride<boolean>(
      SERVICE_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!isServiceRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const header = request.headers?.['x-service-key'];
    const provided = Array.isArray(header) ? header[0] : header;
    return this.verifyKey(provided);
  }

  private verifyKey(provided: string | undefined): boolean {
    const expected = this.configService.getOrThrow<string>('SERVICE_API_KEY');
    if (!expected || !provided || !this.safeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid service credentials');
    }
    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
