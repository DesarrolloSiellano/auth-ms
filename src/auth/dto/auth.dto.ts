import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsNotEmpty,
} from 'class-validator';

export class Login {
  @ApiProperty({
    example: 'usuario@example.com',
    description: 'Correo electrónico del usuario',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'Contraseña del usuario',
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    example: false,
    description: 'Indica si el usuario desea mantener la sesión iniciada',
  })
  @IsOptional()
  meta?: Meta;
}

export interface Meta {
  os?: string;
  os_version?: string;
  browser?: string;
  browser_version?: string;
  istable?: boolean;
  ismovil?: boolean;
  isbrowser?: boolean;
  user_agent?: string;
}

export class Register {
  @ApiProperty({ example: 'Juan', description: 'Nombre del usuario' })
  name: string;

  @ApiProperty({ example: 'Pérez', description: 'Apellido del usuario' })
  lastName: string;

  @ApiProperty({
    example: 'usuario@example.com',
    description: 'Correo electrónico del usuario',
  })
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'Contraseña para registro',
  })
  password: string;
}

export class ChangePassword {
  @ApiProperty({ example: '1234567890abcdef', description: 'ID del usuario' })
  @IsOptional()
  @IsString()
  id: string;

  @ApiProperty({ example: 'oldPassword123', description: 'Contraseña actual' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'newPassword456', description: 'Nueva contraseña' })
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}

export class RecoveryPassword {
  @ApiProperty({
    example: 'usuario@example.com',
    description: 'Correo electrónico para recuperación de contraseña',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class SetPasswordWithToken {
  @ApiProperty({
    example: 'abcdef123456...',
    description: 'Token de activación enviado por correo',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: 'newPassword123!',
    description: 'Nueva contraseña a establecer',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RefreshToken {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Token de refresco',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
