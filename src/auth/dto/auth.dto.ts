import { ApiProperty } from '@nestjs/swagger';

export class Login {
  @ApiProperty({ example: 'usuario@example.com', description: 'Correo electrónico del usuario' })
  email: string;

  @ApiProperty({ example: 'password123', description: 'Contraseña del usuario' })
  password: string;
}

export class Register {
  @ApiProperty({ example: 'Juan', description: 'Nombre del usuario' })
  name: string;

  @ApiProperty({ example: 'Pérez', description: 'Apellido del usuario' })
  lastName: string;

  @ApiProperty({ example: 'usuario@example.com', description: 'Correo electrónico del usuario' })
  email: string;

  @ApiProperty({ example: 'password123', description: 'Contraseña para registro' })
  password: string;
}

export class ChangePassword {

  @ApiProperty({ example: '1234567890abcdef', description: 'ID del usuario' })
  id: string;

  @ApiProperty({ example: 'oldPassword123', description: 'Contraseña actual' })
  currentPassword: string;

  @ApiProperty({ example: 'newPassword456', description: 'Nueva contraseña' })
  newPassword: string;
}

export class RecoveryPassword {
  @ApiProperty({ example: 'usuario@example.com', description: 'Correo electrónico para recuperación de contraseña' })
  email: string;
}
