import { Schema, model, Document } from 'mongoose';
import { tenantPlugin } from 'src/core/database/tenant.plugin';

export interface SavedFilter extends Document {
  userId: string;
  name: string;
  module: string;
  filters: Record<string, any>;
  isShared: boolean;
  tenantId: string;
  company: string;
  createdAt: Date;
}

export const SavedFilterSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    module: { type: String, default: 'users', index: true },
    filters: { type: Schema.Types.Mixed, default: {} },
    isShared: { type: Boolean, default: false },
    tenantId: { type: String },
    company: { type: String, index: true },
  },
  { timestamps: true },
);

SavedFilterSchema.plugin(tenantPlugin);
SavedFilterSchema.index({ userId: 1, module: 1 });
SavedFilterSchema.index({ company: 1, module: 1, isShared: 1 });

export const SavedFilterModel = model<SavedFilter>(
  'SavedFilter',
  SavedFilterSchema,
);
