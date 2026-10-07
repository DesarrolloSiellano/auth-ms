import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';
import { AuditService } from 'src/audit/audit.service';
import { LocaleService } from 'src/core/services/locale.service';

function queryChain(value: any) {
  const chain: any = {};
  ['setOptions', 'select', 'sort', 'skip', 'limit', 'lean'].forEach((method) => {
    chain[method] = jest.fn().mockReturnValue(chain);
  });
  chain.exec = jest.fn().mockResolvedValue(value);
  return chain;
}

describe('ReportsService', () => {
  let service: ReportsService;
  const userModel: any = { find: jest.fn() };
  const sessionModel: any = { find: jest.fn() };
  const companyModel: any = { find: jest.fn() };
  const tenantConfigService: any = {
    listConfigs: jest.fn(),
    resolveConfig: jest.fn(),
  };
  const auditService: any = { findForReport: jest.fn() };
  const localeService: any = {
    getTimezone: jest.fn().mockResolvedValue('America/Bogota'),
    getLocale: jest.fn().mockResolvedValue('es-CO'),
    formatDate: jest.fn().mockReturnValue('2026-01-01'),
    formatTime: jest.fn().mockReturnValue('10:00:00'),
    formatDateTime: jest.fn().mockReturnValue('01/01/2026, 10:00:00'),
  };

  const admin = { _id: 'u1', name: 'Ana', isAdmin: true, company: 'BPONET' };
  const regular = { _id: 'u2', name: 'Beto', isAdmin: false };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getModelToken('User'), useValue: userModel },
        { provide: getModelToken('Session'), useValue: sessionModel },
        { provide: getModelToken('Company'), useValue: companyModel },
        { provide: TenantConfigService, useValue: tenantConfigService },
        { provide: AuditService, useValue: auditService },
        { provide: LocaleService, useValue: localeService },
      ],
    }).compile();
    service = module.get(ReportsService);
  });

  it('catálogo para admin con 3 reportes', () => {
    const result = service.getCatalog(admin);
    expect(result.meta.totalData).toBe(3);
  });

  it('rechaza a usuarios sin permisos', () => {
    expect(() => service.getCatalog(regular)).toThrow(ForbiddenException);
  });

  it('preview de usuarios aplica alcance por empresa', async () => {
    userModel.find.mockReturnValue(
      queryChain([
        {
          _id: 'x',
          name: 'Ana',
          lastName: 'Perez',
          email: 'a@mail.com',
          roles: [{ codeRol: 'ADM' }],
          isActived: true,
          company: 'BPONET',
        },
      ]),
    );

    const result = await service.preview('users-list', {}, admin);

    expect(userModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'BPONET' }),
    );
    expect(result.data.rows).toHaveLength(1);
  });

  it('sesiones: un admin no-super no puede cambiar de empresa con el filtro', async () => {
    sessionModel.find.mockReturnValue(queryChain([]));

    await service.preview('sessions-list', { empresa: 'OtraEmpresa' }, admin);

    expect(sessionModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'BPONET' }),
    );
  });

  it('sesiones: el SuperAdmin sí puede filtrar por empresa', async () => {
    sessionModel.find.mockReturnValue(queryChain([]));
    const superUser = { _id: 's1', name: 'Root', isSuperAdmin: true };

    await service.preview('sessions-list', { empresa: 'OtraEmpresa' }, superUser);

    expect(sessionModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ company: expect.any(RegExp) }),
    );
  });

  it('auditoría: propaga el alcance por empresa y pagina', async () => {
    auditService.findForReport.mockResolvedValue({ data: [], total: 0 });

    await service.preview('audit-access', {}, admin);

    expect(auditService.findForReport).toHaveBeenCalledWith(
      {},
      { isSuperAdmin: false, company: 'BPONET' },
      { page: 1, limit: 100 },
    );
  });

  it('auditoría: formatea fecha/hora con LocaleService', async () => {
    auditService.findForReport.mockResolvedValue({
      data: [
        {
          createdAt: new Date('2026-01-01T05:30:00Z'),
          action: 'login.success',
          category: 'auth',
          status: 'success',
          company: 'BPONET',
        },
      ],
      total: 1,
    });

    const result = await service.preview('audit-access', {}, admin);

    expect(localeService.getTimezone).toHaveBeenCalledWith(
      undefined,
      'BPONET',
    );
    expect(localeService.formatDate).toHaveBeenCalled();
    expect(localeService.formatTime).toHaveBeenCalled();
    expect(result.data.rows[0].fecha).toBe('2026-01-01');
    expect(result.data.rows[0].hora).toBe('10:00:00');
  });

  it('data devuelve el dataset (JSON) para PDF en el navegador', async () => {
    userModel.find.mockReturnValue(queryChain([]));
    const result = await service.data('users-list', {}, admin);
    expect(result.data.columns.length).toBeGreaterThan(0);
    expect(result.meta.total).toBe(0);
    expect(result.data).toHaveProperty('truncated');
  });

  it('exportStream escribe CSV', async () => {
    userModel.find.mockReturnValue(queryChain([]));
    const res: any = {
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
    await service.exportStream('users-list', {}, 'csv', admin, res);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(res.end).toHaveBeenCalled();
  });

  it('rechaza formatos no soportados en el servidor (pdf)', async () => {
    userModel.find.mockReturnValue(queryChain([]));
    const res: any = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };
    await expect(
      service.exportStream('users-list', {}, 'pdf' as any, admin, res),
    ).rejects.toThrow(BadRequestException);
  });
});
