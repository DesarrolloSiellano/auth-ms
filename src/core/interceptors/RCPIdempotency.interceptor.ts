import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { RpcException } from '@nestjs/microservices';
import { IdempotencyService } from '../idempotency/idempotency.service';

@Injectable()
export class RpcIdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    if (context.getType<'rpc'>() !== 'rpc') {
      return next.handle();
    }

    const data = context.switchToRpc().getData();
    const pattern = JSON.stringify(
      context.switchToRpc().getContext()?.pattern ?? {},
    );
    const idempotencyKey = data?.idempotencyKey;

    if (!idempotencyKey) {
      return next.handle();
    }

    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 10) {
      throw new RpcException('Invalid idempotencyKey format');
    }

    const cachedRecord = await this.idempotencyService.findKey(
      idempotencyKey,
      'TCP',
      pattern,
    );

    if (cachedRecord) {
      return of(cachedRecord.response);
    }

    return next
      .handle()
      .pipe(
        mergeMap((response) =>
          from(
            this.idempotencyService.saveKey(
              idempotencyKey,
              'TCP',
              pattern,
              response,
            ),
          ).pipe(mergeMap(() => of(response))),
        ),
      );
  }
}
