import { TcpDocsController } from './tcp-docs.controller';

describe('TcpDocsController', () => {
  const controller = new TcpDocsController();

  it('devuelve el catálogo con los 45 comandos TCP', () => {
    const result = controller.messagePatterns();
    expect(result.total).toBe(45);
    expect(result.commands).toHaveLength(45);
  });

  it('incluye validateSession y validateUser', () => {
    const result = controller.messagePatterns();
    const commands = result.commands.map((c) => c.command);
    expect(commands).toContain('validateUser');
    expect(commands).toContain('validateSession');
  });

  it('todos los payloads exigen serviceKey', () => {
    const result = controller.messagePatterns();
    const withPayload = result.commands.filter((c) => c.payloadExample);
    withPayload.forEach((c) => {
      expect(c.payloadExample).toHaveProperty('serviceKey');
    });
  });

  it('agrupa por dominios esperados', () => {
    const result = controller.messagePatterns();
    expect(result.domains).toEqual(
      expect.arrayContaining([
        'auth',
        'users',
        'roles',
        'permissions',
        'modules',
        'companies',
        'tenant-config',
      ]),
    );
  });
});
