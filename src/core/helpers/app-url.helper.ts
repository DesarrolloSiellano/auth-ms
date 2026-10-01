/**
 * URL por defecto del frontend de producción. Se usa SOLO como último recurso
 * cuando no hay origen de petición ni URL explícita (p. ej. llamadas TCP sin
 * `redirectUri`). No se lee de variables de entorno.
 */
export const DEFAULT_FRONT_URL = 'https://app.bponet.com.co';

/**
 * Resuelve la URL base del sitio donde corre la aplicación (frontend) a partir
 * de la petición entrante, para construir enlaces dinámicos en correos
 * (invitaciones, bienvenida, recuperación, verificación).
 *
 * Prioridad: header `Origin` → origen del `Referer`.
 */
export function resolveRequestOrigin(req?: any): string | undefined {
  const headers = req?.headers;
  if (!headers) return undefined;

  const origin = headers['origin'] ?? headers['Origin'];
  if (typeof origin === 'string' && origin.trim()) {
    return stripTrailingSlash(origin.trim());
  }

  const referer = headers['referer'] ?? headers['Referer'];
  if (typeof referer === 'string' && referer.trim()) {
    try {
      const url = new URL(referer.trim());
      return `${url.protocol}//${url.host}`;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/** URL base resuelta (request → default del frontend). */
export function resolveAppBaseUrl(req?: any): string {
  return resolveRequestOrigin(req) || DEFAULT_FRONT_URL;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
