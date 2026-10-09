export interface IdentityPayload {
  _id: any;
  name: string;
  lastName: string;
  email: string;
  username: string;
  isActived: boolean;
  company: string;
  tenantId: string;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  /** Códigos de rol (`codeRol`) únicos. Compacto para autorización local. */
  roles?: string[];
  /** Permisos `resource:action` únicos. Compacto para autorización local. */
  permissions?: string[];
  isTrial?: boolean;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
  emailVerified?: boolean;
  sid?: string;
}

/** Códigos de rol activos y únicos (`['AGE', 'ADM']`). */
export function extractRoleCodes(roles: unknown): string[] {
  if (!Array.isArray(roles)) return [];
  const codes = roles
    .map((role: any) => {
      if (typeof role === 'string') return role;
      if (role && typeof role === 'object') return role.codeRol || role.code || role.name || '';
      return '';
    })
    .map((code: string) => String(code).trim())
    .filter(Boolean);
  return Array.from(new Set(codes));
}

/** Permisos activos `resource:action` únicos. */
export function extractPermissionKeys(permissions: unknown): string[] {
  if (!Array.isArray(permissions)) return [];
  const keys = permissions
    .filter((permission: any) => !permission || permission.isActive !== false)
    .map((permission: any) => {
      if (typeof permission === 'string') return permission;
      const resource = String(permission?.resource || '').trim();
      const action = String(permission?.action || '').trim();
      if (resource && action) return `${resource}:${action}`;
      return action || resource;
    })
    .filter(Boolean);
  return Array.from(new Set(keys));
}

/**
 * Construye el payload ligero de identidad que viaja en el JWT.
 * Incluye `roles` (códigos) y `permissions` (`resource:action`) compactos para
 * que los consumidores autoricen solo con la firma, sin consultar auth-ms en
 * cada petición. No incluye objetos completos, modules ni datos sensibles.
 */
export function buildIdentityPayload(user: any, sid?: string): IdentityPayload {
  return {
    _id: user._id,
    name: user.name,
    lastName: user.lastName,
    email: user.email,
    username: user.username,
    isActived: user.isActived,
    company: user.company,
    tenantId: user.tenantId,
    isSuperAdmin: user.isSuperAdmin,
    isAdmin: user.isAdmin === true,
    roles: extractRoleCodes(user.roles),
    permissions: extractPermissionKeys(user.permissions),
    isTrial: user.isTrial === true,
    trialStartedAt: user.trialStartedAt ?? null,
    trialEndsAt: user.trialEndsAt ?? null,
    emailVerified: user.emailVerifiedAt != null,
    ...(sid ? { sid } : {}),
  };
}
