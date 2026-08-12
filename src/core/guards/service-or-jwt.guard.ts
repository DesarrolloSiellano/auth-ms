import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Observable, lastValueFrom } from 'rxjs';

@Injectable()
export class ServiceOrJwtGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers?.['x-service-key'];
    const providedKey = Array.isArray(header) ? header[0] : header;

    // Si el servicio presenta la clave compartida, se autentica como servicio
    if (providedKey) {
      if (!this.verifyKey(providedKey)) {
        throw new UnauthorizedException('Invalid service credentials');
      }
      request.user = {
        isService: true,
        isAdmin: false,
        isSuperAdmin: false,
        isActived: true,
        company: request.headers?.['x-company-id'] || null,
        tenantId:
          request.headers?.['x-tenant-id'] ||
          request.headers?.['x-company-id'] ||
          null,
      };
      return true;
    }

    // Sin clave: flujo normal de frontend con JWT de usuario final
    const jwtGuard = new (AuthGuard('jwt'))();
    const result = await jwtGuard.canActivate(context);
    if (result instanceof Observable) {
      return await lastValueFrom(result);
    }
    return result;
  }

  private verifyKey(provided: string): boolean {
    const expected = this.configService.get<string>('SERVICE_API_KEY');
    if (!expected) return false;
    const bufA = Buffer.from(provided);
    const bufB = Buffer.from(expected);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
