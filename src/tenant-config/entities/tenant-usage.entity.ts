import { Schema, model, Document } from 'mongoose';

export interface TenantUsage extends Document {
  tenantId: string;
  period: string; // YYYY-MM en zona horaria del tenant
  metrics: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

export const TenantUsageSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    period: { type: String, required: true },
    metrics: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

TenantUsageSchema.index({ tenantId: 1, period: 1 }, { unique: true });

export const TenantUsageModel = model<TenantUsage>(
  'TenantUsage',
  TenantUsageSchema,
);

/**
 * Registro de reportes para idempotencia: evita sumar dos veces el mismo
 * `reportId`. Se recomienda un índice TTL para depurar registros antiguos.
 */
export interface TenantUsageReport extends Document {
  reportId: string;
  tenantId: string;
  period: string;
  createdAt: Date;
}

export const TenantUsageReportSchema = new Schema(
  {
    reportId: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true },
    period: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: '60d' },
  },
  { timestamps: true },
);

export const TenantUsageReportModel = model<TenantUsageReport>(
  'TenantUsageReport',
  TenantUsageReportSchema,
);
