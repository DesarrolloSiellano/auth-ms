import { Test, TestingModule } from '@nestjs/testing';
import {
  LocaleService,
  DEFAULT_TIMEZONE,
  DEFAULT_LOCALE,
} from './locale.service';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

describe('LocaleService', () => {
  let service: LocaleService;
  let tenantConfigService: any;

  beforeEach(async () => {
    tenantConfigService = { getPolicyValue: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocaleService,
        { provide: TenantConfigService, useValue: tenantConfigService },
      ],
    }).compile();
    service = module.get(LocaleService);
  });

  it('usa defaults cuando la política no está definida', async () => {
    tenantConfigService.getPolicyValue.mockResolvedValue(undefined);
    await expect(service.getTimezone('t', 'c')).resolves.toBe(
      DEFAULT_TIMEZONE,
    );
    await expect(service.getLocale('t', 'c')).resolves.toBe(DEFAULT_LOCALE);
  });

  it('devuelve el valor configurado', async () => {
    tenantConfigService.getPolicyValue.mockImplementation(
      (_t: any, _c: any, key: string) =>
        Promise.resolve(
          key === 'general.timezone' ? 'Europe/Madrid' : 'es-ES',
        ),
    );
    await expect(service.getTimezone('t', 'c')).resolves.toBe('Europe/Madrid');
    await expect(service.getLocale('t', 'c')).resolves.toBe('es-ES');
  });

  it('formatea fecha y hora en la zona indicada', () => {
    // 2026-01-01T05:30:00Z => 00:30 en America/Bogota (UTC-5).
    const date = new Date('2026-01-01T05:30:00Z');
    expect(service.formatDate(date, 'America/Bogota')).toBe('2026-01-01');
    expect(service.formatTime(date, 'America/Bogota')).toBe('00:30:00');
    // En Madrid (UTC+1) es el mismo día 06:30.
    expect(service.formatTime(date, 'Europe/Madrid')).toBe('06:30:00');
  });

  it('devuelve cadena vacía para fechas inválidas', () => {
    expect(service.formatDate(null, 'UTC')).toBe('');
    expect(service.formatTime('no-es-fecha', 'UTC')).toBe('');
  });

  it('formatDateTime devuelve una cadena no vacía', () => {
    const value = service.formatDateTime(
      new Date('2026-01-01T05:30:00Z'),
      'America/Bogota',
      'es-CO',
    );
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });
});
