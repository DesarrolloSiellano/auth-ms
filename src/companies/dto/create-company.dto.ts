import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({
    example: '2025-09-11T14:30:00Z',
    description: 'Fecha y hora de creación del registro',
  })
  @IsOptional()
  created: Date;

  @ApiProperty({
    example: '2025-09-11T15:00:00Z',
    description: 'Fecha y hora de última modificación del registro',
  })
  @IsOptional()
  modified: Date;

  @ApiProperty({
    example: 'Compañía Ejemplar S.A.',
    description: 'Nombre de la compañía',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '900123456-7',
    description: 'Identificador único (RUT/NIT) requerido por el esquema',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiPropertyOptional({
    example: 'Juan Pérez',
    description: 'Representante legal de la compañía',
  })
  @IsOptional()
  @IsString()
  legalRepresentative?: string;

  @ApiPropertyOptional({
    example: '1234567890',
    description: 'Número de Registro Único del Contribuyente (RUC)',
  })
  @IsOptional()
  @IsString()
  ruc?: string;

  @ApiPropertyOptional({
    example: 'Calle 123 #45-67, Ciudad',
    description: 'Dirección física de la compañía',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    example: '+57 311 1234567',
    description: 'Número telefónico de contacto',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'contacto@compania.com',
    description: 'Correo electrónico de contacto',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'https://www.compania.com',
    description: 'Sitio web de la compañía',
  })
  @IsOptional()
  @IsString()
  web?: string;

  @ApiPropertyOptional({
    example: 'https://www.compania.com/logo.png',
    description: 'URL o ruta del logo de la compañía',
  })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({
    example: '60f6a2b8c45e4d23e8a7a123',
    description: 'Identificador único de la compañía',
  })
  @IsOptional()
  @IsString()
  _id?: string;

  @ApiProperty({
    example: true,
    description: 'Indica si la compañía está activa',
  })
  @IsBoolean()
  isActive: boolean;

  @ApiPropertyOptional({
    example: '11/09/2025',
    description: 'Fecha legible de creación',
  })
  @IsOptional()
  @IsString()
  dateCreated?: string;

  @ApiPropertyOptional({
    example: '14:30:00',
    description: 'Hora legible de creación',
  })
  @IsOptional()
  @IsString()
  hourCreated?: string;

  @ApiPropertyOptional({
    example: '11/09/2025',
    description: 'Fecha legible de última modificación',
  })
  @IsOptional()
  @IsString()
  dateModified?: string;

  @ApiPropertyOptional({
    example: '15:00:00',
    description: 'Hora legible de última modificación',
  })
  @IsOptional()
  @IsString()
  hourModified?: string;

  @ApiPropertyOptional({
    example: '60f6a2b8c45e4d23e8a7a999',
    description: 'ID del usuario que modificó la compañía',
  })
  @IsOptional()
  @IsString()
  idUserModified?: string;
}
