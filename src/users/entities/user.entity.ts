import { Schema, model, Document } from 'mongoose';

import * as bcrypt from 'bcrypt';

import { Permission } from 'src/permissions/entities/permission.entity';
import { Rol } from 'src/roles/entities/role.entity';
import { Module } from 'src/modules/entities/module.entity';

export interface User extends Document {
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
  company: string;
  passwordResetToken: string;
  passwordResetExpires: Date;
  modules: Module[];
  roles: Rol[];
  permissions: Permission[];
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
    unique: true,
    required: [true, 'The email field is required'],
    match: [/.+@.+\..+/, 'Please enter a valid email'],
  },
  phone: { type: String, required: false, trim: true },
  //username: { type: String, unique: true, },
  password: {
    type: String,
    required: [true, 'The password field is required'],
  },
  roles: [
    {
      _id: { type: Schema.Types.ObjectId, ref: 'Rol' },
      name: { type: String, default: '' },
      codeRol: { type: String, default: '' },
      description: { type: String, default: '' },
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
    },
  ],
  permissions: [
    {
      _id: { type: Schema.Types.ObjectId, ref: 'Permission' },
      name: { type: String, default: '' },
      description: { type: String, default: '' },
      action: { type: String, default: true },
      isActive: { type: Boolean, default: true },
    },
  ],
  modules: [
    {
      _id: { type: Schema.Types.ObjectId, ref: 'Module' },
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
  company: { type: String },
  created: { type: Date, default: Date.now },
  modified: { type: Date, default: Date.now },
  isActived: { type: Boolean, default: true },
  isAdmin: { type: Boolean, default: false }, // Assuming Role is a separate entity
  isSuperAdmin: { type: Boolean, default: false }, // Assuming Role is a separate entity
  isNewUser: { type: Boolean, default: true },
  // Assuming Role is a separate entity
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // Si no se ha modificado la contraseña, continúa
  const salt = await bcrypt.genSalt(10); // Genera un nuevo salt (10 rounds por defecto)
  this.password = await bcrypt.hash(this.password, salt); // Encripta la contraseña
  next();
});


export const UserModel = model<User>('User', UserSchema);
