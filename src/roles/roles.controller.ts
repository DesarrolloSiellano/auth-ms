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
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
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

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(AuthGuard('jwt'))
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // Endpoints HTTP REST
  @Post()
  @ApiOperation({ summary: 'Crear un rol' })
  @ApiResponse({
    status: 201,
    description: 'Rol creado con éxito',
    schema: {
      example: {
        message: 'Role created successfully',
        statusCode: 201,
        status: 'Success',
        data: {
          /* objeto rol creado */
        },
        meta: {
          totalData: 1,
          createdAt: '2025-08-06T12:00:00.000Z',
          updatedAt: '2025-08-06T12:00:00.000Z',
          id: 'id-del-rol',
        },
      },
    },
  })
  @ApiBody({ type: CreateRoleDto })
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los roles' })
  @ApiResponse({
    status: 200,
    description: 'Listado de roles recuperados',
    schema: {
      example: {
        message: 'Roles retrieved successfully',
        statusCode: 200,
        status: 'Success',
        data: [
          /* array de roles */
        ],
        meta: { totalData: 5 },
      },
    },
  })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('findByPage')
  @ApiOperation({ summary: 'Obtener Roles por página' })
  @ApiResponse({
    status: 200,
    description: 'Listado de Roles por página',
    schema: {
      example: {
        message: 'find  Roles',
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
    const limitNumber = limit !== undefined ? Number(limit) : 10;
    return this.rolesService.findByPage(
      fromNumber,
      limitNumber,
      global,
      filters,
    );
  }

  @Get(':id')
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Obtener un rol por ID' })
  @ApiParam({ name: 'id', description: 'ID del rol' })
  @ApiResponse({
    status: 200,
    description: 'Rol recuperado con éxito',
    schema: {
      example: {
        message: 'Role retrieved successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto rol */
        },
        meta: { totalData: 1 },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Put(':id')
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Actualizar un rol por ID' })
  @ApiParam({ name: 'id', description: 'ID del rol a actualizar' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({
    status: 200,
    description: 'Rol actualizado con éxito',
    schema: {
      example: {
        message: 'Role updated successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto rol actualizado */
        },
        meta: {
          totalData: 1,
          updatedAt: '2025-08-06T12:30:00.000Z',
          id: 'id-del-rol',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Eliminar un rol por ID' })
  @ApiParam({ name: 'id', description: 'ID del rol a eliminar' })
  @ApiResponse({
    status: 200,
    description: 'Rol eliminado con éxito',
    schema: {
      example: {
        message: 'Role deleted successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto rol eliminado */
        },
        meta: {
          totalData: 1,
          deletedAt: '2025-08-06T13:00:00.000Z',
          id: 'id-del-rol',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }

  // Métodos para microservicio con MessagePattern

  @MessagePattern({ cmd: 'createRole' })
  msCreate(@Payload() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @MessagePattern({ cmd: 'findAllRoles' })
  msFindAll() {
    return this.rolesService.findAll();
  }

  @MessagePattern({ cmd: 'findOneRole' })
  msFindOne(@Payload() id: string) {
    return this.rolesService.findOne(id);
  }

  @MessagePattern({ cmd: 'updateRole' })
  msUpdate(@Payload() payload: { id: string; updateRoleDto: UpdateRoleDto }) {
    return this.rolesService.update(payload.id, payload.updateRoleDto);
  }

  @MessagePattern({ cmd: 'removeRole' })
  msRemove(@Payload() id: string) {
    return this.rolesService.remove(id);
  }

  @Post('tcp-docs/message-patterns')
  @ApiOperation({
    summary: '[SOLO DOCUMENTACIÓN] Patrones TCP soportados por RolesService',
    description: `
Este endpoint EXCLUSIVAMENTE documenta los comandos TCP soportados por el microservicio para integración entre servicios.  
**No enviar datos reales aquí; la comunicación real es por sockets TCP.**

Usa el decorador @MessagePattern en NestJS, ejemplo:
\`@MessagePattern({ cmd: 'createRole' })\`
  `,
  })
  @ApiResponse({
    status: 200,
    description:
      'Documentación de patrones TCP disponible en este microservicio',
    schema: {
      example: {
        message: 'Comandos TCP disponibles en roles',
        patterns: [
          {
            command: 'createRole',
            description:
              'Crea un rol. Payload: CreateRoleDto. Devuelve objeto de creación.',
            payloadExample: {
              name: 'Administrador',
              description: 'Rol con todos los permisos',
              // ...otros campos relevantes de CreateRoleDto
              isActive: true,
              created: '2025-08-06T12:00:00Z',
            },
            responseExample: {
              message: 'Role created successfully',
              statusCode: 201,
              status: 'Success',
              data: {
                /* objeto rol creado */
              },
              meta: { totalData: 1, createdAt: '2025-08-06T12:00:00Z' },
            },
          },
          {
            command: 'findAllRoles',
            description: 'Trae todos los roles. Payload: ninguno.',
            responseExample: {
              message: 'find all roles',
              statusCode: 200,
              status: 'Success',
              data: [
                /* ...array de roles... */
              ],
              meta: { totalData: 5 },
            },
          },
          {
            command: 'findOneRole',
            description: 'Busca un rol por ID. Payload: id:string.',
            payloadExample: { id: 'id-rol' },
          },
          {
            command: 'updateRole',
            description:
              'Actualiza un rol. Payload: { id: string, updateRoleDto: UpdateRoleDto }.',
            payloadExample: {
              id: 'id',
              updateRoleDto: {
                /* ...campos de actualización... */
              },
            },
          },
          {
            command: 'removeRole',
            description: 'Elimina un rol. Payload: id:string.',
            payloadExample: { id: 'id-rol' },
          },
        ],
      },
    },
  })
  tcpPatternsDoc() {
    return {
      message: 'Comandos TCP disponibles en roles',
      patterns: [
        {
          command: 'createRole',
          description:
            'Crea un rol. Payload: CreateRoleDto. Devuelve objeto de creación.',
          payloadExample: {
            name: 'Administrador',
            description: 'Rol con todos los permisos',
            isActive: true,
            created: '2025-08-06T12:00:00Z',
          },
          responseExample: {
            message: 'Role created successfully',
            statusCode: 201,
            status: 'Success',
            data: {
              /* ...estructura del rol creado... */
            },
            meta: { totalData: 1, createdAt: '2025-08-06T12:00:00Z' },
          },
        },
        {
          command: 'findAllRoles',
          description: 'Trae todos los roles. Payload: ninguno.',
          responseExample: {
            message: 'find all roles',
            statusCode: 200,
            status: 'Success',
            data: [
              /* ...array de roles... */
            ],
            meta: { totalData: 5 },
          },
        },
        {
          command: 'findOneRole',
          description: 'Busca un rol por ID. Payload: id:string.',
          payloadExample: { id: 'id-rol' },
        },
        {
          command: 'updateRole',
          description:
            'Actualiza un rol. Payload: { id: string, updateRoleDto: UpdateRoleDto }.',
          payloadExample: {
            id: 'id',
            updateRoleDto: {
              /* ...campos de actualización... */
            },
          },
        },
        {
          command: 'removeRole',
          description: 'Elimina un rol. Payload: id:string.',
          payloadExample: { id: 'id-rol' },
        },
      ],
    };
  }
}
