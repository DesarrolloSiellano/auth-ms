import * as crypto from 'crypto';
import { DEFAULT_FRONT_URL } from 'src/core/helpers/app-url.helper';

export interface OneTimeToken {
  raw: string;
  hash: string;
  expires: Date;
}

/** Genera un token de un solo uso: valor crudo, hash (BD) y expiración (1h). */
export function generateOneTimeToken(ttlMs = 60 * 60 * 1000): OneTimeToken {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash, expires: new Date(Date.now() + ttlMs) };
}

/**
 * Fija en el documento/objeto de usuario el token de verificación (hash y
 * expiración) y devuelve el valor crudo. El llamador decide cuándo guardar.
 */
export function applyVerificationToken(user: any, ttlMs = 60 * 60 * 1000): string {
  const { raw, hash, expires } = generateOneTimeToken(ttlMs);
  user.emailVerificationToken = hash;
  user.emailVerificationExpires = expires;
  return raw;
}

/** Envía el correo de verificación con el token crudo. */
export async function sendVerificationEmail(
  mailService: { sendEmail: (options: any) => Promise<any> },
  user: any,
  rawToken: string,
  appUrl?: string,
): Promise<void> {
  const base = (appUrl || DEFAULT_FRONT_URL).toString().replace(/\/+$/, '');
  const verification_url = `${base}/verify-email?token=${rawToken}`;

  await mailService.sendEmail({
    to: user.email,
    subject: 'Verifica tu correo - BpoNet',
    template: 'verify',
    tenantId: user.tenantId,
    company: user.company,
    context: {
      name: user.name,
      platform_name: 'BpoNet',
      verification_url,
    },
  });
}
