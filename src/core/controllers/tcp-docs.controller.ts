import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

interface TcpCommandDoc {
  command: string;
  domain: string;
  description: string;
  payloadExample?: Record<string, any>;
  responseExample?: Record<string, any>;
}

/**
 * Catálogo informativo (NO funcional) de todos los comandos TCP del
 * microservicio. La comunicación real ocurre por sockets TCP y cada payload
 * debe incluir `serviceKey`.
 */
const TCP_COMMANDS: TcpCommandDoc[] = [
  // ---------------------------------------------------------------- auth
  {
    command: 'login',
    domain: 'auth',
    description: 'Inicia sesión y devuelve tokens + identidad.',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      email: 'juan@mail.com',
      password: '***',
      meta: { os: 'Linux', browser: 'Chrome' },
      ip: '127.0.0.1',
    },
    responseExample: {
      message: 'Login successful',
      meta: { accessToken: '...', refreshToken: '...', totalData: 1 },
    },
  },
  {
    command: 'validateUser',
    domain: 'auth',
    description:
      'Valida el JWT y devuelve el usuario. RECHAZA si la sesión fue revocada o el token no tiene `sid`.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', token: '<access_token>' },
    responseExample: {
      user: { _id: 'u1', email: 'juan@mail.com' },
      meta: { totalData: 1, id: 'u1', valid: true },
    },
  },
  {
    command: 'validateSession',
    domain: 'auth',
    description:
      'Comprueba únicamente si el token/sesión sigue vigente. No lanza: devuelve { active }.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', token: '<access_token>' },
    responseExample: { active: true, valid: true, userId: 'u1' },
  },
  {
    command: 'refresh',
    domain: 'auth',
    description: 'Refresca el access token a partir del refresh token.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', refreshToken: '...' },
    responseExample: { accessToken: '...', payload: { _id: 'u1' } },
  },
  {
    command: 'changePassword',
    domain: 'auth',
    description: 'Cambia la contraseña del usuario.',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      id: 'u1',
      currentPassword: '***',
      newPassword: '***',
    },
    responseExample: { message: 'Contraseña cambiada correctamente' },
  },

  // --------------------------------------------------------------- users
  {
    command: 'createExternalUser',
    domain: 'users',
    description:
      'Crea un usuario desde apps externas (respeta los topes del tenant).',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      name: 'Juan',
      lastName: 'Pérez',
      email: 'juan@mail.com',
      company: 'EmpresaX',
      tenantId: 'tenant-id',
    },
    responseExample: { statusCode: 201, data: { _id: 'u1' } },
  },
  {
    command: 'createUser',
    domain: 'users',
    description: 'Crea un usuario con los datos indicados.',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      name: 'Juan',
      lastName: 'Pérez',
      email: 'juan@mail.com',
      company: 'EmpresaX',
    },
  },
  {
    command: 'findAllUsers',
    domain: 'users',
    description: 'Lista los usuarios del contexto.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', user: {} },
  },
  {
    command: 'findUsersByTenant',
    domain: 'users',
    description: 'Lista usuarios por empresa/tenant.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', company: 'EmpresaX' },
  },
  {
    command: 'findUsersByPagination',
    domain: 'users',
    description: 'Lista usuarios paginados.',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      from: 0,
      limit: 20,
    },
  },
  {
    command: 'findUserById',
    domain: 'users',
    description: 'Busca un usuario por id.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'u1' },
  },
  {
    command: 'getUserProfile',
    domain: 'users',
    description: 'Devuelve el perfil/autorización del usuario.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'u1' },
  },
  {
    command: 'findUsersByDate',
    domain: 'users',
    description: 'Lista usuarios creados en un rango de fechas.',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      from: '2026-01-01',
      to: '2026-01-31',
    },
  },
  {
    command: 'updateUser',
    domain: 'users',
    description: 'Actualiza un usuario.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'u1', data: {} },
  },
  {
    command: 'removeUser',
    domain: 'users',
    description: 'Elimina un usuario.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'u1' },
  },
  {
    command: 'softRemoveUser',
    domain: 'users',
    description: 'Baja lógica de un usuario.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'u1' },
  },
  {
    command: 'hardRemoveUser',
    domain: 'users',
    description: 'Baja física de un usuario (SuperAdmin).',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'u1' },
  },

  // --------------------------------------------------------------- roles
  {
    command: 'createRole',
    domain: 'roles',
    description: 'Crea un rol.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', name: 'Agente' },
  },
  {
    command: 'findAllRoles',
    domain: 'roles',
    description: 'Lista roles.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>' },
  },
  {
    command: 'findOneRole',
    domain: 'roles',
    description: 'Busca un rol por id.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'r1' },
  },
  {
    command: 'updateRole',
    domain: 'roles',
    description: 'Actualiza un rol.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'r1', data: {} },
  },
  {
    command: 'removeRole',
    domain: 'roles',
    description: 'Elimina un rol.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'r1' },
  },

  // --------------------------------------------------------- permissions
  {
    command: 'createPermission',
    domain: 'permissions',
    description: 'Crea un permiso.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', name: 'Crear' },
  },
  {
    command: 'findAllPermissions',
    domain: 'permissions',
    description: 'Lista permisos.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>' },
  },
  {
    command: 'findOnePermission',
    domain: 'permissions',
    description: 'Busca un permiso por id.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'p1' },
  },
  {
    command: 'updatePermission',
    domain: 'permissions',
    description: 'Actualiza un permiso.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'p1', data: {} },
  },
  {
    command: 'removePermission',
    domain: 'permissions',
    description: 'Elimina un permiso.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'p1' },
  },

  // ------------------------------------------------------------- modules
  {
    command: 'createModule',
    domain: 'modules',
    description: 'Crea un módulo.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', name: 'adminUserModule' },
  },
  {
    command: 'findAllModules',
    domain: 'modules',
    description: 'Lista módulos.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>' },
  },
  {
    command: 'findOneModule',
    domain: 'modules',
    description: 'Busca un módulo por id.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'm1' },
  },
  {
    command: 'updateModule',
    domain: 'modules',
    description: 'Actualiza un módulo.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'm1', data: {} },
  },
  {
    command: 'removeModule',
    domain: 'modules',
    description: 'Elimina un módulo.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'm1' },
  },

  // ----------------------------------------------------------- companies
  {
    command: 'createCompany',
    domain: 'companies',
    description: 'Crea una empresa/tenant.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', name: 'EmpresaX' },
  },
  {
    command: 'findAllCompanies',
    domain: 'companies',
    description: 'Lista empresas.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>' },
  },
  {
    command: 'findOneCompany',
    domain: 'companies',
    description: 'Busca una empresa por id.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'c1' },
  },
  {
    command: 'updateCompany',
    domain: 'companies',
    description: 'Actualiza una empresa.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'c1', data: {} },
  },
  {
    command: 'removeCompany',
    domain: 'companies',
    description: 'Elimina una empresa.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'c1' },
  },
  {
    command: 'blockCompany',
    domain: 'companies',
    description: 'Bloquea una empresa (ningún usuario inicia sesión).',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      id: 'c1',
      reason: 'mora',
    },
  },
  {
    command: 'unblockCompany',
    domain: 'companies',
    description: 'Desbloquea una empresa.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>', id: 'c1' },
  },

  // -------------------------------------------------------- tenant-config
  {
    command: 'getTenantConfig',
    domain: 'tenant-config',
    description: 'Obtiene la configuración resuelta de un tenant.',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      tenantId: 'tenant-id',
      company: 'EmpresaX',
    },
  },
  {
    command: 'getTenantPolicyCatalog',
    domain: 'tenant-config',
    description: 'Obtiene el catálogo de políticas.',
    payloadExample: { serviceKey: '<SERVICE_API_KEY>' },
  },
  {
    command: 'reportTenantUsage',
    domain: 'tenant-config',
    description: 'Reporta consumo (deltas) de un tenant.',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      tenantId: 'tenant-id',
      period: '2026-09',
      metrics: { 'sms.sent': 10 },
    },
  },
  {
    command: 'getTenantUsage',
    domain: 'tenant-config',
    description: 'Obtiene el consumo de un tenant.',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      tenantId: 'tenant-id',
      period: '2026-09',
    },
  },
  {
    command: 'setTenantConfig',
    domain: 'tenant-config',
    description: 'Crea/actualiza la configuración de un tenant.',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      tenantId: 'tenant-id',
      values: { 'feature.pbx': true },
    },
  },
  {
    command: 'upsertPolicyDefinition',
    domain: 'tenant-config',
    description: 'Crea una definición de política.',
    payloadExample: {
      serviceKey: '<SERVICE_API_KEY>',
      definition: { key: 'features.x', label: 'X', type: 'boolean' },
    },
  },
];

