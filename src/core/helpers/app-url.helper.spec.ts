import { resolveRequestOrigin, resolveAppBaseUrl } from './app-url.helper';

describe('app-url.helper', () => {
  const originalAppUrl = process.env.APP_URL;

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  });

  it('usa el header Origin automáticamente', () => {
    expect(
      resolveRequestOrigin({ headers: { origin: 'http://localhost:4200' } }),
    ).toBe('http://localhost:4200');
  });

  it('quita la barra final del Origin', () => {
    expect(
      resolveRequestOrigin({ headers: { origin: 'https://app.bponet.com.co/' } }),
    ).toBe('https://app.bponet.com.co');
  });

  it('deriva el origen del Referer cuando no hay Origin', () => {
    expect(
      resolveRequestOrigin({
        headers: { referer: 'https://midominio.com/usuarios?x=1' },
      }),
    ).toBe('https://midominio.com');
  });

  it('devuelve undefined sin cabeceras', () => {
    expect(resolveRequestOrigin({})).toBeUndefined();
    expect(resolveRequestOrigin(undefined)).toBeUndefined();
  });

  it('resolveAppBaseUrl prioriza el request sobre APP_URL', () => {
    process.env.APP_URL = 'https://config.example.com';
    expect(
      resolveAppBaseUrl({ headers: { origin: 'http://localhost:4200' } }),
    ).toBe('http://localhost:4200');
  });

  it('resolveAppBaseUrl cae a APP_URL y luego al default', () => {
    process.env.APP_URL = 'https://config.example.com';
    expect(resolveAppBaseUrl({})).toBe('https://config.example.com');

    delete process.env.APP_URL;
    expect(resolveAppBaseUrl({})).toBe('https://app.bponet.com.co');
  });
});
