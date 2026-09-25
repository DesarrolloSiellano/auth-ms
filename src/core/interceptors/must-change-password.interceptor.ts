import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

const ALLOWED_SUFFIXES = [
  '/auth/login',
  '/auth/logout',
  '/auth/refresh',
  '/auth/change-password',
  '/auth/set-password-token',
  '/auth/validate-user',
  '/users/profile',
  '/users/profile/modules',
  '/users/profile/roles',
  '/users/profile/permissions',
];

/**
 * Fuerza el cambio de contraseña en el servidor: si el usuario autenticado
 * tiene `mustChangePassword=true`, sólo se permiten los endpoints necesarios
 * para cambiar la contraseña o cerrar sesión. El resto responde 403.
 */
@Injectable()
export class MustChangePasswordInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request?.user;
    if (user?.mustChangePassword === true) {
      const url: string = String(request.originalUrl || request.url || '')
        .split('?')[0];
      const allowed = ALLOWED_SUFFIXES.some((suffix) => url.endsWith(suffix));
      if (!allowed) {
        throw new ForbiddenException(
          'Debe cambiar su contraseña antes de continuar',
        );
      }
    }
    return next.handle();
  }
}
