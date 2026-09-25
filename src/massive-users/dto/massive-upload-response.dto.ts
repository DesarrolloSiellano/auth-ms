import { ApiProperty } from '@nestjs/swagger';

export type MassiveUserStatus = 'created' | 'existing' | 'failed';

export class MassiveUserResultDto {
  @ApiProperty({ example: 2, description: 'Número de fila en el Excel' })
  row: number;

  @ApiProperty({ example: 'Juan Pérez', description: 'Nombre del usuario' })
  name: string;

  @ApiProperty({ example: 'juan@mail.com', description: 'Correo del usuario' })
  email: string;

  @ApiProperty({
    example: 'created',
    enum: ['created', 'existing', 'failed'],
    description: 'Resultado del procesamiento de la fila',
  })
  status: MassiveUserStatus;

  @ApiProperty({
    example: 'Usuario creado correctamente',
    description: 'Mensaje o motivo del resultado',
  })
  message: string;
}

export class MassiveUploadReportDto {
  @ApiProperty({ example: 50, description: 'Total de filas leídas' })
  total: number;

  @ApiProperty({ example: 50, description: 'Total de filas procesadas' })
  processed: number;

  @ApiProperty({ example: 42, description: 'Usuarios creados' })
  created: number;

  @ApiProperty({ example: 3, description: 'Usuarios que ya existían' })
  existing: number;

  @ApiProperty({ example: 5, description: 'Usuarios que fallaron' })
  failed: number;

  @ApiProperty({ type: [MassiveUserResultDto] })
  results: MassiveUserResultDto[];
}
