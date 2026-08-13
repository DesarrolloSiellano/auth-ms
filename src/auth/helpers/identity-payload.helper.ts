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
}

/**
 * Construye el payload ligero de identidad que viaja en el JWT.
 * No incluye modules/roles/permissions (autorización) para mantener
 * el token por debajo de 1KB y evitar el error 431/414.
 */
export function buildIdentityPayload(user: any): IdentityPayload {
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
  };
}
