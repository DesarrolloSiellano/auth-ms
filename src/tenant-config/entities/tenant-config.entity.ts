import { Schema, model, Document } from 'mongoose';

export interface TenantConfig extends Document {
  tenantId: string;
  company: string;
  isActive: boolean;
  version: number;
  values: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export const TenantConfigSchema = new Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    company: { type: String, required: true, index: true },
    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 0 },
    values: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const TenantConfigModel = model<TenantConfig>(
  'TenantConfig',
  TenantConfigSchema,
);
