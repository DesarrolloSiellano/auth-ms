import moment from 'moment';
import { Schema, model, Document } from 'mongoose';


export interface Company extends Document {
    created: Date;
    modified: Date;
    name: string;
    legalRepresentative?: string;
    rut?: string;
    address?: string;
    phone?: string;
    email?: string;
    web?: string;
    logo?: string;
    id: string;
    isActive: boolean;
    dateCreated?: string;
    hourCreated?: string;
    dateModified?: string;
    
    hourModified?: string;
    idUserModified?: string;

};

// Define schema for session id x 
export const CompanySchema = new Schema({
    created: { type: Date, default: Date.now },
    modified: { type: Date, default: Date.now },
    name: { type: String, required: true, unique: true },
    legalRepresentative: { type: String },
    rut: { type: String, unique: true, sparse: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    web: { type: String },
    logo: { type: String },
    id: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true },
    dateCreated: { type: String, default: moment().format('YYYY-MM-DD') },
    hourCreated: { type: String, default: moment().format('HH:mm:ss') },
    dateModified: { type: String, default: moment().format('YYYY-MM-DD') },
    hourModified: { type: String, default: moment().format('HH:mm:ss') },
    idUserModified: { type: Schema.Types.ObjectId, ref: 'User' },
});

export const CompanyModel = model<Company>('companies', CompanySchema);
