import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { FeaturePolicyService } from 'src/core/services/feature-policy.service';

describe('MailService', () => {
  let service: MailService;

  const mockMailerService = {
    sendMail: jest.fn().mockResolvedValue({ messageId: '1' }),
  };

  const mockConfigService = {
    get: jest.fn((key: string) =>
      key === 'EMAIL_USERNAME' ? 'no-reply@bponet.com.co' : undefined,
    ),
  };

  const featurePolicyMock = {
    isEnabled: jest.fn().mockResolvedValue(true),
    assertEnabled: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    featurePolicyMock.isEnabled.mockResolvedValue(true);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MailerService, useValue: mockMailerService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FeaturePolicyService, useValue: featurePolicyMock },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  afterEach(() => jest.clearAllMocks());

  it('envía el correo con destinatario, asunto y plantilla', async () => {
    await service.sendEmail({
      to: 'user@mail.com',
      subject: 'Bienvenido',
      template: 'welcome',
      context: { name: 'Juan' },
    });

    expect(mockMailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@mail.com',
        subject: 'Bienvenido',
        template: 'welcome',
        context: { name: 'Juan' },
      }),
    );
  });

  it('repropaga el error si el envío falla', async () => {
    (mockMailerService.sendMail).mockRejectedValueOnce(
      new Error('SMTP down'),
    );

    await expect(
      service.sendEmail({
        to: 'user@mail.com',
        subject: 'X',
        template: 'welcome',
      }),
    ).rejects.toThrow('SMTP down');
  });

  it('omite el envío si el canal email está deshabilitado', async () => {
    featurePolicyMock.isEnabled.mockResolvedValue(false);

    await service.sendEmail({
      to: 'user@mail.com',
      subject: 'Bienvenido',
      template: 'welcome',
      tenantId: 't1',
      company: 'EmpresaX',
    });

    expect(mockMailerService.sendMail).not.toHaveBeenCalled();
  });

  it('envía recuperación aunque el canal email esté deshabilitado', async () => {
    featurePolicyMock.isEnabled.mockResolvedValue(false);

    await service.sendEmail({
      to: 'user@mail.com',
      subject: 'Recuperación',
      template: 'recovery',
      tenantId: 't1',
      company: 'EmpresaX',
    });

    expect(mockMailerService.sendMail).toHaveBeenCalled();
  });

  it('omite notificaciones si features.notificaciones está deshabilitada', async () => {
    featurePolicyMock.isEnabled.mockImplementation((_t, _c, key: string) =>
      Promise.resolve(key !== 'features.notificaciones'),
    );

    await service.sendEmail({
      to: 'user@mail.com',
      subject: 'Bienvenido',
      template: 'welcome',
      tenantId: 't1',
      company: 'EmpresaX',
    });

    expect(mockMailerService.sendMail).not.toHaveBeenCalled();
  });
});
