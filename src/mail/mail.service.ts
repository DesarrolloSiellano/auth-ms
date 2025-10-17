import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

interface SendEmailOptions {
  to: string;
  subject: string;
  template: string;
  context?: Record<string, any>;
  from?: string;
}

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService, private readonly configService: ConfigService) {}

  async sendEmail(options: SendEmailOptions): Promise<void> {
    
    return await this.mailerService.sendMail({
      to: options.to,
      subject: options.subject,
      template: options.template, // nombre de la plantilla .hbs sin extensión
      context: options.context || {},
      from: `"No Reply" <${this.configService.get<string>('EMAIL_USERNAME')}>`,
      headers: {
        'X-Priority': '3',
        Importance: 'normal',
        'Priority': 'normal',
        'X-Mailer': 'NestJS Mailer Module',
      },
      // opcional, usa el default si no se pasa
    });
  }
}
