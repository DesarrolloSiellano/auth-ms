import { Prop, Schema } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema()
export class TenantBase {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  company: string;
}

export const TenantBaseSchema = {
  tenantId: { type: String, required: true, index: true },
  company: { type: String, required: true, index: true },
};

/**
 * Helper to create compound indexes for multi-tenant isolation.
 * La identidad de empresa es el par (tenantId + company), por lo que ambos
 * son el prefijo de todo índice.
 */
export function addTenantIndexes(
  schema: MongooseSchema,
  fields: string[] = [],
) {
  schema.index({ tenantId: 1, company: 1 });
  fields.forEach((field) => {
    schema.index({ tenantId: 1, company: 1, [field]: 1 });
  });
}
