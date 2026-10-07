import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpsertTenantConfigDto {
  @ApiProperty({ example: '0000000', description: 'Identificador del tenant' })
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({ example: 'BPONET', description: 'Nombre de la empresa' })
  @IsString()
  @IsNotEmpty()
  company: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: { 'channels.sms.monthlyLimit': 3000 },
    description: 'Mapa de políticas (clave→valor)',
  })
  @IsOptional()
  @IsObject()
  values?: Record<string, any>;
}

export class PatchTenantConfigValuesDto {
  @ApiProperty({
    example: { 'features.pbx': true, 'limits.roles.AGE': 100 },
    description: 'Mapa parcial de políticas a actualizar',
  })
  @IsObject()
  values: Record<string, any>;
}
