import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'Administrador', description: 'Nombre del rol' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'ADMIN', description: 'Código único del rol' })
  @IsString()
  @IsNotEmpty()
  codeRol: string;

  @ApiProperty({
    example: 'Rol con todos los privilegios del sistema',
    description: 'Descripción del rol',
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
    example: '2025-08-06T12:00:00Z',
    description: 'Fecha de última modificación',
  })
  @IsOptional()
  modiefied: Date;

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
    example: '07/08/2025',
    description: 'Fecha legible de última modificación',
  })
  @IsOptional()
  @IsString()
  dateModified: string;

  @ApiProperty({
    example: '14:30:00',
    description: 'Hora legible de última modificación',
  })
  @IsOptional()
  @IsString()
  hourModified: string;

  @ApiProperty({
    example: '1234567890abcdef',
    description: 'ID del usuario que modificó el rol',
  })
  @IsOptional()
  @IsString()
  idUserModified: string;

  @ApiProperty({ example: true, description: 'Indica si el rol está activo' })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({
    example: false,
    description: 'Indica si el rol hereda permisos',
  })
  @IsOptional()
  @IsBoolean()
  isInheritPermissions: boolean;

  @ApiProperty({ example: false, description: 'Indica los permisos del rol' })
  @IsOptional()
  @IsArray()
  permissions: object[];
}
