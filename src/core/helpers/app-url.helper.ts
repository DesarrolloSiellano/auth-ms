/**
 * Resuelve la URL base del sitio donde corre la aplicación (frontend) a partir
 * de la petición entrante, para construir enlaces dinámicos en correos
 * (invitaciones, bienvenida, recuperación).
 *
 * Prioridad: header `Origin` → origen del `Referer` → `APP_URL` → default.
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

/** URL base resuelta (request → APP_URL → default de producción). */
export function resolveAppBaseUrl(req?: any): string {
  return (
    resolveRequestOrigin(req) ||
    process.env.APP_URL ||
    'https://app.bponet.com.co'
  );
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
