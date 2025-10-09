import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com', // Puedes cambiarlo por otro proveedor
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false, // true para puerto 465, false para otros puertos
      auth: {
        user: process.env.SMTP_USER, // Tu email
        pass: process.env.SMTP_PASS, // Tu contraseña o App Password
      },
    });
  }

  async sendEmail(to: string, subject: string, text: string, html?: string) {
    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: process.env.SMTP_USER,
        to,
        subject,
        text,
        html,
      };

      const info = await this.transporter.sendMail(mailOptions);

      return info;
    } catch (error) {
      console.error('Error enviando email:', error);
      throw new Error('Error al enviar el correo');
    }
  }
}
