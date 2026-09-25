import moment from 'moment';
import { Schema, model, Document } from 'mongoose';
import {
  TenantBaseSchema,
  addTenantIndexes,
} from 'src/core/database/tenant.base.schema';
import { tenantPlugin } from 'src/core/database/tenant.plugin';

export interface Session extends Document {
  tenantId: string;
  user: string;
  idUser: string;
  email: string;
  company: string;
  expires: string;
  created: string;
  modified: string;
  isActive: boolean;
  refreshToken?: string;
  lastActivityAt?: Date;
  ip?: string;
  os?: string;
  os_version?: string;
  browser?: string;
  browser_version?: string;
  istable?: boolean;
  ismovil?: boolean;
  isbrowser?: boolean;
  user_agent?: string;
  dateCreated?: string;
  hourCreated?: string;
  dateModified?: string;
  hourModified?: string;
  idUserModified?: string;
}

// Define schema for session id x
export const SessionSchema = new Schema({
  user: { type: String },
  idUser: { type: String },
  email: { type: String },
  ...TenantBaseSchema,
  expires: { type: String },
  created: { type: String, default: moment().format('YYYY-MM-DD HH:mm:ss') },
  modified: { type: String, default: moment().format('YYYY-MM-DD HH:mm:ss') },
  isActive: { type: Boolean, default: true },
  refreshToken: { type: String },
  lastActivityAt: { type: Date, default: Date.now },
  ip: { type: String },
  os: { type: String },
  os_version: { type: String },
  user_agent: { type: String },
  browser: { type: String },
  browser_version: { type: String },
  istable: { type: Boolean },
  ismovil: { type: Boolean },
  isbrowser: { type: Boolean },
  dateCreated: { type: String, default: moment().format('YYYY-MM-DD') },
  hourCreated: { type: String, default: moment().format('HH:mm:ss') },
  dateModified: { type: String, default: moment().format('YYYY-MM-DD') },
  hourModified: { type: String, default: moment().format('HH:mm:ss') },
});

// Registrar plugin de multi-tenant automático
SessionSchema.plugin(tenantPlugin);

// Configuración de índices compuestos multi-tenant para rendimiento y aislamiento de unicidad
SessionSchema.index({ company: 1, user: 1 });
SessionSchema.index({ company: 1, refreshToken: 1 });
SessionSchema.index({ refreshToken: 1, isActive: 1 });
addTenantIndexes(SessionSchema, ['refreshToken']);

// Purga automática: las sesiones sin actividad en 90 días se eliminan.
SessionSchema.index({ lastActivityAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const SessionModel = model<Session>('sessions', SessionSchema);
