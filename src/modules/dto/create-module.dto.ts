import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Permission } from 'src/permissions/entities/permission.entity';
import { Rol } from 'src/roles/entities/role.entity';

export class CreateModuleDto {
  @ApiProperty({
    example: 'Gestión de Usuarios',
    description: 'Nombre del módulo',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'Módulo para administrar usuarios y permisos',
    description: 'Descripción del módulo',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

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
    description: 'Fecha en formato legible de creación',
  })
  @IsOptional()
  @IsString()
  dateCreated: string;

  @ApiProperty({
    example: '12:00:00',
    description: 'Hora en formato legible de creación',
  })
  @IsOptional()
  @IsString()
  hourCreated: string;

  @ApiProperty({
    example: '06/08/2025',
    description: 'Fecha en formato legible de modificación',
  })
  @IsOptional()
  @IsString()
  dateModified: string;

  @ApiProperty({
    example: '12:30:00',
    description: 'Hora en formato legible de modificación',
  })
  @IsOptional()
  @IsString()
  hourModified: string;

  @ApiProperty({
    example: '1234567890abcdef',
    description: 'ID del usuario que modificó el módulo',
  })
  @IsOptional()
  @IsString()
  idUserModified: string;

  @ApiProperty({
    example: true,
    description: 'Indica si el módulo está activo',
  })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({
    example: false,
    description: 'Indica si es un módulo del sistema',
  })
  @IsOptional()
  @IsBoolean()
  isSystemModule: boolean;

  @ApiPropertyOptional({
    type: () => Object,
    isArray: true,
    description: 'Permisos asociados al módulo',
  })
  @IsOptional()
  @IsArray()
  permissions?: Permission[];

  @ApiPropertyOptional({
    type: () => Object,
    isArray: true,
    description: 'Roles asociados al módulo',
  })
  @IsOptional()
  @IsArray()
  roles?: Rol[];

  @ApiPropertyOptional({
    type: () => Object,
    isArray: true,
    description: 'Rutas asociadas al módulo',
  })
  @IsOptional()
  @IsArray()
  routes?: Route[];
}

export interface Route {
  name: string;
  path: string;
  icon: string;
  children?: Route[]; // Opcional, arreglo de rutas hijas
}
