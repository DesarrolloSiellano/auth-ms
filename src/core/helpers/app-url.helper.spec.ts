import {
  resolveRequestOrigin,
  resolveAppBaseUrl,
  DEFAULT_FRONT_URL,
} from './app-url.helper';

describe('app-url.helper', () => {
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

  it('resolveAppBaseUrl prioriza el origen de la petición', () => {
    expect(
      resolveAppBaseUrl({ headers: { origin: 'http://localhost:4200' } }),
    ).toBe('http://localhost:4200');
  });

  it('resolveAppBaseUrl cae al front por defecto (no usa env)', () => {
    expect(resolveAppBaseUrl({})).toBe(DEFAULT_FRONT_URL);
  });
});
