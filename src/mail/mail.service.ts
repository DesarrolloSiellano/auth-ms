import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { FeaturePolicyService } from 'src/core/services/feature-policy.service';

interface SendEmailOptions {
  to: string;
  subject: string;
  template: string;
  context?: Record<string, any>;
  from?: string;
  /** Tenant para el que se evalúan las políticas de correo. */
  tenantId?: string;
  company?: string;
}

/**
 * Correos que NUNCA se suprimen por políticas (canal o notificaciones):
 * recuperación/set-password. La seguridad está por encima del tenant.
 */
const ALWAYS_SEND_TEMPLATES = new Set<string>(['recovery']);

/** Correos de notificación: respetan `features.notificaciones`. */
const NOTIFICATION_TEMPLATES = new Set<string>([
  'session',
  'welcome',
  'invite',
]);

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly featurePolicy: FeaturePolicyService,
  ) {}

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const isSecurity = ALWAYS_SEND_TEMPLATES.has(options.template);

    if (!isSecurity && (options.tenantId || options.company)) {
      const channelEnabled = await this.featurePolicy.isEnabled(
        options.tenantId,
        options.company,
        'channels.email.enabled',
      );
      if (!channelEnabled) {
        this.logger.warn(
          `Correo omitido: canal email deshabilitado para el tenant (${options.to}).`,
        );
        return;
      }

      if (NOTIFICATION_TEMPLATES.has(options.template)) {
        const notificationsEnabled = await this.featurePolicy.isEnabled(
          options.tenantId,
          options.company,
          'features.notificaciones',
        );
        if (!notificationsEnabled) {
          this.logger.warn(
            `Correo de notificación omitido: features.notificaciones deshabilitada (${options.to}).`,
          );
          return;
        }
      }
    }

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
