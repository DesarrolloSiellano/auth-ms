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
 * Usually (tenantId, _id) or (tenantId, customField).
 */
export function addTenantIndexes(schema: MongooseSchema, fields: string[] = []) {
  schema.index({ tenantId: 1, company: 1 });
  fields.forEach(field => {
    schema.index({ tenantId: 1, [field]: 1 });
  });
}
