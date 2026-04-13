import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  message: string;
  statusCode: number;
  status: string;
  data: T;
  meta: any;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode = response.statusCode || HttpStatus.OK;

    return next.handle().pipe(
      map((result) => {
        // Si el resultado ya tiene el formato esperado (para compatibilidad mientras refactorizamos)
        if (result && result.status && result.statusCode) {
            return result;
        }

        // Si el resultado viene con data y meta definidos
        const data = result?.data !== undefined ? result.data : result;
        const meta = result?.meta !== undefined ? result.meta : { totalData: Array.isArray(data) ? data.length : 1 };
        const message = result?.message || 'Operation successful';

        return {
          message,
          statusCode,
          status: 'Success',
          data,
          meta,
        };
      }),
    );
  }
}
