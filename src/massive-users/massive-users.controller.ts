import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerHybridGuard } from 'src/core/guards/throttler-hybrid.guard';
import { MassiveUsersService } from './massive-users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(ThrottlerHybridGuard)
export class MassiveUsersController {
  constructor(private readonly massiveUsersService: MassiveUsersService) {}

  @Post('massive-upload')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Carga masiva de usuarios desde un archivo Excel',
    description:
      'Recibe un archivo .xlsx/.xls (máximo 50 usuarios) y crea los usuarios ' +
      'respetando las reglas de la creación individual. El envío de correos es ' +
      'no bloqueante. Devuelve un reporte con creados, existentes y fallidos.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Proceso de carga masiva finalizado',
    schema: {
      example: {
        message: 'Proceso de carga masiva finalizado',
        statusCode: 200,
        status: 'Success',
        data: {
          total: 3,
          processed: 3,
          created: 1,
          existing: 1,
          failed: 1,
          results: [
            {
              row: 2,
              name: 'Juan Pérez',
              email: 'juan@mail.com',
              status: 'created',
              message: 'Usuario creado correctamente',
            },
            {
              row: 3,
              name: 'María López',
              email: 'maria@mail.com',
              status: 'existing',
              message: 'El usuario ya existe (correo registrado)',
            },
            {
              row: 4,
              name: 'Carlos Ruiz',
              email: 'carlos@mail.com',
              status: 'failed',
              message: 'El rol "XXX" no existe',
            },
          ],
        },
      },
    },
  })
  uploadMassive(@UploadedFile() file: any, @Req() req: any) {
    const user = req.user;
    if (!user?.isAdmin && !user?.isSuperAdmin) {
      throw new UnauthorizedException(
        'No tienes permiso para crear usuarios',
      );
    }
    if (!file) {
      throw new BadRequestException('Archivo no encontrado en la petición');
    }
    return this.massiveUsersService.processExcel(file, user);
  }
}
