import { Schema, model, Document } from 'mongoose';
import moment from 'moment';

import * as bcrypt from 'bcrypt';

import { Permission } from 'src/permissions/entities/permission.entity';
import { Rol } from 'src/roles/entities/role.entity';
import { Module } from 'src/modules/entities/module.entity';
import {
  TenantBaseSchema,
  addTenantIndexes,
} from 'src/core/database/tenant.base.schema';
import { tenantPlugin } from 'src/core/database/tenant.plugin';

export interface User extends Document {
  tenantId: string;
  company: string;
  name: string;
  lastName: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  created: Date;
  modified: Date;
  isActived: boolean;
  isAdmin: boolean;
  isNewUser: boolean;
  isSuperAdmin: boolean;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  modules: Module[];
  roles: Rol[];
  permissions: Permission[];
  createdDate: string;
  createdHour: string;
  updatedDate: string;
  updatedAtHour: string;
  idUserModified: string;
  idUserCreated: string;
}

export const UserSchema = new Schema({
  name: {
    type: String,
    required: [true, 'The name field is required'],
    trim: true,
    minLength: [3, 'Name must be at least 3 characters long'],
    maxLength: [100, 'Name must not exceed 200 characters'],
  },
  lastName: {
    type: String,
    required: [true, 'The lastName field is required'],
    trim: true,
    minLength: [3, 'Name must be at least 3 characters long'],
    maxLength: [100, 'Name must not exceed 200 characters'],
  },
  email: {
    type: String,
    required: [true, 'The email field is required'],
    match: [/.+@.+\..+/, 'Please enter a valid email'],
    lowercase: true,
    unique: true,
  },
  phone: { type: String, required: false, trim: true },
  //username: { type: String, unique: true, },
  password: {
    type: String,
    required: [true, 'The password field is required'],
  },
  roles: [
    {
      name: { type: String, default: '', ref: 'Rol' },
      codeRol: { type: String, default: '' },
      description: { type: String, default: '' },
      isActive: { type: Boolean, default: true },
      isInheritPermissions: { type: Boolean, default: false },
      permissions: [
        {
          name: { type: String, default: '' },
          description: { type: String, default: '' },
          action: { type: String, default: true },
          isActive: { type: Boolean, default: true },
        },
      ],
    },
  ],
  permissions: [
    {
      name: { type: String, default: '' },
      description: { type: String, default: '' },
      action: { type: String, default: true },
      isActive: { type: Boolean, default: true },
    },
  ],
  modules: [
    {
      name: { type: String, default: '' },
      description: { type: String, default: '' },
      isActive: { type: Boolean, default: true },
      isSystemModule: { type: Boolean, default: false },
      routes: [
        {
          name: { type: String, default: '' },
          path: { type: String, default: '' },
          initPath: { type: String },
          icon: { type: String, default: '' },
          isActive: { type: Boolean, default: true },
          children: [
            {
              name: { type: String, default: '' },
              path: { type: String, default: '' },
              icon: { type: String, default: '' },
              isActive: { type: Boolean, default: true },
            },
          ],
        },
      ],
    },
  ],
  ...TenantBaseSchema,
  created: { type: Date, default: Date.now },
  modified: { type: Date, default: Date.now },
  isActived: { type: Boolean, default: true },
  isAdmin: { type: Boolean, default: false }, // Assuming Role is a separate entity
  isSuperAdmin: { type: Boolean, default: false }, // Assuming Role is a separate entity
  isNewUser: { type: Boolean, default: true },

  passwordResetToken: { type: String, required: false },
  passwordResetExpires: { type: Date, required: false },

  createdDate: { type: Date, default: moment().format('YYYY-MM-DD') },
  createdHour: { type: String, default: moment().format('HH:mm:ss') },
  updatedDate: { type: Date, default: moment().format('YYYY-MM-DD') },
  updatedAtHour: { type: String, default: moment().format('HH:mm:ss') },
  // Assuming Role is a separate entity
});

// Registrar plugin de multi-tenant automático
UserSchema.plugin(tenantPlugin);

// Configuración de índices compuestos multi-tenant para rendimiento y aislamiento de unicidad
UserSchema.index({ company: 1, email: 1 }, { unique: true });
UserSchema.index({ company: 1, name: 1, lastName: 1 });
UserSchema.index({ company: 1, username: 1 });
UserSchema.index({ company: 1, phone: 1 });
UserSchema.index({ passwordResetToken: 1 }, { sparse: true });
addTenantIndexes(UserSchema, ['email']);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // Si no se ha modificado la contraseña, continúa
  const salt = await bcrypt.genSalt(10); // Genera un nuevo salt (10 rounds por defecto)
  this.password = await bcrypt.hash(this.password, salt); // Encripta la contraseña
  next();
});

export const UserModel = model<User>('User', UserSchema);
