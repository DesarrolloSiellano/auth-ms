import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import {
  PARAM_FORMAT_KEY,
  ParamFormatRule,
} from '../decorators/param-format.decorator';

const TOKEN_PATTERN = /^[A-Za-z0-9._-]{1,120}$/;

/**
 * Valida el formato de parámetros de ruta declarados con `@ParamFormat(...)`.
 * Evita que ids/tokens inválidos lleguen a Mongo (CastError → 500) y da 400.
 */
@Injectable()
export class ParamFormatGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const rules =
      this.reflector.getAllAndOverride<ParamFormatRule[]>(PARAM_FORMAT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];
    if (rules.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    for (const rule of rules) {
      const value = req?.params?.[rule.param];
      if (value === undefined) continue;
      const valid =
        rule.kind === 'objectId'
          ? Types.ObjectId.isValid(String(value))
          : TOKEN_PATTERN.test(String(value));
      if (!valid) {
        throw new BadRequestException(
          `El parámetro "${rule.param}" no es válido`,
        );
      }
    }
    return true;
  }
}
