import { ReportContext } from '../interfaces/report.interface';

/** Construye el contexto de reportes a partir del usuario del JWT. */
export function buildReportContext(user: any): ReportContext {
  const isSuperAdmin = user?.isSuperAdmin === true;
  const isAdmin = isSuperAdmin || user?.isAdmin === true;
  return {
    user,
    userId: String(user?._id || user?.id || ''),
    userName:
      `${user?.name || ''} ${user?.lastName || ''}`.trim() ||
      user?.email ||
      'Usuario',
    company: user?.company,
    tenantId: user?.tenantId,
    isAdmin,
    isSuperAdmin,
    tenantLabel: isSuperAdmin
      ? 'Alcance: global (SuperAdmin)'
      : user?.company
        ? `Empresa: ${user.company}`
        : '',
  };
}

/**
 * Filtro de alcance por tenant: SuperAdmin sin límite; el resto acotado a su
 * empresa. Si un usuario no-SuperAdmin no tiene empresa, se fuerza un valor
 * imposible para no exponer datos.
 */
export function scopeOf(ctx: ReportContext): Record<string, any> {
  if (ctx.isSuperAdmin) return {};
  return { company: ctx.company || '__sin_empresa__' };
}

/** Aplica un rango de fechas sobre un campo (Date o string ISO). */
export function applyDateRange(
  query: Record<string, any>,
  filters: any,
  field = 'createdAt',
): void {
  if (filters?.desde || filters?.hasta) {
    const range: any = {};
    if (filters.desde) range.$gte = filters.desde;
    if (filters.hasta) {
      range.$lte = String(filters.hasta).length <= 10
        ? `${filters.hasta} 23:59:59`
        : filters.hasta;
    }
    query[field] = range;
  }
}
