import { Schema, model, Document } from 'mongoose';
import moment from 'moment';
import {
  TenantBaseSchema,
  addTenantIndexes,
} from 'src/core/database/tenant.base.schema';
import { tenantPlugin } from 'src/core/database/tenant.plugin';

interface Permission {
  name: string;
  description: string;
  action: string; // `create`, `read`, `update`, `delete`, etc.
  resource: string; // `usuarios`, `posts`, `comentarios`, etc.
  resourceId?: string; // Opcional, si aplica al recurso específico
  type: string; // `global` o `role-based`
  rol?: Rol; // Relación con el Rol
  created: Date;
  modified: Date;
  dateCreated?: String;
  hourCreated?: String;
  dateModified?: String;
  hourModified?: String;
  idUserModified?: String;
  isActive: boolean;
}

export interface Rol extends Document {
  tenantId: string;
  company: string;
  name: string;
  codeRol: string;
  description: string;
  created: Date;
  modiefied: Date;
  isActive: boolean;
  dateCreated?: String;
  hourCreated?: String;
  dateModified?: String;
  hourModified?: String;
  idUserModified?: string;
  isInheritPermissions: boolean;
  permissions: Permission[];
}

export const RolSchema = new Schema({
  ...TenantBaseSchema,
  name: { type: String, required: [true, 'The name field is required'] },
  codeRol: { type: String, required: [true, 'The code field is required'] },
  description: {
    type: String,
    required: [true, 'The description field is required'],
  },
  created: { type: Date, default: Date.now },
  modified: { type: Date },
  dateCreated: { type: String, default: moment().format('YYYY-MM-DD') },
  hourCreated: { type: String, default: moment().format('HH:mm:ss') },
  dateModified: { type: String, default: moment().format('YYYY-MM-DD') },
  hourModified: { type: String, default: moment().format('HH:mm:ss') },
  idUserModified: { type: Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  isInheritPermissions: { type: Boolean, default: false },
  permissions: [
    {
      _id: { type: Schema.Types.ObjectId, ref: 'Permission' },
      name: { type: String, default: '' },
      description: { type: String, default: '' },
      action: { type: String, default: true },
      isActive: { type: Boolean, default: true },
    },
  ],
});

// Registrar plugin de multi-tenant automático
RolSchema.plugin(tenantPlugin);

// Configuración de índices compuestos multi-tenant para rendimiento y aislamiento de unicidad
RolSchema.index({ company: 1, name: 1 }, { unique: true });
RolSchema.index({ company: 1, codeRol: 1 }, { unique: true });
RolSchema.index({ company: 1, description: 1 });
addTenantIndexes(RolSchema, ['codeRol']);

export const RolModel = model<Rol>('Rol', RolSchema);
