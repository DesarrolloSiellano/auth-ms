import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IdempotencyService } from '../idempotency/idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;

    // Solo aplicamos idempotencia a métodos POST y PATCH
    if (!['POST', 'PATCH'].includes(method)) {
      return next.handle();
    }

    const idempotencyKey = request.headers['x-idempotency-key'];

    // Si no se envía la llave, permitimos la petición normalmente (u opcionalmente obligar su uso)
    if (!idempotencyKey) {
      return next.handle();
    }

    // Si la llave no es un UUID válido (opcional, para mayor seguridad)
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 10) {
        throw new BadRequestException('Invalid x-idempotency-key format');
    }

    // Buscar si la llave ya fue procesada
    const cachedRecord = await this.idempotencyService.findKey(
      idempotencyKey,
      method,
      url,
    );

    if (cachedRecord) {
      // Si existe, devolvemos la respuesta guardada inmediatamente
      return of(cachedRecord.response);
    }

    // Si no existe, procesamos la petición y guardamos el resultado exitoso
    return next.handle().pipe(
      tap(async (response) => {
        // Solo guardamos si la respuesta es exitosa (por simplicidad, asumimos que si llega aquí es exitosa)
        await this.idempotencyService.saveKey(idempotencyKey, method, url, response);
      }),
    );
  }
}
