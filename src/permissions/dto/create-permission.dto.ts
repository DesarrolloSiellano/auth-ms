import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateRoleDto } from 'src/roles/dto/create-role.dto';

export class CreatePermissionDto {
  @ApiProperty({ example: 'Crear usuario', description: 'Nombre del permiso' })
  name: string;

  @ApiProperty({ example: 'Permite crear un nuevo usuario en el sistema', description: 'Descripción del permiso' })
  description: string;

  @ApiProperty({ example: 'create', description: 'Acción permitida (create, read, update, delete)' })
  action: string;

  @ApiPropertyOptional({ example: 'usuarios', description: 'Recurso al que aplica el permiso' })
  resource?: string;

  @ApiPropertyOptional({ example: 'abc123', description: 'ID específico del recurso (opcional)' })
  resourceId?: string;

  @ApiProperty({ example: 'role-based', description: 'Tipo de permiso (global o role-based)' })
  type: string;

  @ApiPropertyOptional({ type: () => CreateRoleDto, description: 'Relación con el rol asociado al permiso' })
  rol?: CreateRoleDto;

  @ApiProperty({ example: '2025-08-06T12:00:00Z', description: 'Fecha de creación' })
  created: Date;

  @ApiProperty({ example: '2025-08-06T12:30:00Z', description: 'Fecha de última modificación' })
  modified: Date;

  @ApiProperty({ example: '06/08/2025', description: 'Fecha legible de creación' })
  dateCreated: string;

  @ApiProperty({ example: '12:00:00', description: 'Hora legible de creación' })
  hourCreated: string;

  @ApiProperty({ example: '06/08/2025', description: 'Fecha legible de modificación' })
  dateModified: string;

  @ApiProperty({ example: '12:30:00', description: 'Hora legible de modificación' })
  hourModified: string;

  @ApiProperty({ example: '1234567890abcdef', description: 'ID del usuario que modificó el permiso' })
  idUserModified: string;

  @ApiProperty({ example: true, description: 'Indica si el permiso está activo' })
  isActive: boolean;
}
