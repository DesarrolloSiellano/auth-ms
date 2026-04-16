import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) { }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    this.logger.log(
      `Iniciando envío de correo a: ${options.to} | Asunto: ${options.subject} | Plantilla: ${options.template}`,
    );

    try {
      await this.mailerService.sendMail({
        to: options.to,
        subject: options.subject,
        template: options.template, // nombre de la plantilla .hbs sin extensión
        context: options.context || {},
        from: `"No Reply" <${this.configService.get<string>(
          'EMAIL_USERNAME',
        )}>`,
        headers: {
          'X-Priority': '3',
          Importance: 'normal',
          Priority: 'normal',
          'X-Mailer': 'NestJS Mailer Module',
        },
      });

      this.logger.log(`Correo enviado exitosamente a: ${options.to}`);
    } catch (error) {
      this.logger.error(
        `Error al enviar correo a: ${options.to}. Error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
