import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RestEndpointDoc {
  method: HttpMethod;
  path: string;
  auth: string;
  description: string;
  requestExample?: Record<string, unknown>;
  responseExample?: Record<string, unknown>;
}

/** Envoltura estándar de respuesta del microservicio. */
const ok = (
  data: unknown,
  message = 'Operación exitosa',
): Record<string, unknown> => ({
  statusCode: 200,
  status: 'Success',
  message,
  data,
  meta: { totalData: Array.isArray(data) ? data.length : 1 },
});

/**
 * Catálogo informativo (NO funcional) de los endpoints REST de la aplicación.
 * No ejecuta lógica de negocio: solo documenta la superficie HTTP con ejemplos
 * de payload (request) y de respuesta del servicio.
 */
const REST_ENDPOINTS: RestEndpointDoc[] = [
  // ---------------------------------------------------------------- auth
  {
    method: 'POST',
    path: '/api/auth/login',
    auth: 'Público',
    description: 'Inicia sesión (JWT access + refresh).',
    requestExample: {
      email: 'juan@empresa.com',
      password: '********',
      meta: { os: 'Linux', browser: 'Chrome', isbrowser: true },
    },
    responseExample: {
      statusCode: 200,
      status: 'Success',
      message: 'Login successful',
      meta: {
        payload: { _id: 'u1', name: 'Juan', email: 'juan@empresa.com', company: 'EmpresaX', isSuperAdmin: false },
        accessToken: 'eyJhbGciOi...',
        refreshToken: 'eyJhbGciOi...',
        mustChangePassword: false,
        totalData: 1,
      },
    },
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    auth: 'Público',
    description: 'Revoca la sesión actual.',
    requestExample: { refreshToken: 'eyJhbGciOi...' },
    responseExample: ok({ revoked: true }, 'Sesión cerrada'),
  },
  {
    method: 'POST',
    path: '/api/auth/recovery-password',
    auth: 'Público',
    description:
      'Recuperación de contraseña (envía enlace de un solo uso por correo). Respuesta genérica.',
    requestExample: { email: 'juan@empresa.com' },
    responseExample: ok(
      { sent: true },
      'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña',
    ),
  },
  {
    method: 'POST',
    path: '/api/auth/set-password-token',
    auth: 'Público',
    description: 'Establece contraseña con token de activación.',
    requestExample: { token: 'token-de-activacion', password: 'NuevaClave123!' },
    responseExample: ok({ updated: true }, 'Contraseña establecida exitosamente'),
  },
  {
    method: 'POST',
    path: '/api/auth/refresh',
    auth: 'Público',
    description: 'Refresca el access token.',
    requestExample: { refreshToken: 'eyJhbGciOi...' },
    responseExample: {
      statusCode: 200,
      status: 'Success',
      message: 'Token refreshed successfully',
      accessToken: 'eyJhbGciOi...',
      refreshToken: 'eyJhbGciOi...',
      payload: { _id: 'u1', email: 'juan@empresa.com', company: 'EmpresaX' },
    },
  },
  {
    method: 'POST',
    path: '/api/auth/verify-email',
    auth: 'Público',
    description: 'Verifica el correo con un token de un solo uso.',
    requestExample: { token: 'token-de-verificacion' },
    responseExample: ok({ verified: true }, 'Correo verificado exitosamente'),
  },
  {
    method: 'POST',
    path: '/api/auth/resend-verification',
    auth: 'JWT',
    description: 'Reenvía el correo de verificación con token de un solo uso.',
    requestExample: { headers: { Authorization: 'Bearer eyJhbGciOi...' } },
    responseExample: ok({ sent: true }, 'Correo de verificación enviado'),
  },
  {
    method: 'POST',
    path: '/api/auth/change-password',
    auth: 'JWT',
    description: 'Cambia la contraseña del usuario autenticado.',
    requestExample: { currentPassword: '********', newPassword: 'NuevaClave123!' },
    responseExample: ok({ updated: true }, 'Contraseña cambiada correctamente'),
  },
  {
    method: 'GET',
    path: '/api/auth/validate-user',
    auth: 'JWT',
    description: 'Valida el token y devuelve el usuario.',
    requestExample: { headers: { Authorization: 'Bearer eyJhbGciOi...' } },
    responseExample: ok(
      { user: { _id: 'u1', email: 'juan@empresa.com', company: 'EmpresaX' } },
      'Token válido',
    ),
  },

  // --------------------------------------------------------------- users
  {
    method: 'POST',
    path: '/api/users',
    auth: 'JWT',
    description: 'Crea un usuario (envía correo de activación/invitación).',
    requestExample: {
      name: 'Juan',
      lastName: 'Pérez',
      email: 'juan@empresa.com',
      company: 'EmpresaX',
      roles: [{ codeRol: 'AGE' }],
      invite: true,
    },
    responseExample: ok({ _id: 'u1', email: 'juan@empresa.com' }, 'Usuario creado'),
  },
  {
    method: 'GET',
    path: '/api/users',
    auth: 'JWT',
    description: 'Lista usuarios.',
    requestExample: { query: {} },
    responseExample: ok(
      [{ _id: 'u1', name: 'Juan', email: 'juan@empresa.com', company: 'EmpresaX' }],
      'Usuarios encontrados',
    ),
  },
  {
    method: 'GET',
    path: '/api/users/findByPage',
    auth: 'JWT',
    description: 'Lista usuarios paginados con filtros.',
    requestExample: { query: { from: 0, limit: 20, global: 'juan' } },
    responseExample: {
      statusCode: 200,
      status: 'Success',
      message: 'Usuarios',
      data: [{ _id: 'u1', name: 'Juan' }],
      meta: { totalData: 1, page: 1, limit: 20 },
    },
  },
  {
    method: 'GET',
    path: '/api/users/findByTenant',
    auth: 'JWT o Service',
    description: 'Lista usuarios del tenant.',
    requestExample: {
      headers: { 'x-company-id': 'EmpresaX', 'x-tenant-id': 'tenant-id' },
      query: { onlyAgents: true },
    },
    responseExample: ok([{ _id: 'u1', name: 'Juan', roles: [{ codeRol: 'AGE' }] }], 'Usuarios del tenant'),
  },
  {
    method: 'GET',
    path: '/api/users/profile',
    auth: 'JWT o Service',
    description: 'Árbol de autorización del usuario (módulos, roles, permisos).',
    requestExample: { headers: { 'x-user-id': 'u1' } },
    responseExample: ok(
      {
        user: { _id: 'u1', name: 'Juan', isAdmin: true },
        modules: [{ name: 'adminUserModule', isActive: true }],
        roles: [{ codeRol: 'ADM', isActive: true }],
        permissions: [{ action: 'create' }],
      },
      'Perfil del usuario',
    ),
  },
  {
    method: 'GET',
    path: '/api/users/profile/modules',
    auth: 'JWT',
    description: 'Módulos del usuario.',
    requestExample: { query: {} },
    responseExample: ok([{ name: 'adminUserModule', isActive: true }], 'Módulos'),
  },
  {
    method: 'GET',
    path: '/api/users/profile/roles',
    auth: 'JWT',
    description: 'Roles del usuario.',
    requestExample: { query: {} },
    responseExample: ok([{ codeRol: 'ADM', name: 'Administrador', isActive: true }], 'Roles'),
  },
  {
    method: 'GET',
    path: '/api/users/profile/permissions',
    auth: 'JWT',
    description: 'Permisos del usuario.',
    requestExample: { query: {} },
    responseExample: ok([{ action: 'create', isActive: true }], 'Permisos'),
  },
  {
    method: 'GET',
    path: '/api/users/findByDate',
    auth: 'JWT',
    description: 'Usuarios por rango de fechas.',
    requestExample: { query: { startDate: '2026-01-01', endDate: '2026-01-31' } },
    responseExample: ok([{ _id: 'u1', created: '2026-01-15' }], 'Usuarios por fecha'),
  },
  {
    method: 'GET',
    path: '/api/users/check-availability',
    auth: 'JWT',
    description: 'Disponibilidad de email/usuario.',
    requestExample: { query: { email: 'juan@empresa.com', username: 'juanp' } },
    responseExample: ok({ emailExists: false, usernameExists: true }, 'Disponibilidad'),
  },
  {
    method: 'GET',
    path: '/api/users/export-data',
    auth: 'JWT',
    description: 'Devuelve el dataset de usuarios (JSON) para exportación.',
    requestExample: { query: { company: 'EmpresaX' } },
    responseExample: ok({ columns: [{ key: 'email', label: 'Correo' }], rows: [] }, 'Datos de exportación'),
  },
  {
    method: 'GET',
    path: '/api/users/export',
    auth: 'JWT',
    description: 'Exporta usuarios (xlsx/csv).',
    requestExample: { query: { format: 'xlsx' } },
    responseExample: { note: 'Respuesta binaria (archivo) con Content-Type de Excel/CSV' },
  },
  {
    method: 'GET',
    path: '/api/users/saved-filters',
    auth: 'JWT',
    description: 'Lista búsquedas guardadas.',
    requestExample: { query: {} },
    responseExample: ok([{ _id: 'f1', name: 'Inactivos', module: 'users' }], 'Búsquedas guardadas'),
  },
  {
    method: 'POST',
    path: '/api/users/saved-filters',
    auth: 'JWT',
    description: 'Guarda una búsqueda.',
    requestExample: { name: 'Inactivos', filters: { estado: 'false' }, isShared: false },
    responseExample: ok({ _id: 'f1', name: 'Inactivos' }, 'Búsqueda guardada'),
  },
  {
    method: 'DELETE',
    path: '/api/users/saved-filters/:id',
    auth: 'JWT',
    description: 'Elimina una búsqueda guardada.',
    requestExample: { pathParams: { id: 'f1' } },
    responseExample: ok({ _id: 'f1' }, 'Búsqueda eliminada'),
  },
  {
    method: 'POST',
    path: '/api/users/bulk',
    auth: 'JWT',
    description: 'Acciones masivas (activate, deactivate, resetPassword, assignRoles, assignModules, revokeSessions, delete).',
    requestExample: {
      action: 'revokeSessions',
      ids: ['507f1f77bcf86cd799439011'],
      payload: {},
    },
    responseExample: ok({ action: 'revokeSessions', revoked: 1, skipped: 0 }, 'Sesiones revocadas'),
  },
  {
    method: 'POST',
    path: '/api/users/:id/resend-invite',
    auth: 'JWT',
    description: 'Reenvía invitación/activación.',
    requestExample: { pathParams: { id: 'u1' } },
    responseExample: ok({ sent: true }, 'Invitación reenviada'),
  },
  {
    method: 'PATCH',
    path: '/api/users/:id/block',
    auth: 'JWT',
    description: 'Bloquea un usuario.',
    requestExample: { pathParams: { id: 'u1' }, body: { reason: 'manual' } },
    responseExample: ok({ _id: 'u1', isBlocked: true }, 'Usuario bloqueado'),
  },
  {
    method: 'PATCH',
    path: '/api/users/:id/unblock',
    auth: 'JWT',
    description: 'Desbloquea un usuario.',
    requestExample: { pathParams: { id: 'u1' } },
    responseExample: ok({ _id: 'u1', isBlocked: false }, 'Usuario desbloqueado'),
  },
  {
    method: 'PATCH',
    path: '/api/users/:id/tags',
    auth: 'JWT',
    description: 'Actualiza etiquetas/grupos (según features.userTags/userGroups).',
    requestExample: { pathParams: { id: 'u1' }, body: { tags: ['vip'], groups: ['ventas'] } },
    responseExample: ok({ _id: 'u1', tags: ['vip'], groups: ['ventas'] }, 'Etiquetas/grupos actualizados'),
  },
  {
    method: 'GET',
    path: '/api/users/custom-fields',
    auth: 'JWT',
    description: 'Lista campos personalizados (según features.customFields).',
    requestExample: { query: { company: 'EmpresaX' } },
    responseExample: ok([{ _id: 'cf1', key: 'centro', label: 'Centro', type: 'text' }], 'Campos personalizados'),
  },
  {
    method: 'POST',
    path: '/api/users/custom-fields',
    auth: 'JWT (SuperAdmin)',
    description: 'Crea un campo personalizado.',
    requestExample: { key: 'centro', label: 'Centro', type: 'text', required: true, order: 1 },
    responseExample: ok({ _id: 'cf1', key: 'centro', label: 'Centro' }, 'Campo creado'),
  },
  {
    method: 'PUT',
    path: '/api/users/custom-fields/:id',
    auth: 'JWT (SuperAdmin)',
    description: 'Actualiza un campo personalizado.',
    requestExample: { pathParams: { id: 'cf1' }, body: { label: 'Centro de costo' } },
    responseExample: ok({ _id: 'cf1', label: 'Centro de costo' }, 'Campo actualizado'),
  },
  {
    method: 'DELETE',
    path: '/api/users/custom-fields/:id',
    auth: 'JWT (SuperAdmin)',
    description: 'Elimina un campo personalizado.',
    requestExample: { pathParams: { id: 'cf1' } },
    responseExample: ok({ _id: 'cf1' }, 'Campo eliminado'),
  },
  {
    method: 'GET',
    path: '/api/users/:id',
    auth: 'JWT',
    description: 'Obtiene un usuario.',
    requestExample: { pathParams: { id: 'u1' } },
    responseExample: ok({ _id: 'u1', name: 'Juan', email: 'juan@empresa.com' }, 'Usuario'),
  },
  {
    method: 'PUT',
    path: '/api/users/:id',
    auth: 'JWT',
    description: 'Actualiza un usuario.',
    requestExample: { pathParams: { id: 'u1' }, body: { name: 'Juan Carlos', phone: '3001234567' } },
    responseExample: ok({ _id: 'u1', name: 'Juan Carlos' }, 'Usuario actualizado'),
  },
  {
    method: 'DELETE',
    path: '/api/users/:id/hard',
    auth: 'JWT (SuperAdmin)',
    description: 'Baja física de usuario.',
    requestExample: { pathParams: { id: 'u1' } },
    responseExample: ok({ _id: 'u1' }, 'Usuario eliminado'),
  },
  {
    method: 'DELETE',
    path: '/api/users/:id',
    auth: 'JWT',
    description: 'Baja lógica de usuario.',
    requestExample: { pathParams: { id: 'u1' } },
    responseExample: ok({ _id: 'u1', deletedAt: '2026-01-01T00:00:00Z' }, 'Usuario dado de baja'),
  },

  // --------------------------------------------------------------- roles
  {
    method: 'POST',
    path: '/api/roles',
    auth: 'JWT',
    description: 'Crea un rol.',
    requestExample: { name: 'Agente', codeRol: 'AGE', description: 'Atención al cliente' },
    responseExample: ok({ _id: 'r1', name: 'Agente', codeRol: 'AGE' }, 'Rol creado'),
  },
  {
    method: 'GET',
    path: '/api/roles',
    auth: 'JWT',
    description: 'Lista roles.',
    requestExample: { query: {} },
    responseExample: ok([{ _id: 'r1', name: 'Agente', codeRol: 'AGE' }], 'Roles'),
  },
  {
    method: 'GET',
    path: '/api/roles/findByPage',
    auth: 'JWT',
    description: 'Lista roles paginados.',
    requestExample: { query: { from: 0, limit: 20 } },
    responseExample: {
      statusCode: 200,
      status: 'Success',
      message: 'Roles',
      data: [{ _id: 'r1', name: 'Agente' }],
      meta: { totalData: 1, page: 1, limit: 20 },
    },
  },
  {
    method: 'GET',
    path: '/api/roles/:id',
    auth: 'JWT',
    description: 'Obtiene un rol.',
    requestExample: { pathParams: { id: 'r1' } },
    responseExample: ok({ _id: 'r1', name: 'Agente', codeRol: 'AGE' }, 'Rol'),
  },
  {
    method: 'PUT',
    path: '/api/roles/:id',
    auth: 'JWT',
    description: 'Actualiza un rol.',
    requestExample: { pathParams: { id: 'r1' }, body: { name: 'Agente Senior' } },
    responseExample: ok({ _id: 'r1', name: 'Agente Senior' }, 'Rol actualizado'),
  },
  {
    method: 'DELETE',
    path: '/api/roles/:id',
    auth: 'JWT',
    description: 'Elimina un rol.',
    requestExample: { pathParams: { id: 'r1' } },
    responseExample: ok({ _id: 'r1' }, 'Rol eliminado'),
  },

  // --------------------------------------------------------- permissions
  {
    method: 'POST',
    path: '/api/permissions',
    auth: 'JWT',
    description: 'Crea un permiso.',
    requestExample: { name: 'Crear', action: 'create', description: 'Crear registros' },
    responseExample: ok({ _id: 'p1', name: 'Crear', action: 'create' }, 'Permiso creado'),
  },
  {
    method: 'GET',
    path: '/api/permissions',
    auth: 'JWT',
    description: 'Lista permisos.',
    requestExample: { query: {} },
    responseExample: ok([{ _id: 'p1', name: 'Crear', action: 'create' }], 'Permisos'),
  },
  {
    method: 'GET',
    path: '/api/permissions/findByPage',
    auth: 'JWT',
    description: 'Lista permisos paginados.',
    requestExample: { query: { from: 0, limit: 20 } },
    responseExample: {
      statusCode: 200,
      status: 'Success',
      message: 'Permisos',
      data: [{ _id: 'p1', name: 'Crear' }],
      meta: { totalData: 1, page: 1, limit: 20 },
    },
  },
  {
    method: 'GET',
    path: '/api/permissions/:id',
    auth: 'JWT',
    description: 'Obtiene un permiso.',
    requestExample: { pathParams: { id: 'p1' } },
    responseExample: ok({ _id: 'p1', name: 'Crear', action: 'create' }, 'Permiso'),
  },
  {
    method: 'PUT',
    path: '/api/permissions/:id',
    auth: 'JWT',
    description: 'Actualiza un permiso.',
    requestExample: { pathParams: { id: 'p1' }, body: { name: 'Crear registros' } },
    responseExample: ok({ _id: 'p1', name: 'Crear registros' }, 'Permiso actualizado'),
  },
  {
    method: 'DELETE',
    path: '/api/permissions/:id',
    auth: 'JWT',
    description: 'Elimina un permiso.',
    requestExample: { pathParams: { id: 'p1' } },
    responseExample: ok({ _id: 'p1' }, 'Permiso eliminado'),
  },

  // ------------------------------------------------------------- modules
  {
    method: 'POST',
    path: '/api/modules',
    auth: 'JWT',
    description: 'Crea un módulo.',
    requestExample: { name: 'adminUserModule', description: 'Módulo de usuarios', routes: [] },
    responseExample: ok({ _id: 'm1', name: 'adminUserModule' }, 'Módulo creado'),
  },
  {
    method: 'GET',
    path: '/api/modules',
    auth: 'JWT',
    description: 'Lista módulos.',
    requestExample: { query: {} },
    responseExample: ok([{ _id: 'm1', name: 'adminUserModule', isActive: true }], 'Módulos'),
  },
  {
    method: 'GET',
    path: '/api/modules/findByPage',
    auth: 'JWT',
    description: 'Lista módulos paginados.',
    requestExample: { query: { from: 0, limit: 20 } },
    responseExample: {
      statusCode: 200,
      status: 'Success',
      message: 'Módulos',
      data: [{ _id: 'm1', name: 'adminUserModule' }],
      meta: { totalData: 1, page: 1, limit: 20 },
    },
  },
  {
    method: 'GET',
    path: '/api/modules/:id',
    auth: 'JWT',
    description: 'Obtiene un módulo.',
    requestExample: { pathParams: { id: 'm1' } },
    responseExample: ok({ _id: 'm1', name: 'adminUserModule', routes: [] }, 'Módulo'),
  },
  {
    method: 'PUT',
    path: '/api/modules/:id',
    auth: 'JWT',
    description: 'Actualiza un módulo.',
    requestExample: { pathParams: { id: 'm1' }, body: { description: 'Módulo de usuarios v2' } },
    responseExample: ok({ _id: 'm1', description: 'Módulo de usuarios v2' }, 'Módulo actualizado'),
  },
  {
    method: 'DELETE',
    path: '/api/modules/:id',
    auth: 'JWT',
    description: 'Elimina un módulo.',
    requestExample: { pathParams: { id: 'm1' } },
    responseExample: ok({ _id: 'm1' }, 'Módulo eliminado'),
  },

  // ----------------------------------------------------------- companies
  {
    method: 'POST',
    path: '/api/companies',
    auth: 'JWT',
    description: 'Crea una empresa/tenant (crea su configuración de políticas).',
    requestExample: { name: 'EmpresaX', legalRepresentative: 'Juan Pérez', rutNit: '900123456', email: 'contacto@empresax.com' },
    responseExample: ok({ _id: 'c1', name: 'EmpresaX' }, 'Company created successfully'),
  },
  {
    method: 'GET',
    path: '/api/companies',
    auth: 'JWT',
    description: 'Lista empresas.',
    requestExample: { query: {} },
    responseExample: ok([{ _id: 'c1', name: 'EmpresaX', isActive: true }], 'Companies found'),
  },
  {
    method: 'GET',
    path: '/api/companies/findByPage',
    auth: 'JWT',
    description: 'Lista empresas paginadas.',
    requestExample: { query: { from: 0, limit: 20 } },
    responseExample: {
      statusCode: 200,
      status: 'Success',
      message: 'Companies found',
      data: [{ _id: 'c1', name: 'EmpresaX' }],
      meta: { totalData: 1, page: 1, limit: 20 },
    },
  },
  {
    method: 'GET',
    path: '/api/companies/findByAutoComplete',
    auth: 'JWT',
    description: 'Autocompletado de empresas.',
    requestExample: { query: { word: 'emp' } },
    responseExample: ok([{ _id: 'c1', name: 'EmpresaX' }], 'Companies found by autocomplete'),
  },
  {
    method: 'GET',
    path: '/api/companies/:id',
    auth: 'JWT',
    description: 'Obtiene una empresa.',
    requestExample: { pathParams: { id: 'c1' } },
    responseExample: ok({ _id: 'c1', name: 'EmpresaX', isActive: true }, 'Company'),
  },
  {
    method: 'PUT',
    path: '/api/companies/:id',
    auth: 'JWT',
    description: 'Actualiza una empresa.',
    requestExample: { pathParams: { id: 'c1' }, body: { phone: '6011234567' } },
    responseExample: ok({ _id: 'c1', phone: '6011234567' }, 'Company updated successfully'),
  },
  {
    method: 'PATCH',
    path: '/api/companies/:id/block',
    auth: 'JWT',
    description: 'Bloquea una empresa (ningún usuario del tenant inicia sesión).',
    requestExample: { pathParams: { id: 'c1' }, body: { reason: 'mora', until: '2026-12-31T23:59:59Z' } },
    responseExample: ok({ _id: 'c1', isBlocked: true }, 'Company blocked successfully'),
  },
  {
    method: 'PATCH',
    path: '/api/companies/:id/unblock',
    auth: 'JWT',
    description: 'Desbloquea una empresa.',
    requestExample: { pathParams: { id: 'c1' } },
    responseExample: ok({ _id: 'c1', isBlocked: false }, 'Company unblocked successfully'),
  },
  {
    method: 'DELETE',
    path: '/api/companies/:id',
    auth: 'JWT',
    description: 'Elimina una empresa.',
    requestExample: { pathParams: { id: 'c1' } },
    responseExample: ok({ _id: 'c1' }, 'Company removed'),
  },

  // ------------------------------------------------------------ sessions
  {
    method: 'GET',
    path: '/api/sessions',
    auth: 'JWT (admin)',
    description: 'Lista sesiones activas (admin: su empresa; superadmin: todas).',
    requestExample: { query: { email: 'juan@empresa.com', from: 0, limit: 50 } },
    responseExample: ok([{ _id: 's1', user: 'u1', email: 'juan@empresa.com', ip: '190.0.0.1' }], 'Active sessions retrieved successfully'),
  },
  {
    method: 'GET',
    path: '/api/sessions/mine',
    auth: 'JWT',
    description: 'Mis sesiones activas.',
    requestExample: { query: {} },
    responseExample: ok([{ _id: 's1', ip: '190.0.0.1', browser: 'Chrome', os: 'Linux' }], 'Mis sesiones activas'),
  },
  {
    method: 'GET',
    path: '/api/sessions/findByUser/:userId',
    auth: 'JWT (admin)',
    description: 'Sesiones activas de un usuario.',
    requestExample: { pathParams: { userId: 'u1' } },
    responseExample: ok([{ _id: 's1', user: 'u1', ip: '190.0.0.1' }], 'Active sessions retrieved successfully'),
  },
  {
    method: 'POST',
    path: '/api/sessions/revoke',
    auth: 'JWT (admin)',
    description: 'Revoca un lote de sesiones por ids.',
    requestExample: { ids: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] },
    responseExample: ok({ revoked: 2 }, 'Sessions revoked successfully'),
  },
  {
    method: 'DELETE',
    path: '/api/sessions/user/:userId',
    auth: 'JWT (admin)',
    description: 'Revoca todas las sesiones de un usuario (no SuperAdmin si el solicitante es admin).',
    requestExample: { pathParams: { userId: 'u1' } },
    responseExample: ok({ revoked: 3 }, 'User sessions revoked successfully'),
  },
  {
    method: 'DELETE',
    path: '/api/sessions/mine/:id',
    auth: 'JWT',
    description: 'Revoca una sesión propia.',
    requestExample: { pathParams: { id: 's1' } },
    responseExample: ok({ _id: 's1', isActive: false }, 'Session revoked successfully'),
  },
  {
    method: 'DELETE',
    path: '/api/sessions/mine',
    auth: 'JWT',
    description: 'Revoca todas mis sesiones.',
    requestExample: { query: {} },
    responseExample: ok({ revoked: 2 }, 'Sessions revoked successfully'),
  },
  {
    method: 'DELETE',
    path: '/api/sessions/:id',
    auth: 'JWT (admin)',
    description: 'Revoca una sesión por id.',
    requestExample: { pathParams: { id: 's1' } },
    responseExample: ok({ _id: 's1', isActive: false }, 'Session revoked successfully'),
  },
  {
    method: 'DELETE',
    path: '/api/sessions',
    auth: 'JWT (admin)',
    description: 'Revoca todas las sesiones (de la empresa o globales).',
    requestExample: { query: {} },
    responseExample: ok({ revoked: 5 }, 'Sessions revoked successfully'),
  },

  // ------------------------------------------------------- tenant-config
  {
    method: 'GET',
    path: '/api/tenants/policy-catalog',
    auth: 'JWT o Service',
    description: 'Catálogo de políticas.',
    requestExample: { query: { all: false } },
    responseExample: ok([{ key: 'features.pbx', label: 'PBX', type: 'boolean', defaultValue: false }], 'Policy catalog retrieved successfully'),
  },
  {
    method: 'POST',
    path: '/api/tenants/policy-definitions',
    auth: 'JWT (SuperAdmin)',
    description: 'Crea una definición de política.',
    requestExample: { key: 'features.x', label: 'X', group: 'features', type: 'boolean', defaultValue: true },
    responseExample: ok({ key: 'features.x', label: 'X' }, 'Policy definition created successfully'),
  },
  {
    method: 'PUT',
    path: '/api/tenants/policy-definitions/:key',
    auth: 'JWT (SuperAdmin)',
    description: 'Actualiza una definición de política.',
    requestExample: { pathParams: { key: 'features.x' }, body: { label: 'X v2' } },
    responseExample: ok({ key: 'features.x', label: 'X v2' }, 'Policy definition updated successfully'),
  },
  {
    method: 'DELETE',
    path: '/api/tenants/policy-definitions/:key',
    auth: 'JWT (SuperAdmin)',
    description: 'Elimina una definición de política (solo no-sistema).',
    requestExample: { pathParams: { key: 'features.x' } },
    responseExample: ok({ key: 'features.x' }, 'Policy definition removed successfully'),
  },
  {
    method: 'GET',
    path: '/api/tenants/config',
    auth: 'JWT o Service',
    description: 'Configuración resuelta del tenant.',
    requestExample: { query: { tenantId: 'tenant-id', company: 'EmpresaX' } },
    responseExample: ok(
      { tenantId: 'tenant-id', company: 'EmpresaX', version: 3, preferences: { notifications: { newLogin: true } } },
      'Tenant config resolved successfully',
    ),
  },
  {
    method: 'GET',
    path: '/api/tenants/config/:tenantId',
    auth: 'JWT (SuperAdmin)',
    description: 'Configuración de un tenant.',
    requestExample: { pathParams: { tenantId: 'tenant-id' } },
    responseExample: ok({ tenantId: 'tenant-id', values: { 'features.pbx': true } }, 'Tenant config retrieved successfully'),
  },
  {
    method: 'PUT',
    path: '/api/tenants/config/:tenantId',
    auth: 'JWT (SuperAdmin)',
    description: 'Crea/actualiza la configuración.',
    requestExample: { pathParams: { tenantId: 'tenant-id' }, body: { company: 'EmpresaX', values: { 'features.pbx': true } } },
    responseExample: ok({ tenantId: 'tenant-id', version: 4 }, 'Tenant config saved successfully'),
  },
  {
    method: 'PATCH',
    path: '/api/tenants/config/:tenantId/values',
    auth: 'JWT (SuperAdmin)',
    description: 'Actualiza valores de políticas.',
    requestExample: { pathParams: { tenantId: 'tenant-id' }, body: { values: { 'general.timezone': 'Europe/Madrid' } } },
    responseExample: ok({ tenantId: 'tenant-id', version: 5 }, 'Tenant config saved successfully'),
  },
  {
    method: 'GET',
    path: '/api/tenants',
    auth: 'JWT (SuperAdmin)',
    description: 'Lista configuraciones.',
    requestExample: { query: {} },
    responseExample: ok([{ tenantId: 'tenant-id', company: 'EmpresaX', version: 3 }], 'Tenant configs retrieved successfully'),
  },
  {
    method: 'POST',
    path: '/api/tenants/usage/report',
    auth: 'JWT o Service',
    description: 'Reporta consumo (deltas) de un tenant.',
    requestExample: { tenantId: 'tenant-id', period: '2026-09', metrics: { 'email.sent': 10 }, reportId: 'uuid' },
    responseExample: ok({ tenantId: 'tenant-id', period: '2026-09', metrics: { 'email.sent': 10 } }, 'Usage reported successfully'),
  },
  {
    method: 'GET',
    path: '/api/tenants/usage',
    auth: 'JWT (SuperAdmin)',
    description: 'Lista consumo de tenants.',
    requestExample: { query: { period: '2026-09' } },
    responseExample: ok([{ tenantId: 'tenant-id', period: '2026-09', metrics: { 'sms.sent': 5 } }], 'Tenant usage list retrieved successfully'),
  },
  {
    method: 'GET',
    path: '/api/tenants/usage/:tenantId',
    auth: 'JWT o Service',
    description: 'Consumo de un tenant.',
    requestExample: { pathParams: { tenantId: 'tenant-id' }, query: { period: '2026-09' } },
    responseExample: ok([{ tenantId: 'tenant-id', period: '2026-09', metrics: { 'sms.sent': 5 } }], 'Tenant usage retrieved successfully'),
  },

  // ------------------------------------------------------------- reports
  {
    method: 'GET',
    path: '/api/reports/catalog',
    auth: 'JWT (admin)',
    description: 'Catálogo de reportes.',
    requestExample: { query: {} },
    responseExample: ok([{ id: 'users-list', nombre: 'Usuarios', category: 'Usuarios' }], 'Catálogo de reportes'),
  },
  {
    method: 'POST',
    path: '/api/reports/:id/preview',
    auth: 'JWT (admin)',
    description: 'Vista previa de un reporte.',
    requestExample: { pathParams: { id: 'users-list' }, body: { filters: { estado: 'true' }, limit: 50 } },
    responseExample: ok(
      { columns: [{ key: 'email', label: 'Correo' }], rows: [], summary: [], total: 0 },
      'Vista previa del reporte',
    ),
  },
  {
    method: 'POST',
    path: '/api/reports/:id/data',
    auth: 'JWT (admin)',
    description: 'Datos completos del reporte (JSON para PDF en el navegador).',
    requestExample: { pathParams: { id: 'users-list' }, body: { filters: {} } },
    responseExample: ok(
      { columns: [{ key: 'email', label: 'Correo' }], rows: [], total: 0, truncated: false },
      'Datos del reporte',
    ),
  },
  {
    method: 'POST',
    path: '/api/reports/:id/export',
    auth: 'JWT (admin)',
    description: 'Exporta el reporte (xlsx/csv).',
    requestExample: { pathParams: { id: 'users-list' }, body: { format: 'xlsx', filters: {} } },
    responseExample: { note: 'Respuesta binaria (archivo) con Content-Type de Excel/CSV' },
  },

  // --------------------------------------------------------------- audit
  {
    method: 'GET',
    path: '/api/audit/mine',
    auth: 'JWT',
    description: 'Historial de auditoría del usuario.',
    requestExample: { query: { page: 1, limit: 20, category: 'auth' } },
    responseExample: {
      statusCode: 200,
      status: 'Success',
      message: 'Auditoría del usuario',
      data: [{ action: 'login.success', category: 'auth', createdAt: '2026-01-01T10:00:00Z' }],
      meta: { totalData: 1, page: 1, limit: 20 },
    },
  },

  // -------------------------------------------------------- massive-users
  {
    method: 'POST',
    path: '/api/massive-users/massive-upload',
    auth: 'JWT',
    description: 'Carga masiva de usuarios (Excel, multipart/form-data).',
    requestExample: { formData: { file: 'usuarios.xlsx' } },
    responseExample: ok(
      { total: 10, processed: 10, created: 8, existing: 1, failed: 1, results: [] },
      'Carga masiva procesada',
    ),
  },
];

