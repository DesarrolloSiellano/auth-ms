import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: '2025-09-11T14:30:00Z', description: 'Fecha y hora de creación del registro' })
  created: Date;

  @ApiProperty({ example: '2025-09-11T15:00:00Z', description: 'Fecha y hora de última modificación del registro' })
  modified: Date;

  @ApiProperty({ example: 'Compañía Ejemplar S.A.', description: 'Nombre de la compañía' })
  name: string;

  @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Representante legal de la compañía' })
  legalRepresentative?: string;

  @ApiPropertyOptional({ example: '1234567890', description: 'Número de Registro Único del Contribuyente (RUC)' })
  ruc?: string;

  @ApiPropertyOptional({ example: 'Calle 123 #45-67, Ciudad', description: 'Dirección física de la compañía' })
  address?: string;

  @ApiPropertyOptional({ example: '+57 311 1234567', description: 'Número telefónico de contacto' })
  phone?: string;

  @ApiPropertyOptional({ example: 'contacto@compania.com', description: 'Correo electrónico de contacto' })
  email?: string;

  @ApiPropertyOptional({ example: 'https://www.compania.com', description: 'Sitio web de la compañía' })
  web?: string;

  @ApiPropertyOptional({ example: 'https://www.compania.com/logo.png', description: 'URL o ruta del logo de la compañía' })
  logo?: string;

  @ApiProperty({ example: '60f6a2b8c45e4d23e8a7a123', description: 'Identificador único de la compañía' })
  _id?: string;

  @ApiProperty({ example: true, description: 'Indica si la compañía está activa' })
  isActive: boolean;

  @ApiPropertyOptional({ example: '11/09/2025', description: 'Fecha legible de creación' })
  dateCreated?: string;

  @ApiPropertyOptional({ example: '14:30:00', description: 'Hora legible de creación' })
  hourCreated?: string;

  @ApiPropertyOptional({ example: '11/09/2025', description: 'Fecha legible de última modificación' })
  dateModified?: string;

  @ApiPropertyOptional({ example: '15:00:00', description: 'Hora legible de última modificación' })
  hourModified?: string;

  @ApiPropertyOptional({ example: '60f6a2b8c45e4d23e8a7a999', description: 'ID del usuario que modificó la compañía' })
  idUserModified?: string;
}
