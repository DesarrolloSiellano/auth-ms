import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Idempotency, IdempotencySchema } from './schemas/idempotency.schema';
import { IdempotencyService } from './idempotency.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Idempotency.name, schema: IdempotencySchema }]),
  ],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
