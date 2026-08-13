import { Schema } from 'mongoose';
import { tenantPlugin } from './tenant.plugin';
import { tenantLocalStorage } from './tenant.context';

describe('tenantPlugin', () => {
  function applyPlugin(): jest.Mock {
    const schema = new Schema({}) as any;
    const preSpy = jest.spyOn(schema, 'pre');
    tenantPlugin(schema);
    return preSpy;
  }

  function getHook(preSpy: jest.Mock, name: string): any {
    const call = preSpy.mock.calls.find(([method]) => method === name);
    return call ? call[1] : undefined;
  }

  const store = { tenantId: 'T-001', companyId: 'EmpresaX' };

  it('registra hooks para todos los métodos de query y validate', () => {
    const preSpy = applyPlugin();
    const methods = [
      'find', 'findOne', 'countDocuments', 'updateOne', 'updateMany',
      'deleteOne', 'deleteMany', 'distinct', 'findOneAndUpdate',
      'findOneAndDelete', 'findOneAndReplace', 'validate',
    ];
    for (const m of methods) {
      expect(preSpy).toHaveBeenCalledWith(m, expect.any(Function));
    }
  });

  describe('query hooks', () => {
    it('inyecta el filtro de company cuando hay contexto y no es superadmin', () => {
      const preSpy = applyPlugin();
      const hook = getHook(preSpy, 'find');
      const next = jest.fn();
      const query = { getOptions: () => ({}), where: jest.fn() };

      tenantLocalStorage.run(store, () => {
        hook.call(query, next);
      });

      expect(query.where).toHaveBeenCalledWith({ company: 'EmpresaX' });
      expect(next).toHaveBeenCalled();
    });

    it('no filtra si es superadmin', () => {
      const preSpy = applyPlugin();
      const hook = getHook(preSpy, 'find');
      const next = jest.fn();
      const query = { getOptions: () => ({}), where: jest.fn() };

      tenantLocalStorage.run({ ...store, isSuperAdmin: true }, () => {
        hook.call(query, next);
      });

      expect(query.where).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('no filtra si el query trae bypassTenant', () => {
      const preSpy = applyPlugin();
      const hook = getHook(preSpy, 'find');
      const next = jest.fn();
      const query = { getOptions: () => ({ bypassTenant: true }), where: jest.fn() };

      tenantLocalStorage.run(store, () => {
        hook.call(query, next);
      });

      expect(query.where).not.toHaveBeenCalled();
    });

    it('no filtra si no hay contexto de tenant', () => {
      const preSpy = applyPlugin();
      const hook = getHook(preSpy, 'find');
      const next = jest.fn();
      const query = { getOptions: () => ({}), where: jest.fn() };

      hook.call(query, next);

      expect(query.where).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validate hook', () => {
    it('inyecta company y tenantId en documentos nuevos', () => {
      const preSpy = applyPlugin();
      const hook = getHook(preSpy, 'validate');
      const next = jest.fn();
      const doc = {
        isNew: true,
        get: jest.fn().mockReturnValue(undefined),
        set: jest.fn(),
      };

      tenantLocalStorage.run(store, () => {
        hook.call(doc, next);
      });

      expect(doc.set).toHaveBeenCalledWith('company', 'EmpresaX');
      expect(doc.set).toHaveBeenCalledWith('tenantId', 'T-001');
      expect(next).toHaveBeenCalled();
    });

    it('no sobrescribe company/tenantId ya definidos', () => {
      const preSpy = applyPlugin();
      const hook = getHook(preSpy, 'validate');
      const next = jest.fn();
      const doc = {
        isNew: true,
        get: jest.fn((field: string) => (field === 'company' ? 'YaDef' : undefined)),
        set: jest.fn(),
      };

      tenantLocalStorage.run(store, () => {
        hook.call(doc, next);
      });

      expect(doc.set).not.toHaveBeenCalledWith('company', 'EmpresaX');
      expect(doc.set).toHaveBeenCalledWith('tenantId', 'T-001');
    });
  });
});
