import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'Juan', description: 'Nombre del usuario' })
  name: string;

  @ApiProperty({ example: 'Pérez', description: 'Apellido del usuario' })
  lastName: string;

  @ApiProperty({ example: '+573001234567', description: 'Número telefónico' })
  phone: string;

  @ApiProperty({ example: 'juan@mail.com', description: 'Correo electrónico' })
  email: string;

  @ApiPropertyOptional({ example: 'juanperez', description: 'Nombre de usuario (opcional)' })
  username?: string;

  @ApiProperty({ example: 'password123', description: 'Contraseña' })
  password: string;

  @ApiPropertyOptional({ example: '2025-08-06T12:00:00Z', description: 'Fecha de creación' })
  created?: Date;

  @ApiPropertyOptional({ example: '2025-08-06T12:30:00Z', description: 'Fecha de última modificación' })
  modified?: Date;

  @ApiPropertyOptional({ example: '06/08/2025', description: 'Fecha legible de creación' })
  dateCreated?: string;

  @ApiPropertyOptional({ example: '12:00:00', description: 'Hora legible de creación' })
  hourCreated?: string;

  @ApiPropertyOptional({ example: '06/08/2025', description: 'Fecha legible de modificación' })
  dateModified?: string;

  @ApiPropertyOptional({ example: '12:30:00', description: 'Hora legible de modificación' })
  hourModified?: string;

  @ApiPropertyOptional({ example: '1234567890abcdef', description: 'ID del usuario que realizó modificaciones' })
  idUserModified?: string;

  @ApiProperty({ example: true, description: 'Indica si el usuario está activo' })
  isActived: boolean;

  @ApiProperty({ example: false, description: 'Indica si el usuario es administrador' })
  isAdmin: boolean;

  @ApiProperty({ example: false, description: 'Indica si el usuario es super usuario administrador' })
  isSuperAdmin: boolean;

  @ApiProperty({ example: true, description: 'Indica si es un usuario nuevo' })
  isNewUser: boolean;

  @ApiPropertyOptional({ example: 'EmpresaX', description: 'Nombre de la empresa del usuario' })
  company?: string;

  @ApiPropertyOptional({ example: 'reset-token-abc123', description: 'Token para restablecer contraseña' })
  passwordResetToken?: string;

  @ApiPropertyOptional({ example: '2025-08-07T00:00:00Z', description: 'Fecha de expiración del token de restablecimiento' })
  passwordResetExpires?: Date;

  @ApiPropertyOptional({ type: () => [Module], description: 'Módulos asociados al usuario' })
  modules?: Module[];

  @ApiPropertyOptional({ type: () => [Rol], description: 'Roles asociados al usuario' })
  roles?: Rol[];

  @ApiPropertyOptional({ type: () => [Permission], description: 'Permisos asociados al usuario' })
  permissions?: Permission[];
}


export class Rol {
  @ApiProperty({ example: 'Administrador', description: 'Nombre del rol' })
  name: string;

  @ApiProperty({ example: 'ADMIN', description: 'Código único del rol' })
  codeRol: string;

  @ApiProperty({ example: 'Rol con permisos administrativos', description: 'Descripción del rol' })
  description: string;

  @ApiProperty({ example: '2025-08-06T10:00:00Z', description: 'Fecha de creación' })
  created: Date;

  @ApiProperty({ example: '2025-08-06T12:00:00Z', description: 'Fecha de última modificación' })
  modiefied: Date;

  @ApiProperty({ example: true, description: 'Indica si el rol está activo' })
  isActive: boolean;

  @ApiProperty({ example: false, description: 'Indica si el rol hereda permisos de otros roles' })
  isInheritPermissions: boolean;
}

export class Permission {
  @ApiProperty({ example: 'Crear usuario', description: 'Nombre del permiso' })
  name: string;

  @ApiProperty({ example: 'Permite crear un nuevo usuario', description: 'Descripción del permiso' })
  description: string;

  @ApiProperty({ example: 'create', description: 'Acción permitida (create, read, update, delete)' })
  action: string;

  @ApiProperty({ example: 'usuarios', description: 'Recurso al que aplica el permiso' })
  resource: string;

  @ApiPropertyOptional({ example: 'abc123', description: 'ID específico del recurso (opcional)' })
  resourceId?: string;

  @ApiProperty({ example: 'role-based', description: 'Tipo de permiso (global o role-based)' })
  type: string;

  @ApiPropertyOptional({ type: () => Rol, description: 'Rol asociado al permiso (opcional)' })
  rol?: Rol;

  @ApiProperty({ example: '2025-08-06T12:00:00Z', description: 'Fecha de creación' })
  created: Date;

  @ApiProperty({ example: '2025-08-06T12:30:00Z', description: 'Fecha de última modificación' })
  modified: Date;

  @ApiProperty({ example: true, description: 'Indica si el permiso está activo' })
  isActive: boolean;
}

export class Module {
  @ApiProperty({ example: 'Módulo Usuarios', description: 'Nombre del módulo' })
  name: string;

  @ApiProperty({ example: 'Módulo para la gestión de usuarios', description: 'Descripción del módulo' })
  description: string;

  @ApiProperty({ example: '2025-08-06T09:00:00Z', description: 'Fecha de creación' })
  created: Date;

  @ApiProperty({ example: '2025-08-06T11:00:00Z', description: 'Fecha de última modificación' })
  modified: Date;

  @ApiProperty({ example: true, description: 'Indica si el módulo está activo' })
  isActive: boolean;

  @ApiProperty({ example: false, description: 'Indica si el módulo es parte del sistema base' })
  isSystemModule: boolean;

  @ApiProperty({ type: () => [Permission], description: 'Lista de permisos asociados al módulo' })
  permissions: Permission[];

  @ApiProperty({ type: () => [Rol], description: 'Lista de roles asociados al módulo' })
  roles: Rol[];
}

