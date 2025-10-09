import { Schema, model, Document } from 'mongoose';

export interface Module extends Document {
  name: string;
  description: string;
  created: Date;
  modified?: Date;
  dateCreated?: String;
  hourCreated?: String;
  dateModified?: String;
  hourModified?: String;
  idUserModified?: String;
  isActive: boolean;
  isSystemModule: boolean;
  router: Route[];
}

export interface Route {
  name: string;
  path: string;
  icon: string;
  children?: Route[]; // Opcional, arreglo de rutas hijas
}

export const ModuleSchema = new Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  created: { type: Date, default: Date.now },
  modified: { type: Date },
  dateCreated: {
    type: String,
    default: new Date().toISOString().split('T')[0],
  },
  hourCreated: {
    type: String,
    default: new Date().toISOString().split('T')[1].split('.')[0],
  },
  dateModified: {
    type: String,
    default: new Date().toISOString().split('T')[0],
  },
  hourModified: {
    type: String,
    default: new Date().toISOString().split('T')[1].split('.')[0],
  },
  idUserModified: { type: Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  isSystemModule: { type: Boolean, default: false },
  routes: [
    {
      name: { type: String },
      path: { type: String },
      initPath: { type: String },
      icon: { type: String },
      isActive: { type: Boolean },
      children: [
        {
          name: { type: String },
          path: { type: String },
          icon: { type: String },
          isActive: { type: Boolean, default: true },
        },
      ],
    },
  ],
});

export const ModuleModel = model<Module>('Module', ModuleSchema);