@ApiTags('TCP (documentación)')
@Controller('tcp-docs')
export class TcpDocsController {
  @Get()
  @Get('message-patterns')
  @Post('message-patterns')
  @ApiOperation({
    summary: '[SOLO DOCUMENTACIÓN] Catálogo completo de comandos TCP',
    description:
      'Endpoint informativo y NO funcional. Lista todos los comandos TCP ' +
      'soportados por el microservicio. La comunicación real es por sockets TCP ' +
      'y **todo payload debe incluir `serviceKey`** (valor de `SERVICE_API_KEY`). ' +
      'Disponible en `GET /api/tcp-docs`, `GET /api/tcp-docs/message-patterns` ' +
      'y `POST /api/tcp-docs/message-patterns`.',
  })
  @ApiResponse({ status: 200, description: 'Catálogo de comandos TCP' })
  messagePatterns() {
    const domains = Array.from(new Set(TCP_COMMANDS.map((c) => c.domain)));
    return {
      message: 'Catálogo de comandos TCP',
      note: 'Solo documentación. La comunicación real es por sockets TCP con serviceKey.',
      serviceAuth: 'serviceKey (SERVICE_API_KEY) obligatorio en cada payload',
      total: TCP_COMMANDS.length,
      domains,
      commands: TCP_COMMANDS,
    };
  }
}
