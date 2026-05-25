import { Schema, model, Document } from 'mongoose';
import { Rol } from 'src/roles/entities/role.entity';
import moment from 'moment';
import {
  TenantBaseSchema,
  addTenantIndexes,
} from 'src/core/database/tenant.base.schema';
import { tenantPlugin } from 'src/core/database/tenant.plugin';

export interface Permission extends Document {
  tenantId: string;
  company: string;
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

export const PermissionSchema = new Schema({
  ...TenantBaseSchema,
  name: { type: String, required: true },
  description: { type: String, required: true },
  action: { type: String, required: true },
  resource: { type: String, required: true },
  resourceId: { type: String },
  type: { type: String, required: true },
  rol: { type: Schema.Types.ObjectId, ref: 'Rol' },
  created: { type: Date, default: Date.now },
  modified: { type: Date, default: Date.now },
  dateCreated: { type: String, default: moment().format('YYYY-MM-DD') },
  hourCreated: { type: String, default: moment().format('HH:mm:ss') },
  dateModified: { type: String, default: moment().format('YYYY-MM-DD') },
  hourModified: { type: String, default: moment().format('HH:mm:ss') },
  idUserModified: { type: Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
});

// Registrar plugin de multi-tenant automático
PermissionSchema.plugin(tenantPlugin);

// Configuración de índices compuestos multi-tenant para rendimiento y aislamiento de unicidad
PermissionSchema.index({ company: 1, name: 1 }, { unique: true });
PermissionSchema.index({ company: 1, action: 1 });
PermissionSchema.index({ company: 1, resource: 1 });
addTenantIndexes(PermissionSchema, ['name']);

export const PermissionModel = model<Permission>(
  'permissions',
  PermissionSchema,
);
