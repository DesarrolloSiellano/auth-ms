import { RestDocsController } from './rest-docs.controller';

describe('RestDocsController', () => {
  const controller = new RestDocsController();

  it('devuelve el catálogo de endpoints REST', () => {
    const result = controller.endpoints();
    expect(result.total).toBeGreaterThan(0);
    expect(result.endpoints).toHaveLength(result.total);
  });

  it('cada endpoint tiene método, ruta, auth y descripción', () => {
    const result = controller.endpoints();
    result.endpoints.forEach((e) => {
      expect(e.method).toBeDefined();
      expect(e.path.startsWith('/api/')).toBe(true);
      expect(typeof e.auth).toBe('string');
      expect(e.description.length).toBeGreaterThan(0);
    });
  });

  it('incluye dominios clave', () => {
    const result = controller.endpoints();
    expect(result.domains).toEqual(
      expect.arrayContaining(['auth', 'users', 'sessions', 'tenants']),
    );
  });
});
