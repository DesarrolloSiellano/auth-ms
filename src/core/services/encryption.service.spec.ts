import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    service = new EncryptionService();
  });

  it('hashea una contraseña y la verifica correctamente', async () => {
    const hash = await service.hashPassword('password123');
    expect(hash).not.toBe('password123');

    const valid = await service.verifyPassword('password123', hash);
    expect(valid).toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await service.hashPassword('password123');
    const valid = await service.verifyPassword('otra-clave', hash);
    expect(valid).toBe(false);
  });
});