/** Completos los ejemplos por defecto si una entrada no los define. */
function withExamples(ep: RestEndpointDoc): RestEndpointDoc {
  const pathParams: Record<string, string> = {};
  (ep.path.match(/:(\w+)/g) || []).forEach((p) => {
    pathParams[p.slice(1)] = 'id-ejemplo';
  });

  const requestExample =
    ep.requestExample ??
    (Object.keys(pathParams).length > 0
      ? { pathParams }
      : ep.method === 'GET' || ep.method === 'DELETE'
        ? { query: {} }
        : { body: {} });

  const responseExample =
    ep.responseExample ??
    ok(
      ep.method === 'GET'
        ? ep.path.includes(':')
          ? { _id: 'id-ejemplo' }
          : [{ _id: 'id-ejemplo' }]
        : { _id: 'id-ejemplo' },
      'Operación exitosa',
    );

  return { ...ep, requestExample, responseExample };
}

@ApiTags('API REST (documentación)')
@Controller('rest-docs')
export class RestDocsController {
  @Get()
  @Get('endpoints')
  @ApiOperation({
    summary: '[SOLO DOCUMENTACIÓN] Catálogo de endpoints REST',
    description:
      'Endpoint informativo y NO funcional. Lista los endpoints HTTP de la ' +
      'aplicación con método, ruta, autenticación, descripción y ejemplos de ' +
      'payload/respuesta. Disponible en `GET /api/rest-docs` y ' +
      '`GET /api/rest-docs/endpoints`.',
  })
  @ApiResponse({ status: 200, description: 'Catálogo de endpoints REST' })
  endpoints() {
    const endpoints = REST_ENDPOINTS.map(withExamples);
    const domains = Array.from(
      new Set(endpoints.map((e) => e.path.split('/')[2])),
    );
    return {
      message: 'Catálogo de endpoints REST',
      note: 'Solo documentación. Use los endpoints reales de cada dominio.',
      total: endpoints.length,
      domains,
      endpoints,
    };
  }
}
