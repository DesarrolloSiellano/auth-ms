import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Autoriza a administradores (admin de empresa o SuperAdmin). Asume que un
 * guard de autenticación (JWT) ya pobló `req.user`.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    if (req?.user?.isAdmin === true || req?.user?.isSuperAdmin === true) {
      return true;
    }
    throw new ForbiddenException(
      'Se requieren permisos de administrador',
    );
  }
}
