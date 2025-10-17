import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  Put,
  Req,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ValidateObjectIdGuard } from 'src/core/guards/validateObjectId.guard';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Crear un usuario nuevo' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado exitosamente',
    schema: {
      example: {
        message: 'User created successfully',
        statusCode: 201,
        status: 'Success',
        data: {
          /* objeto usuario creado */
        },
        meta: {
          totalData: 1,
          createdAt: '2025-08-06T12:00:00.000Z',
          id: 'id-usuario',
        },
      },
    },
  })
  create(@Body() createUserDto: CreateUserDto) { 
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener todos los usuarios' })
  @ApiResponse({
    status: 200,
    description: 'Listado de usuarios',
    schema: {
      example: {
        message: 'Users retrieved successfully',
        statusCode: 200,
        status: 'Success',
        data: [
          /* array de usuarios */
        ],
        meta: { totalData: 10 },
      },
    },
  })
  findAll() {
    return this.usersService.findAll();
  }

  @Get('findByPage')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener Usuario por página' })
  @ApiResponse({
    status: 200,
    description: 'Listado de Usuarios por página',
    schema: {
      example: {
        message: 'find  Usuarios',
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
    @Req() req: any,
    @Query('company') company?: string,
    @Query('from') from?: number,
    @Query('limit') limit?: number,
    @Query('global') global?: string,
    @Query('filters') filters?: string,

  ) {
    const user = req.user
    const fromNumber = from !== undefined ? Number(from) : 0;
    const limiteNumber = limit !== undefined ? Number(limit) : 10;
    return this.usersService.findByPage(
      user,
      fromNumber,
      limiteNumber,
      global,
      filters,
    );
  }


  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Obtener un usuario por ID' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiResponse({
    status: 200,
    description: 'Usuario encontrado',
    schema: {
      example: {
        message: 'User retrieved successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto usuario */
        },
        meta: { totalData: 1 },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  findById(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get('findByDate')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener usuarios filtrados por rango de fecha' })
  @ApiQuery({
    name: 'startDate',
    required: true,
    type: String,
    description: 'Fecha inicial (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: 'Fecha final (ISO 8601)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuarios filtrados por fecha',
    schema: {
      example: {
        message: 'Users retrieved by date range successfully',
        statusCode: 200,
        status: 'Success',
        data: [
          /* array de usuarios filtrados */
        ],
        meta: {
          totalData: 5,
          startDate: '2025-08-01T00:00:00.000Z',
          endDate: '2025-08-31T23:59:59.999Z',
        },
      },
    },
  })
  findByDate(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.usersService.findByDate(startDate, endDate);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Actualizar un usuario por ID' })
  @ApiParam({ name: 'id', description: 'ID del usuario a actualizar' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: 'Usuario actualizado exitosamente',
    schema: {
      example: {
        message: 'User updated successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto usuario actualizado */
        },
        meta: {
          totalData: 1,
          updatedAt: '2025-08-06T13:00:00.000Z',
          id: 'id-usuario',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Eliminar un usuario por ID' })
  @ApiParam({ name: 'id', description: 'ID del usuario a eliminar' })
  @ApiResponse({
    status: 200,
    description: 'Usuario eliminado exitosamente',
    schema: {
      example: {
        message: 'User deleted successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto usuario eliminado */
        },
        meta: {
          totalData: 1,
          deletedAt: '2025-08-06T14:00:00.000Z',
          id: 'id-usuario',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  // Métodos para microservicio con MessagePattern (no documentados en Swagger)

  @MessagePattern({ cmd: 'createUser' })
  msCreate(@Payload() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto, true);
  }

  @MessagePattern({ cmd: 'findAllUsers' })
  msFindAll() {
    return this.usersService.findAll();
  }

  @MessagePattern({ cmd: 'findUsersByPagination' })
  msFindByPagination() {
    return this.usersService.findByPagination();
  }

  @MessagePattern({ cmd: 'findUserById' })
  msFindById(@Payload() id: string) {
    return this.usersService.findOne(id);
  }

  @MessagePattern({ cmd: 'findUsersByDate' })
  msFindByDate() {
    return this.usersService.findAll(); // Ajustar si implementas filtro en microservicio
  }

  @MessagePattern({ cmd: 'updateUser' })
  msUpdate(@Payload() payload: { id: string; updateUserDto: UpdateUserDto }) {
    return this.usersService.update(payload.id, payload.updateUserDto);
  }

  @MessagePattern({ cmd: 'removeUser' })
  msRemove(@Payload() id: string) {
    return this.usersService.remove(id);
  }

  @Post('tcp-docs/message-patterns')
  @ApiOperation({
    summary: '[SOLO DOCUMENTACIÓN] Patrones TCP soportados por UsersService',
    description: `
Este endpoint EXCLUSIVAMENTE documenta los comandos TCP soportados por el microservicio para integración entre servicios.  
**No enviar datos reales aquí; la comunicación real es por sockets TCP.**

Ejemplos de uso:
\`@MessagePattern({ cmd: 'createUser' })\`
  `,
  })
  @ApiResponse({
    status: 200,
    description:
      'Documentación de patrones TCP disponible en este microservicio',
    schema: {
      example: {
        message: 'Comandos TCP disponibles en users',
        patterns: [
          {
            command: 'createUser',
            description:
              'Crea un usuario. Payload: CreateUserDto. Devuelve objeto de creación.',
            payloadExample: {
              name: 'Juan',
              lastName: 'Perez',
              email: 'juan@mail.com',
              username: 'juanp',
              password: 'password123',
              isActived: true,
              isAdmin: false,
              isNewUser: true,
              company: 'EmpresaX',
              phone: '+573001234567',
            },
            responseExample: {
              message: 'User created successfully',
              statusCode: 201,
              status: 'Success',
              data: {
                /* objeto usuario creado */
              },
              meta: { totalData: 1, createdAt: '2025-08-06T12:00:00Z' },
            },
          },
          {
            command: 'findAllUsers',
            description: 'Trae todos los usuarios. Payload: ninguno.',
            responseExample: {
              message: 'Users retrieved successfully',
              statusCode: 200,
              status: 'Success',
              data: [
                /* array de usuarios */
              ],
              meta: { totalData: 10 },
            },
          },
          {
            command: 'findUsersByPagination',
            description:
              'Trae usuarios paginados. Payload: { page: number, limit: number }.',
            payloadExample: {
              page: 1,
              limit: 10,
            },
          },
          {
            command: 'findUserById',
            description: 'Busca un usuario por ID. Payload: id:string.',
            payloadExample: { id: 'id-usuario' },
          },
          {
            command: 'findUsersByDate',
            description:
              'Busca usuarios por rango de fechas. Payload: { startDate: string, endDate: string }.',
            payloadExample: {
              startDate: '2025-08-01T00:00:00Z',
              endDate: '2025-08-31T23:59:59Z',
            },
          },
          {
            command: 'updateUser',
            description:
              'Actualiza un usuario. Payload: { id: string, updateUserDto: UpdateUserDto }.',
            payloadExample: {
              id: 'id',
              updateUserDto: {
                /* campos actualización */
              },
            },
          },
          {
            command: 'removeUser',
            description: 'Elimina un usuario. Payload: id:string.',
            payloadExample: { id: 'id-usuario' },
          },
        ],
      },
    },
  })
  tcpPatternsDoc() {
    return {
      message: 'Comandos TCP disponibles en users',
      patterns: [
        {
          command: 'createUser',
          description:
            'Crea un usuario. Payload: CreateUserDto. Devuelve objeto de creación.',
          payloadExample: {
            name: 'Juan',
            lastName: 'Perez',
            email: 'juan@mail.com',
            username: 'juanp',
            password: 'password123',
            isActived: true,
            isAdmin: false,
            isNewUser: true,
            company: 'EmpresaX',
            phone: '+573001234567',
          },
          responseExample: {
            message: 'User created successfully',
            statusCode: 201,
            status: 'Success',
            data: {
              /* objeto usuario creado */
            },
            meta: { totalData: 1, createdAt: '2025-08-06T12:00:00Z' },
          },
        },
        {
          command: 'findAllUsers',
          description: 'Trae todos los usuarios. Payload: ninguno.',
          responseExample: {
            message: 'Users retrieved successfully',
            statusCode: 200,
            status: 'Success',
            data: [
              /* ...array de usuarios... */
            ],
            meta: { totalData: 10 },
          },
        },
        {
          command: 'findUsersByPagination',
          description:
            'Trae usuarios paginados. Payload: { page: number, limit: number }.',
          payloadExample: {
            page: 1,
            limit: 10,
          },
        },
        {
          command: 'findUserById',
          description: 'Busca un usuario por ID. Payload: id:string.',
          payloadExample: { id: 'id-usuario' },
        },
        {
          command: 'findUsersByDate',
          description:
            'Busca usuarios por rango de fechas. Payload: { startDate: string, endDate: string }.',
          payloadExample: {
            startDate: '2025-08-01T00:00:00Z',
            endDate: '2025-08-31T23:59:59Z',
          },
        },
        {
          command: 'updateUser',
          description:
            'Actualiza un usuario. Payload: { id: string, updateUserDto: UpdateUserDto }.',
          payloadExample: {
            id: 'id',
            updateUserDto: {
              /* ...campos actualización... */
            },
          },
        },
        {
          command: 'removeUser',
          description: 'Elimina un usuario. Payload: id:string.',
          payloadExample: { id: 'id-usuario' },
          
        },
      ],
    };
  }
}
