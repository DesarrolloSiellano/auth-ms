import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MailerService, useValue: mockMailerService },
        { provide: ConfigService, useValue: mockConfigService },
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
});
