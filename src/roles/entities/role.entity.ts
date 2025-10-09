import { Schema, model, Document } from 'mongoose';
import moment from 'moment';



interface Permission  {
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
  permissions: Permission[]
}

export const RolSchema = new Schema({
    name: { type: String, unique: true, required: [true, 'The name field is required'] },
    codeRol: { type: String, unique: true, required: [true, 'The code field is required'] },
    description: { type: String, required: [true, 'The description field is required'] },
    created: { type: Date, default: Date.now },
    modified: { type: Date },
    dateCreated: { type: String, default: moment().format('YYYY-MM-DD') },
    hourCreated: { type: String, default: moment().format('HH:mm:ss') },
    dateModified: { type: String, default: moment().format('YYYY-MM-DD') },
    hourModified: { type: String, default: moment().format('HH:mm:ss') },
    idUserModified: { type: Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
    isInheritPermissions: { type: Boolean, default: false },
    permissions: [{
      _id: { type: Schema.Types.ObjectId, ref: 'Permission' },
      name: { type: String, default: ''},
      description: { type: String, default: ''},
      action: { type: String,  default: true },
      isActive: { type: Boolean, default: true },
    }],
});


export const RolModel = model<Rol>('Rol', RolSchema);
