/**
 * Script de migración: normaliza y asegura la unicidad global de `username`
 * en la colección `users`, y elimina el índice único de `phone`.
 *
 * Contexto:
 *   - `email` es único global (sin cambios).
 *   - `username` es opcional pero único global (índice `unique + sparse`).
 *   - `phone` es opcional y NO es único (se elimina el índice `phone_1` si
 *     existía de una versión anterior).
 *
 * Antes de que Mongo cree el índice de `username` hay que:
 *   1. Convertir usuarios nulos/vacíos/espacios a "no definido" (sparse).
 *   2. Normalizar a minúsculas.
 *   3. Resolver duplicados existentes: se conserva el primer registro por
 *      `_id` ascendente y se elimina el valor en los duplicados.
 *   4. Recrear `username_1` como `unique + sparse` y eliminar `phone_1`.
 *
 * Es idempotente: volver a ejecutarlo no produce cambios.
 *
 * Variables requeridas:
 *   MONGO_URI (obligatoria)
 *
 * Ejecución:
 *   # Desarrollo
 *   npm run script:normalize-unique-fields
 *
 *   # Producción (con la app compilada)
 *   node dist/set-data-init/scripts/normalize-user-unique-fields.js
 *
 * Recomendación: hacer backup de la base de datos antes de ejecutarlo en prod.
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

function normalize(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed === '' ? undefined : trimmed;
}

async function dropIndexIfExists(
  collection: any,
  name: string,
): Promise<boolean> {
  const indexes = await collection.indexes();
  if (indexes.some((index) => index.name === name)) {
    await collection.dropIndex(name);
    return true;
  }
  return false;
}

export async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('Falta la variable obligatoria MONGO_URI.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db!;
  const users = db.collection('users');

  const allUsers = await users.find({}).sort({ _id: 1 }).toArray();

  const seenUsernames = new Set<string>();

  let normalizedCount = 0;
  let duplicatedUsernames = 0;

  for (const user of allUsers) {
    const set: Record<string, any> = {};
    const unset: Record<string, ''> = {};

    const username = normalize(user.username);

    if (username) {
      if (seenUsernames.has(username)) {
        // Duplicado: se elimina el valor del registro posterior.
        unset.username = '';
        duplicatedUsernames++;
      } else {
        seenUsernames.add(username);
        if (username !== user.username) set.username = username;
      }
    } else if (user.username !== undefined && user.username !== null) {
      unset.username = '';
    }

    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
      continue;
    }

    const operation: Record<string, any> = {};
    if (Object.keys(set).length > 0) operation.$set = set;
    if (Object.keys(unset).length > 0) operation.$unset = unset;

    await users.updateOne({ _id: user._id }, operation);
    normalizedCount++;
  }

  // `phone` deja de ser único.
  const droppedPhone = await dropIndexIfExists(users, 'phone_1');

  // Recrear el índice único (sparse) de username.
  const droppedUsername = await dropIndexIfExists(users, 'username_1');
  await users.createIndex(
    { username: 1 },
    { unique: true, sparse: true, name: 'username_1' },
  );

  console.log(
    `Migración completada. Registros ajustados: ${normalizedCount}. ` +
      `Usuarios duplicados resueltos: ${duplicatedUsernames}. ` +
      `Índices previos eliminados: phone_1=${droppedPhone}, username_1=${droppedUsername}. ` +
      'Índice único (sparse) creado: username_1. phone_1 eliminado.',
  );

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error ejecutando la migración de unicidad:', error);
    process.exit(1);
  });
}
