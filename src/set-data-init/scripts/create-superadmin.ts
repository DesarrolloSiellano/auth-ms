/**
 * Script para crear el usuario superadmin inicial en PRODUCCIÓN.
 *
 * En producción el seed automático NO crea admins por defecto (ver
 * src/set-data-init/set-data-init.service.ts). Este script crea el primer
 * superadmin de forma controlada y explícita.
 *
 * Variables requeridas:
 *   MONGO_URI        (obligatoria)
 *   ADMIN_EMAIL      (obligatoria)
 *   ADMIN_PASSWORD   (obligatoria)
 *   ADMIN_NAME       (opcional, por defecto 'admin')
 *   ADMIN_LASTNAME   (opcional, por defecto 'admin')
 *   ADMIN_USERNAME   (opcional, por defecto = ADMIN_EMAIL)
 *
 * Ejecución:
 *   # Desarrollo
 *   npm run script:create-admin
 *
 *   # Producción (con la app compilada)
 *   ADMIN_EMAIL=admin@empresa.com ADMIN_PASSWORD='clave-fuerte' \
 *     node dist/set-data-init/scripts/create-superadmin.js
 *
 * El usuario se crea con isNewUser=true para forzar el cambio de contraseña
 * en el primer inicio de sesión.
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ADMIN_COMPANY } from '../helpers/companies.admin';

dotenv.config();

export async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!mongoUri || !email || !password) {
    console.error(
      'Faltan variables obligatorias. Define MONGO_URI, ADMIN_EMAIL y ADMIN_PASSWORD.',
    );
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db!;

  // 1. Asegurar la compañía BPONET (el seed automático la crea si existe)
  const companies = db.collection('companies');
  let company = await companies.findOne({ name: 'BPONET' });
  if (!company) {
    const insert = await companies.insertOne(ADMIN_COMPANY[0]);
    company = { _id: insert.insertedId, name: 'BPONET' };
    console.log('Compañía BPONET creada.');
  }

  // 2. Verificar que el usuario no exista
  const users = db.collection('users');
  const existing = await users.findOne({
    $or: [{ email }, { username: process.env.ADMIN_USERNAME || email }],
  });
  if (existing) {
    console.log(`El superadmin ${email} ya existe. No se realizó ningún cambio.`);
    await mongoose.disconnect();
    return;
  }

  // 3. Cargar todos los módulos/roles/permisos activos
  const modules = await db.collection('modules').find({}).toArray();
  const roles = await db.collection('roles').find({}).toArray();
  const permissions = await db.collection('permissions').find({}).toArray();

  // 4. Crear el superadmin con contraseña hasheada
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hourStr = now.toTimeString().split(' ')[0];

  await users.insertOne({
    name: process.env.ADMIN_NAME || 'admin',
    lastName: process.env.ADMIN_LASTNAME || 'admin',
    email,
    username: process.env.ADMIN_USERNAME || email,
    password: passwordHash,
    phone: '',
    company: 'BPONET',
    tenantId: String(company._id),
    isActived: true,
    isAdmin: true,
    isSuperAdmin: true,
    isNewUser: true,
    modules,
    roles,
    permissions,
    created: now,
    modified: now,
    createdDate: dateStr,
    createdHour: hourStr,
    updatedDate: dateStr,
    updatedAtHour: hourStr,
  });

  console.log(`Superadmin ${email} creado correctamente (BPONET).`);
  await mongoose.disconnect();
}

// Solo se ejecuta cuando se lanza directamente como script.
if (require.main === module) {
  main().catch((error) => {
    console.error('Error creando el superadmin:', error);
    process.exit(1);
  });
}
