import { Schema, model, Document } from 'mongoose';
import { tenantPlugin } from 'src/core/database/tenant.plugin';

export type AuditCategory =
  | 'auth'
  | 'session'
  | 'config'
  | 'policy'
  | 'user'
  | 'security';

export type AuditStatus = 'success' | 'failed';

export interface AuditLog extends Document {
  tenantId?: string;
  company?: string;
  userId?: string;
  email?: string;
  action: string;
  category: AuditCategory;
  status: AuditStatus;
  ip?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  device?: string;
  detail?: Record<string, any>;
  createdAt: Date;
}

export const AuditLogSchema = new Schema({
  tenantId: { type: String, index: true },
  company: { type: String, index: true },
  userId: { type: String, index: true },
  email: { type: String },
  action: { type: String, required: true, index: true },
  category: { type: String, required: true, index: true },
  status: { type: String, default: 'success' },
  ip: { type: String },
  userAgent: { type: String },
  browser: { type: String },
  os: { type: String },
  device: { type: String },
  detail: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

AuditLogSchema.plugin(tenantPlugin);

AuditLogSchema.index({ company: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ category: 1, createdAt: -1 });

// Retención: los registros se eliminan automáticamente tras N días.
const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS) || 180;
AuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: AUDIT_RETENTION_DAYS * 24 * 60 * 60 },
);

export const AuditLogModel = model<AuditLog>('AuditLog', AuditLogSchema);
