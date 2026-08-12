import { buildIdentityPayload } from './identity-payload.helper';

describe('buildIdentityPayload', () => {
  it('debe devolver solo campos de identidad y contexto de tenant', () => {
    const user = {
      _id: 'abc123',
      name: 'Juan',
      lastName: 'Pérez',
      email: 'juan@mail.com',
      username: 'juanp',
      password: 'hashed-secret',
      isActived: true,
      isAdmin: true,
      isSuperAdmin: false,
      isNewUser: false,
      company: 'EmpresaX',
      tenantId: '000000',
      modules: [{ name: 'adminUserModule', routes: [] }],
      roles: [{ name: 'Administrador', codeRol: 'ADM' }],
      permissions: [{ name: 'create' }],
    };

    const payload = buildIdentityPayload(user);

    expect(payload).toEqual({
      _id: 'abc123',
      name: 'Juan',
      lastName: 'Pérez',
      email: 'juan@mail.com',
      username: 'juanp',
      isActived: true,
      company: 'EmpresaX',
      tenantId: '000000',
      isSuperAdmin: false,
    });
  });

  it('no debe incluir modules, roles, permissions ni datos sensibles', () => {
    const user = {
      _id: 'abc123',
      name: 'Juan',
      email: 'juan@mail.com',
      username: 'juanp',
      isActived: true,
      company: 'EmpresaX',
      tenantId: '000000',
      modules: [{ name: 'adminUserModule', routes: [] }],
      roles: [{ name: 'Administrador', codeRol: 'ADM' }],
      permissions: [{ name: 'create' }],
      password: 'hashed-secret',
      passwordResetToken: 'token',
    };

    const payload = buildIdentityPayload(user);

    expect(payload).not.toHaveProperty('modules');
    expect(payload).not.toHaveProperty('roles');
    expect(payload).not.toHaveProperty('permissions');
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('passwordResetToken');
    expect(payload).not.toHaveProperty('isAdmin');
    expect(payload).not.toHaveProperty('isNewUser');
  });
});
