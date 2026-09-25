import { Schema, model, Document } from 'mongoose';
import { tenantPlugin } from 'src/core/database/tenant.plugin';

export type CustomFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'boolean';

export interface CustomFieldOption {
  label: string;
  value: any;
}

export interface CustomFieldDefinition extends Document {
  tenantId: string;
  company: string;
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options?: CustomFieldOption[];
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const CustomFieldDefinitionSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    company: { type: String, required: true, index: true },
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ['text', 'number', 'date', 'select', 'boolean'],
      default: 'text',
    },
    required: { type: Boolean, default: false },
    options: [
      {
        label: { type: String, default: '' },
        value: { type: Schema.Types.Mixed },
      },
    ],
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

CustomFieldDefinitionSchema.plugin(tenantPlugin);
CustomFieldDefinitionSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const CustomFieldDefinitionModel = model<CustomFieldDefinition>(
  'CustomFieldDefinition',
  CustomFieldDefinitionSchema,
);
