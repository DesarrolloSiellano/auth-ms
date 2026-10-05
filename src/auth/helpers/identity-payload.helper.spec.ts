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
      isAdmin: true,
      isTrial: false,
      trialStartedAt: null,
      trialEndsAt: null,
      emailVerified: false,
    });
  });

  it('incluye la información de prueba cuando el usuario es trial', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-08T00:00:00Z');
    const payload = buildIdentityPayload({
      _id: 'abc123',
      name: 'Juan',
      email: 'juan@mail.com',
      isActived: true,
      company: 'EmpresaX',
      tenantId: '000000',
      isTrial: true,
      trialStartedAt: start,
      trialEndsAt: end,
    });

    expect(payload.isTrial).toBe(true);
    expect(payload.trialStartedAt).toBe(start);
    expect(payload.trialEndsAt).toBe(end);
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
    expect(payload).not.toHaveProperty('isNewUser');
  });
});
