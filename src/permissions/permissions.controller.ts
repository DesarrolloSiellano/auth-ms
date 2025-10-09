import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  UseGuards,
  Query,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ValidateObjectIdGuard } from 'src/core/guards/validateObjectId.guard';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(AuthGuard('jwt'))
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // Métodos HTTP REST

  @Post()
  @ApiOperation({ summary: 'Crear un permiso nuevo' })
  @ApiBody({ type: CreatePermissionDto })
  @ApiResponse({
    status: 201,
    description: 'Permiso creado exitosamente',
    schema: {
      example: {
        message: 'Permission created successfully',
        statusCode: 201,
        status: 'Success',
        data: {
          /* objeto permiso creado */
        },
        meta: {
          totalData: 1,
          createdAt: '2025-08-06T12:00:00.000Z',
          updatedAt: '2025-08-06T12:00:00.000Z',
          id: 'id-permiso',
        },
      },
    },
  })
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.create(createPermissionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los permisos' })
  @ApiResponse({
    status: 200,
    description: 'Listado de todos los permisos',
    schema: {
      example: {
        message: 'find all permissions',
        statusCode: 200,
        status: 'Success',
        data: [
          /* array de permisos */
        ],
        meta: { totalData: 5 },
      },
    },
  })
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get('findByPage')
  @ApiOperation({ summary: 'Obtener permisos por página' })
  @ApiResponse({
    status: 200,
    description: 'Listado de permisos por página',
    schema: {
      example: {
        message: 'find  permissions',
        statusCode: 200,
        status: 'Success',
        data: [
          /* array de permisos */
        ],
        meta: { totalData: 5 },
      },
    },
  })
  findByPage(
    @Query('from') from?: number,
    @Query('limit') limit?: number,
    @Query('global') global?: string,
    @Query('filters') filters?: string,
  ) {
    
    const fromNumber = from !== undefined ? Number(from) : 0;
    const limiteNumber = limit !== undefined ? Number(limit) : 10;
    return this.permissionsService.findByPage(fromNumber, limiteNumber, global, filters);
  }


  @Get(':id')
  @ApiOperation({ summary: 'Obtener un permiso por ID' })
  @ApiParam({ name: 'id', description: 'ID del permiso' })
  @ApiResponse({
    status: 200,
    description: 'Permiso encontrado',
    schema: {
      example: {
        message: 'find one permission',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto permiso */
        },
        meta: { totalData: 1 },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Permiso no encontrado',
  })
  @UseGuards(ValidateObjectIdGuard)
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar un permiso por ID' })
  @ApiParam({ name: 'id', description: 'ID del permiso a actualizar' })
  @ApiBody({ type: UpdatePermissionDto })
  @ApiResponse({
    status: 200,
    description: 'Permiso actualizado exitosamente',
    schema: {
      example: {
        message: 'Permission updated successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto permiso actualizado */
        },
        meta: {
          totalData: 1,
          updatedAt: '2025-08-06T12:30:00.000Z',
          id: 'id-permiso',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Permiso no encontrado',
  })
  @UseGuards(ValidateObjectIdGuard)
  update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, updatePermissionDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un permiso por ID' })
  @ApiParam({ name: 'id', description: 'ID del permiso a eliminar' })
  @ApiResponse({
    status: 200,
    description: 'Permiso eliminado exitosamente',
    schema: {
      example: {
        message: 'Permission deleted successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto permiso eliminado */
        },
        meta: {
          totalData: 1,
          deletedAt: '2025-08-06T13:00:00.000Z',
          id: 'id-permiso',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Permiso no encontrado',
  })
  @UseGuards(ValidateObjectIdGuard)
  remove(@Param('id') id: string) {
    return this.permissionsService.remove(id);
  }

  // Métodos de microservicio con MessagePattern - no documentados por Swagger

  @MessagePattern({ cmd: 'createPermission' })
  msCreate(@Payload() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.create(createPermissionDto);
  }

  @MessagePattern({ cmd: 'findAllPermissions' })
  msFindAll() {
    return this.permissionsService.findAll();
  }

  @MessagePattern({ cmd: 'findOnePermission' })
  msFindOne(@Payload() id: string) {
    return this.permissionsService.findOne(id);
  }

  @MessagePattern({ cmd: 'updatePermission' })
  msUpdate(
    @Payload()
    payload: {
      id: string;
      updatePermissionDto: UpdatePermissionDto;
    },
  ) {
    return this.permissionsService.update(
      payload.id,
      payload.updatePermissionDto,
    );
  }

  @MessagePattern({ cmd: 'removePermission' })
  msRemove(@Payload() id: string) {
    return this.permissionsService.remove(id);
  }

  @Post('tcp-docs/message-patterns')
  @ApiOperation({
    summary:
      '[SOLO DOCUMENTACIÓN] Patrones TCP soportados por PermissionsService',
    description: `
Este endpoint EXCLUSIVAMENTE documenta los comandos TCP soportados por el microservicio para integración entre servicios.  
**No enviar datos reales aquí; la comunicación real es por sockets TCP.**

Usa el decorador @MessagePattern en NestJS, ejemplo:
\`@MessagePattern({ cmd: 'createPermission' })\`
    `,
  })
  @ApiResponse({
    status: 200,
    description:
      'Documentación de patrones TCP disponible en este microservicio',
    schema: {
      example: {
        message: 'Comandos TCP disponibles en permissions',
        patterns: [
          {
            command: 'createPermission',
            description:
              'Crea un permiso. Payload: CreatePermissionDto. Devuelve objeto de creación.',
            payloadExample: {
              name: 'Crear usuario',
              description: 'Permite crear un usuario',
              action: 'create',
              type: 'role-based',
              created: '2025-08-06T12:00:00Z',
              isActive: true,
              // ...otros campos relevantes
            },
            responseExample: {
              message: 'Permission created successfully',
              statusCode: 201,
              status: 'Success',
              data: {
                /* objeto permiso creado */
              },
              meta: { totalData: 1, createdAt: '2025-08-06T12:00:00Z' },
            },
          },
          {
            command: 'findAllPermissions',
            description: 'Trae todos los permisos. Payload: ninguno.',
            responseExample: {
              message: 'find all permissions',
              statusCode: 200,
              status: 'Success',
              data: [
                /* permisos */
              ],
              meta: { totalData: 5 },
            },
          },
          {
            command: 'findOnePermission',
            description: 'Busca un permiso por ID. Payload: id:string.',
            payloadExample: { id: 'id-permiso' },
          },
          {
            command: 'updatePermission',
            description:
              'Actualiza un permiso. Payload: { id: string, updatePermissionDto: UpdatePermissionDto }.',
            payloadExample: {
              id: 'id',
              updatePermissionDto: {
                /* campos UpdatePermissionDto */
              },
            },
          },
          {
            command: 'removePermission',
            description: 'Elimina un permiso. Payload: id:string.',
            payloadExample: { id: 'id-permiso' },
          },
        ],
      },
    },
  })
  tcpPatternsDoc() {
    return {
      message: 'Comandos TCP disponibles en permissions',
      patterns: [
        {
          command: 'createPermission',
          description:
            'Crea un permiso. Payload: CreatePermissionDto. Devuelve objeto de creación.',
          payloadExample: {
            name: 'Crear usuario',
            description: 'Permite crear un usuario',
            action: 'create',
            type: 'role-based',
            created: '2025-08-06T12:00:00Z',
            isActive: true,
          },
          responseExample: {
            message: 'Permission created successfully',
            statusCode: 201,
            status: 'Success',
            data: {
              /* ...estructura del permiso creado... */
            },
            meta: { totalData: 1, createdAt: '2025-08-06T12:00:00Z' },
          },
        },
        {
          command: 'findAllPermissions',
          description: 'Trae todos los permisos. Payload: ninguno.',
          responseExample: {
            message: 'find all permissions',
            statusCode: 200,
            status: 'Success',
            data: [
              /* ...array de permisos... */
            ],
            meta: { totalData: 5 },
          },
        },
        {
          command: 'findOnePermission',
          description: 'Busca un permiso por ID. Payload: id:string.',
          payloadExample: { id: 'id-permiso' },
        },
        {
          command: 'updatePermission',
          description:
            'Actualiza un permiso. Payload: { id: string, updatePermissionDto: UpdatePermissionDto }.',
          payloadExample: {
            id: 'id',
            updatePermissionDto: {
              /* ...campos de actualización... */
            },
          },
        },
        {
          command: 'removePermission',
          description: 'Elimina un permiso. Payload: id:string.',
          payloadExample: { id: 'id-permiso' },
        },
      ],
    };
  }
}
