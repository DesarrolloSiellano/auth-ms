import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'idempotency_keys' })
export class Idempotency extends Document {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ type: Object, required: true })
  response: any;

  @Prop({ required: true })
  method: string;

  @Prop({ required: true })
  path: string;

  @Prop({ required: true, type: Date })
  expiresAt: Date;
}

export const IdempotencySchema = SchemaFactory.createForClass(Idempotency);

// TTL Index: MongoDB automatically deletes documents when the current time is >= expiresAt
IdempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Compound index for searching
IdempotencySchema.index({ key: 1, method: 1, path: 1 });
