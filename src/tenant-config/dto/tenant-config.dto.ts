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
    example: { 'features.pbx': true, 'limits.maxAgents': 100 },
    description: 'Mapa parcial de políticas a actualizar',
  })
  @IsObject()
  values: Record<string, any>;
}

export class ReportTenantUsageDto {
  @ApiProperty({ example: '0000000' })
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({ example: '2026-09', description: 'Período YYYY-MM' })
  @IsString()
  @IsNotEmpty()
  period: string;

  @ApiProperty({
    example: { 'sms.sent': 10, 'whatsapp.utilidad': 3 },
    description: 'Deltas de consumo por métrica',
  })
  @IsObject()
  metrics: Record<string, number>;

  @ApiPropertyOptional({ example: 'uuid-del-reporte' })
  @IsOptional()
  @IsString()
  reportId?: string;
}
