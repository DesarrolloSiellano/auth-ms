import { Schema, model, Document } from 'mongoose';

export type PolicyType = 'boolean' | 'number' | 'text' | 'select' | 'json';

export interface PolicyOption {
  label: string;
  value: any;
}

export interface PolicyDefinition extends Document {
  key: string;
  label: string;
  description?: string;
  group: string;
  type: PolicyType;
  defaultValue: any;
  options?: PolicyOption[];
  unit?: string;
  min?: number | null;
  max?: number | null;
  order: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const PolicyDefinitionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    group: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['boolean', 'number', 'text', 'select', 'json'],
      required: true,
    },
    defaultValue: { type: Schema.Types.Mixed, default: null },
    options: [
      {
        label: { type: String, default: '' },
        value: { type: Schema.Types.Mixed },
      },
    ],
    unit: { type: String, default: '' },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const PolicyDefinitionModel = model<PolicyDefinition>(
  'PolicyDefinition',
  PolicyDefinitionSchema,
);
