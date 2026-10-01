import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
} from 'class-validator';
import { Rol, Permission, Module } from './create-user.dto';

/**
 * DTO de actualización de usuario con CAMPOS SEGUROS únicamente.
 *
 * Excluye deliberadamente campos privilegiados para evitar mass-assignment /
 * escalada de privilegios:
 * `_id, isSuperAdmin, company, tenantId, password, passwordResetToken,
 * passwordResetExpires, permissions, modules, created, modified, idUser*`.
 *
 * `isAdmin` se acepta pero el controller/servicio restringen su cambio a un
 * SuperAdmin.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: '+573001234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'juan@mail.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'juanperez' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActived?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isNewUser?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @ApiPropertyOptional({ type: () => [Rol] })
  @IsOptional()
  @IsArray()
  roles?: Rol[];

  @ApiPropertyOptional({ type: () => [Permission] })
  @IsOptional()
  @IsArray()
  permissions?: Permission[];

  @ApiPropertyOptional({ type: () => [Module] })
  @IsOptional()
  @IsArray()
  modules?: Module[];

  @ApiPropertyOptional({ example: ['tesoreria'] })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional({ example: ['operaciones'] })
  @IsOptional()
  @IsArray()
  groups?: string[];

  @ApiPropertyOptional({ example: { centroCosto: 'CC-01' } })
  @IsOptional()
  customFields?: Record<string, any>;
}
