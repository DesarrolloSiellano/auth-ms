const SENSITIVE_FIELDS = ['password', 'passwordResetToken', 'passwordResetExpires'];

/**
 * Elimina campos sensibles (hash de contraseña y tokens de reseteo) de un
 * documento de usuario antes de devolverlo en una respuesta HTTP o RPC.
 */
export function toPublicUser<T extends Record<string, any>>(user: T): T {
  if (!user || typeof user !== 'object') {
    return user;
  }
  const publicUser = { ...user };
  for (const field of SENSITIVE_FIELDS) {
    delete publicUser[field];
  }
  return publicUser;
}
