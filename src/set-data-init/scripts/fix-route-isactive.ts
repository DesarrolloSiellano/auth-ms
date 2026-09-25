/**
 * Script de migración: normaliza `isActive` de rutas y sub-permisos (children).
 *
 * Contexto: las rutas contenedoras (p. ej. "Pages") se sembraron con
 * `isActive: null`, y ese valor se copió a los documentos de usuario. En el
 * editor de usuarios los sub-permisos dependían del padre, por lo que aparecían
 * deshabilitados aunque estuvieran habilitados en la base de datos.
 *
 * Este script recorre las colecciones `modules` y `users` y convierte cualquier
 * `isActive` nulo/indefinido (en `routes`/`router` y en sus `children`) a `true`.
 * Es idempotente: volver a ejecutarlo no produce cambios.
 *
 * Variables requeridas:
 *   MONGO_URI (obligatoria)
 *
 * Ejecución:
 *   # Desarrollo
 *   npm run script:fix-route-isactive
 *
 *   # Producción (con la app compilada)
 *   node dist/set-data-init/scripts/fix-route-isactive.js
 *
 * Recomendación: hacer backup de la base de datos antes de ejecutarlo en prod.
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const isNil = (value: any) => value === null || value === undefined;

function normalizeRoutes(routes: any[]): { routes: any[]; changed: boolean } {
  let changed = false;

  const normalized = (routes || []).map((route) => {
    const nextRoute: any = { ...route };

    if (isNil(nextRoute.isActive)) {
      nextRoute.isActive = true;
      changed = true;
    }

    if (Array.isArray(nextRoute.children)) {
      nextRoute.children = nextRoute.children.map((child: any) => {
        const nextChild: any = { ...child };
        if (isNil(nextChild.isActive)) {
          nextChild.isActive = true;
          changed = true;
        }
        return nextChild;
      });
    }

    return nextRoute;
  });

  return { routes: normalized, changed };
}

function routesField(obj: any): string | null {
  if (Array.isArray(obj?.routes)) return 'routes';
  if (Array.isArray(obj?.router)) return 'router';
  return null;
}

export async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('Falta la variable obligatoria MONGO_URI.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db!;

  // 1. Catálogo de módulos
  let modulesUpdated = 0;
  const modules = await db.collection('modules').find({}).toArray();
  for (const moduleDoc of modules) {
    const field = routesField(moduleDoc);
    if (!field) continue;

    const { routes, changed } = normalizeRoutes(moduleDoc[field]);
    if (changed) {
      await db
        .collection('modules')
        .updateOne({ _id: moduleDoc._id }, { $set: { [field]: routes } });
      modulesUpdated++;
    }
  }

  // 2. Módulos embebidos en cada usuario
  let usersUpdated = 0;
  const users = await db.collection('users').find({}).toArray();
  for (const user of users) {
    if (!Array.isArray(user.modules)) continue;

    let userChanged = false;
    const userModules = user.modules.map((moduleDoc: any) => {
      const field = routesField(moduleDoc);
      if (!field) return moduleDoc;

      const { routes, changed } = normalizeRoutes(moduleDoc[field]);
      if (changed) {
        userChanged = true;
        return { ...moduleDoc, [field]: routes };
      }
      return moduleDoc;
    });

    if (userChanged) {
      await db
        .collection('users')
        .updateOne({ _id: user._id }, { $set: { modules: userModules } });
      usersUpdated++;
    }
  }

  console.log(
    `Migración completada. Módulos actualizados: ${modulesUpdated}/${modules.length}. ` +
      `Usuarios actualizados: ${usersUpdated}/${users.length}.`,
  );

  await mongoose.disconnect();
}

// Solo se ejecuta cuando se lanza directamente como script.
if (require.main === module) {
  main().catch((error) => {
    console.error('Error ejecutando la migración de rutas:', error);
    process.exit(1);
  });
}
