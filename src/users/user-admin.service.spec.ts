import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserAdminService } from './user-admin.service';
import { MailService } from 'src/mail/mail.service';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';
import { SessionsService } from 'src/sessions/sessions.service';
import { AuditService } from 'src/audit/audit.service';

function chain(value: any) {
  const c: any = {};
  ['setOptions', 'select', 'sort', 'skip', 'limit', 'lean'].forEach((m) => {
    c[m] = jest.fn().mockReturnValue(c);
  });
  c.exec = jest.fn().mockResolvedValue(value);
  return c;
}

describe('UserAdminService', () => {
  let service: UserAdminService;
  const userModel: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
  };
  const savedFilterModel: any = {};
  const customFieldModel: any = {};
  const rolModel: any = {};
  const moduleModel: any = {};
  const mailService: any = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const tenantConfigService: any = { getPolicyValue: jest.fn() };
  const sessionsService: any = { revokeByUser: jest.fn() };
  const auditService: any = { logAsync: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAdminService,
        { provide: getModelToken('User'), useValue: userModel },
        { provide: getModelToken('SavedFilter'), useValue: savedFilterModel },
        {
          provide: getModelToken('CustomFieldDefinition'),
          useValue: customFieldModel,
        },
        { provide: getModelToken('Rol'), useValue: rolModel },
        { provide: getModelToken('Module'), useValue: moduleModel },
        { provide: MailService, useValue: mailService },
        { provide: TenantConfigService, useValue: tenantConfigService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get(UserAdminService);
  });

  it('hardRemove rechaza a un admin no-SuperAdmin', async () => {
    await expect(
      service.hardRemove('507f1f77bcf86cd799439011', { isAdmin: true }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('softRemove no permite operar sobre uno mismo', async () => {
    const id = '507f1f77bcf86cd799439011';
    userModel.findOne.mockReturnValue(
      chain({ _id: id, company: 'X', isSuperAdmin: false }),
    );
    await expect(
      service.softRemove(id, { _id: id, isAdmin: true, company: 'X' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('bulk assignRoles requiere SuperAdmin', async () => {
    await expect(
      service.bulkAction(
        { isAdmin: true, company: 'X' },
        'assignRoles',
        ['507f1f77bcf86cd799439011'],
        { roles: [{ codeRol: 'USR' }] },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bulk activate acota por empresa a un admin', async () => {
    userModel.updateMany.mockReturnValue(chain({ modifiedCount: 2 }));

    await service.bulkAction(
      { isAdmin: true, company: 'X' },
      'activate',
      ['507f1f77bcf86cd799439011'],
      {},
    );

    expect(userModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'X', deletedAt: null }),
      { $set: { isActived: true } },
    );
  });

  it('block marca isBlocked y audita', async () => {
    const id = '507f1f77bcf86cd799439011';
    userModel.findOne.mockReturnValue(
      chain({ _id: id, company: 'X', isSuperAdmin: false }),
    );
    userModel.updateOne.mockReturnValue(chain({}));

    await service.block(id, { isAdmin: true, company: 'X' }, { reason: 'test' });

    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: id },
      expect.objectContaining({
        $set: expect.objectContaining({ isBlocked: true, blockReason: 'test' }),
      }),
    );
    expect(auditService.logAsync).toHaveBeenCalled();
  });

  it('validateCustomFields exige obligatorios y valida tipos', async () => {
    customFieldModel.find = jest.fn().mockReturnValue(
      chain([
        { key: 'centro', label: 'Centro', type: 'text', required: true, options: [] },
        { key: 'nivel', label: 'Nivel', type: 'number', required: false, options: [] },
      ]),
    );

    await expect(
      service.validateCustomFields('X', undefined, {}),
    ).rejects.toThrow(BadRequestException);

    const ok = await service.validateCustomFields('X', undefined, {
      centro: 'A',
      nivel: '3',
    });
    expect(ok).toEqual({ centro: 'A', nivel: 3 });
  });

});
