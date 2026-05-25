import { Schema } from 'mongoose';
import { tenantLocalStorage } from './tenant.context';

export function tenantPlugin(schema: Schema) {
  // 1. Métodos de Query a interceptar para añadir el filtro de compañía
  const queryMethods = [
    'find',
    'findOne',
    'countDocuments',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'distinct',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
  ];

  queryMethods.forEach((method) => {
    schema.pre(method as any, function (next) {
      const store = tenantLocalStorage.getStore();

      // Si hay un tenant en el contexto asíncrono
      if (store) {
        const options = (this as any).getOptions();

        // Si el usuario es SuperAdmin o el query especifica bypassTenant explícitamente, saltamos el filtro
        if (store.isSuperAdmin || options?.bypassTenant === true) {
          return next();
        }

        // De lo contrario, inyectamos el filtro de compañía de forma automática
        (this as any).where({ company: store.companyId });
      }

      next();
    });
  });

  // 2. Interceptar el método validate() para inyectar automáticamente compañía y tenantId al crear documentos antes de la validación
  schema.pre('validate', function (next) {
    const store = tenantLocalStorage.getStore();

    if (store && this.isNew) {
      // Inyectar company si no se especificó manualmente
      if (!this.get('company')) {
        this.set('company', store.companyId);
      }

      // Inyectar tenantId si no se especificó manualmente
      if (!this.get('tenantId')) {
        this.set('tenantId', store.tenantId);
      }
    }

    next();
  });
}
