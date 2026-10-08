import { Schema } from 'mongoose';
import { tenantLocalStorage } from './tenant.context';

export function tenantPlugin(schema: Schema) {
  // 1. Métodos de Query a interceptar para añadir el filtro de compañía.
  //
  // Nota: en Mongoose 8 `findById` delega en `findOne`, `findByIdAndUpdate` en
  // `findOneAndUpdate` y `findByIdAndDelete` en `findOneAndDelete`, por lo que
  // los hooks base ya cubren las operaciones por id. Se declaran también los
  // nombres `findById*` de forma explícita (defensa en profundidad / claridad).
  const queryMethods = [
    'find',
    'findOne',
    'findById',
    'countDocuments',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'distinct',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'findByIdAndUpdate',
    'findByIdAndDelete',
  ];

  queryMethods.forEach((method) => {
    schema.pre(method as any, function (next) {
      const store = tenantLocalStorage.getStore();

      // Si hay un tenant en el contexto asíncrono
      if (store) {
        const options = (this as any).getOptions?.() || {};

        // Si el usuario es SuperAdmin o el query especifica bypassTenant
        // explícitamente, saltamos el filtro.
        if (store.isSuperAdmin || options?.bypassTenant === true) {
          return next();
        }

        // Inyectamos el filtro de empresa + tenant de forma automática.
        const filter: Record<string, string> = {};
        if (store.companyId) filter.company = store.companyId;
        if (store.tenantId) filter.tenantId = store.tenantId;
        if (Object.keys(filter).length > 0) {
          (this as any).where(filter);
        }
      }

      next();
    });
  });

  // 2. Interceptar `validate` para fijar compañía/tenant al crear documentos.
  schema.pre('validate', function (next) {
    const store = tenantLocalStorage.getStore();

    if (store && this.isNew) {
      if (store.isSuperAdmin) {
        // El SuperAdmin puede especificar la empresa; solo se completa si falta.
        if (!this.get('company') && store.companyId) {
          this.set('company', store.companyId);
        }
        if (!this.get('tenantId') && store.tenantId) {
          this.set('tenantId', store.tenantId);
        }
      } else {
        // Usuario de empresa: se FUERZA su tenant (no se permite inyectar otro).
        if (store.companyId) this.set('company', store.companyId);
        if (store.tenantId) this.set('tenantId', store.tenantId);
      }
    }

    next();
  });
}
