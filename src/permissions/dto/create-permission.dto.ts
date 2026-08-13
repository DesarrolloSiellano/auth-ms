import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CreateRoleDto } from 'src/roles/dto/create-role.dto';

export class CreatePermissionDto {
  @ApiProperty({ example: 'Crear usuario', description: 'Nombre del permiso' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'Permite crear un nuevo usuario en el sistema',
    description: 'Descripción del permiso',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    example: 'create',
    description: 'Acción permitida (create, read, update, delete)',
  })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiPropertyOptional({
    example: 'usuarios',
    description: 'Recurso al que aplica el permiso',
  })
  @IsOptional()
  @IsString()
  resource?: string;

  @ApiPropertyOptional({
    example: 'abc123',
    description: 'ID específico del recurso (opcional)',
  })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiProperty({
    example: 'role-based',
    description: 'Tipo de permiso (global o role-based)',
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({
    type: () => CreateRoleDto,
    description: 'Relación con el rol asociado al permiso',
  })
  @IsOptional()
  rol?: CreateRoleDto;

  @ApiProperty({
    example: '2025-08-06T12:00:00Z',
    description: 'Fecha de creación',
  })
  @IsOptional()
  created: Date;

  @ApiProperty({
    example: '2025-08-06T12:30:00Z',
    description: 'Fecha de última modificación',
  })
  @IsOptional()
  modified: Date;

  @ApiProperty({
    example: '06/08/2025',
    description: 'Fecha legible de creación',
  })
  @IsOptional()
  @IsString()
  dateCreated: string;

  @ApiProperty({ example: '12:00:00', description: 'Hora legible de creación' })
  @IsOptional()
  @IsString()
  hourCreated: string;

  @ApiProperty({
    example: '06/08/2025',
    description: 'Fecha legible de modificación',
  })
  @IsOptional()
  @IsString()
  dateModified: string;

  @ApiProperty({
    example: '12:30:00',
    description: 'Hora legible de modificación',
  })
  @IsOptional()
  @IsString()
  hourModified: string;

  @ApiProperty({
    example: '1234567890abcdef',
    description: 'ID del usuario que modificó el permiso',
  })
  @IsOptional()
  @IsString()
  idUserModified: string;

  @ApiProperty({
    example: true,
    description: 'Indica si el permiso está activo',
  })
  @IsBoolean()
  isActive: boolean;
}
