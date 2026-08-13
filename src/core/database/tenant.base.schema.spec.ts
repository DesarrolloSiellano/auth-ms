import { addTenantIndexes } from './tenant.base.schema';

describe('tenant.base.schema', () => {
  it('addTenantIndexes agrega el índice compuesto y los por campo', () => {
    const schema = { index: jest.fn() };
    addTenantIndexes(schema as any, ['email', 'phone']);

    expect(schema.index).toHaveBeenCalledWith({ tenantId: 1, company: 1 });
    expect(schema.index).toHaveBeenCalledWith({ tenantId: 1, email: 1 });
    expect(schema.index).toHaveBeenCalledWith({ tenantId: 1, phone: 1 });
  });
});
