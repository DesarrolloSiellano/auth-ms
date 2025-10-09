import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'Administrador', description: 'Nombre del rol' })
  name: string;

  @ApiProperty({ example: 'ADMIN', description: 'Código único del rol' })
  codeRol: string;

  @ApiProperty({ example: 'Rol con todos los privilegios del sistema', description: 'Descripción del rol' })
  description: string;

  @ApiProperty({ example: '2025-08-06T12:00:00Z', description: 'Fecha de creación' })
  created: Date;

  @ApiProperty({ example: '2025-08-06T12:00:00Z', description: 'Fecha de última modificación' })
  modiefied: Date;

  @ApiProperty({ example: '06/08/2025', description: 'Fecha legible de creación' })
  dateCreated: string;

  @ApiProperty({ example: '12:00:00', description: 'Hora legible de creación' })
  hourCreated: string;

  @ApiProperty({ example: '07/08/2025', description: 'Fecha legible de última modificación' })
  dateModified: string;

  @ApiProperty({ example: '14:30:00', description: 'Hora legible de última modificación' })
  hourModified: string;

  @ApiProperty({ example: '1234567890abcdef', description: 'ID del usuario que modificó el rol' })
  idUserModified: string;

  @ApiProperty({ example: true, description: 'Indica si el rol está activo' })
  isActive: boolean;

  @ApiProperty({ example: false, description: 'Indica si el rol hereda permisos' })
  isInheritPermissions: boolean;

  @ApiProperty({ example: false, description: 'Indica los permisos del rol' })
  permissions: Object[];
}
