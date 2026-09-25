import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

const POLICY_TYPES = ['boolean', 'number', 'text', 'select', 'json'];

export class CreatePolicyDefinitionDto {
  @ApiProperty({ example: 'features.pbx' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'Integración PBX' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({ example: 'Habilita la integración con PBX' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'features' })
  @IsString()
  @IsNotEmpty()
  group: string;

  @ApiProperty({ example: 'boolean', enum: POLICY_TYPES })
  @IsIn(POLICY_TYPES)
  type: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  defaultValue?: any;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  options?: { label: string; value: any }[];

  @ApiPropertyOptional({ example: 'mensajes/mes' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  min?: number | null;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsNumber()
  max?: number | null;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePolicyDefinitionDto extends PartialType(
  CreatePolicyDefinitionDto,
) {}
