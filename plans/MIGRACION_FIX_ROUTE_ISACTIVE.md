# Migración: normalización de `isActive` en rutas y sub-permisos

## ¿Para qué es?

Es una **migración de datos de una sola vez** (no forma parte del arranque de la
aplicación). Corrige registros históricos en MongoDB donde las rutas y sus
sub-permisos (`children`) quedaron con `isActive: null`.

Ese `null` provocaba que, en el editor de usuarios, los sub-permisos aparecieran
**deshabilitados** aunque estuvieran habilitados en la base de datos.

## ¿Qué hace?

1. Se conecta a MongoDB usando `MONGO_URI` (desde `.env`).
2. Recorre la colección **`modules`**: por cada documento toma el arreglo de rutas
   (acepta `routes` o `router`) y, en cada ruta y en cada `children`, convierte
   `isActive` nulo/indefinido → `true`.
3. Recorre la colección **`users`**: hace lo mismo con los módulos embebidos en
   `user.modules`.
4. Solo escribe (`updateOne` con `$set`) en los documentos donde hubo cambios.
5. Imprime un resumen:
   `Módulos actualizados: X/N. Usuarios actualizados: Y/N.`

### Características

- **Idempotente**: si se ejecuta de nuevo, reporta `0` cambios.
- **No borra ni crea** documentos: solo normaliza el campo `isActive`; respeta
  nombres, paths, iconos y estructura.
- **No afecta autenticación**: el guard usa `module.isActive` y los roles, no el
  `isActive` de las rutas. Este cambio es para la UI de permisos.

## ¿Cómo se ejecuta?

### Desarrollo

```bash
cd auth-ms
npm run script:fix-route-isactive
```

### Producción (con la app compilada)

> Recomendación: hacer un **backup de la base de datos** antes de ejecutarlo.

```bash
cd auth-ms
npm run build
node dist/set-data-init/scripts/fix-route-isactive.js
```

### Requisitos

- Variable de entorno `MONGO_URI` disponible (en `.env` o exportada en el shell).

```bash
# Ejemplo con variable explícita
MONGO_URI="mongodb://localhost:27017/users-ms" \
  node dist/set-data-init/scripts/fix-route-isactive.js
```

## Resultado esperado (ejemplo)

```
Migración completada. Módulos actualizados: 2/3. Usuarios actualizados: 1/2.
```

Segunda ejecución (idempotencia):

```
Migración completada. Módulos actualizados: 0/3. Usuarios actualizados: 0/2.
```

## Verificación manual

```bash
mongosh "mongodb://localhost:27017/users-ms" --quiet --eval '
db.modules.find({}).forEach(m => print(m.name + " routes=" +
  (m.routes || []).map(r => r.name + ":" + r.isActive).join(",")));
'
```

## Archivos relacionados

- Script: `src/set-data-init/scripts/fix-route-isactive.ts`
- Comando npm: `script:fix-route-isactive` (`package.json`)
- Seed corregido: `src/set-data-init/helpers/modules.admin.ts`
- Lógica de resolución: `src/users/helpers/user-resolution.helper.ts`
