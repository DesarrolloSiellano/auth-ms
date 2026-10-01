import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Autoriza únicamente a SuperAdmins. Asume que un guard de autenticación
 * (JWT) ya pobló `req.user`.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    if (req?.user?.isSuperAdmin === true) return true;
    throw new ForbiddenException(
      'Solo un SuperAdmin puede realizar esta acción',
    );
  }
}
