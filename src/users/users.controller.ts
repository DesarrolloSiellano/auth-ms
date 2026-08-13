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
  UnauthorizedException,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ThrottlerHybridGuard } from 'src/core/guards/throttler-hybrid.guard';
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
import { ServiceOrJwtGuard } from 'src/core/guards/service-or-jwt.guard';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(ThrottlerHybridGuard)
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
  create(@Body() createUserDto: CreateUserDto, @Req() req: any) {
    const user = req.user;
    if (!user.isAdmin) {
      throw new UnauthorizedException('No tienes permiso para crear usuarios');
    }
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
  findAll(@Req() req: any) {
    const user = req.user;
    return this.usersService.findAll(user);
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
  ) {
    const user = req.user;
    const fromNumber = from !== undefined ? Number(from) : 0;
    const limiteNumber = limit !== undefined ? Number(limit) : 10;
    return this.usersService.findByPage(user, fromNumber, limiteNumber, global);
  }

  @Get('findByTenant')
  @UseGuards(ServiceOrJwtGuard)
  @ApiOperation({
    summary: 'Obtener usuarios y agentes activos por tenant/empresa',
    description:
      'Acepta JWT de usuario (Bearer) O clave de servicio. Para llamadas de servicio envía ' +
      'header x-service-key (SERVICE_API_KEY) y x-company-id / x-tenant-id (obligatorios para acotar el tenant).',
  })
  @ApiQuery({
    name: 'onlyAgents',
    required: false,
    type: Boolean,
    description: 'Si es true, filtra solo los usuarios que son agentes activos (codeRol: AGE)',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de usuarios/agentes activos por tenant',
    schema: {
      example: {
        message: 'Active users retrieved by tenant successfully',
        statusCode: 200,
        status: 'Success',
        data: [],
        meta: { totalData: 0 },
      },
    },
  })
  findByTenant(@Req() req: any, @Query('onlyAgents') onlyAgents?: string) {
    const user = req.user;
    if (user?.isService && !user.company && !user.tenantId) {
      throw new UnauthorizedException(
        'Para llamadas de servicio, envía los headers x-company-id / x-tenant-id',
      );
    }
    return this.usersService.findActiveByTenant(user, onlyAgents);
  }

  @Get('profile')
  @UseGuards(ServiceOrJwtGuard)
  @ApiOperation({
    summary: 'Obtener el perfil completo del usuario autenticado',
    description:
      'Recibe el JWT ligero en Authorization: Bearer y devuelve en el cuerpo de la ' +
      'respuesta la identidad junto al árbol completo de modules, roles y permissions. ' +
      'Este endpoint reemplaza la necesidad de incrustar autorización en el token. ' +
      'Para llamadas de servicio: header x-service-key (SERVICE_API_KEY) + x-user-id o query param userId.',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil del usuario con modules/roles/permissions',
    schema: {
      example: {
        message: 'Profile retrieved successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          user: {
            _id: 'id-usuario',
            name: 'Juan',
            lastName: 'Pérez',
            email: 'juan@mail.com',
            username: 'juanp',
            phone: '+573001234567',
            company: 'EmpresaX',
            tenantId: '000000',
            isActived: true,
            isAdmin: true,
            isSuperAdmin: false,
            isNewUser: false,
          },
          modules: [
            {
              _id: 'id-modulo',
              name: 'adminUserModule',
              description: 'Module for admin user functionalities',
              isActive: true,
              isSystemModule: true,
              routes: [
                {
                  name: 'Pages',
                  path: '/pages',
                  initPath: '/pages/dashboard',
                  icon: 'layout',
                  isActive: true,
                  children: [
                    {
                      name: 'Dashboard',
                      path: '/pages/dashboard',
                      icon: 'home',
                      isActive: true,
                    },
                  ],
                },
              ],
            },
          ],
          roles: [
            {
              name: 'Administrador',
              codeRol: 'ADM',
              description: 'Acceso completo al sistema',
              isActive: true,
              isInheritPermissions: false,
              permissions: [
                {
                  name: 'Crear',
                  description: 'Permite registrar nuevos datos',
                  action: 'create',
                  isActive: true,
                },
              ],
            },
          ],
          permissions: [
            {
              name: 'Crear',
              description: 'Permite registrar nuevos datos en el sistema',
              action: 'create',
              isActive: true,
            },
          ],
        },
        meta: { totalData: 1, id: 'id-usuario' },
      },
    },
  })
  profile(@Req() req: any, @Query('userId') userId?: string) {
    return this.usersService.getProfile(this.resolveProfileId(req, userId));
  }

  @Get('profile/modules')
  @UseGuards(ServiceOrJwtGuard)
  @ApiOperation({
    summary: 'Obtener el árbol de módulos del usuario autenticado',
    description:
      'Acepta JWT (Bearer) o servicio (x-service-key + x-user-id o ?userId=).',
  })
  @ApiResponse({
    status: 200,
    description: 'Módulos con sus rutas, hijos e íconos',
    schema: {
      example: {
        message: 'Modules retrieved successfully',
        statusCode: 200,
        status: 'Success',
        data: [
          {
            _id: 'id-modulo',
            name: 'adminUserModule',
            description: 'Module for admin user functionalities',
            isActive: true,
            isSystemModule: true,
            routes: [],
          },
        ],
        meta: { totalData: 1, id: 'id-usuario' },
      },
    },
  })
  profileModules(@Req() req: any, @Query('userId') userId?: string) {
    return this.usersService.getUserModules(this.resolveProfileId(req, userId));
  }

  @Get('profile/roles')
  @UseGuards(ServiceOrJwtGuard)
  @ApiOperation({
    summary: 'Obtener los roles del usuario autenticado',
    description:
      'Acepta JWT (Bearer) o servicio (x-service-key + x-user-id o ?userId=).',
  })
  @ApiResponse({
    status: 200,
    description: 'Roles completos con permisos embebidos',
    schema: {
      example: {
        message: 'Roles retrieved successfully',
        statusCode: 200,
        status: 'Success',
        data: [
          {
            name: 'Administrador',
            codeRol: 'ADM',
            description: 'Acceso completo al sistema',
            isActive: true,
            isInheritPermissions: false,
            permissions: [],
          },
        ],
        meta: { totalData: 1, id: 'id-usuario' },
      },
    },
  })
  profileRoles(@Req() req: any, @Query('userId') userId?: string) {
    return this.usersService.getUserRoles(this.resolveProfileId(req, userId));
  }

  @Get('profile/permissions')
  @UseGuards(ServiceOrJwtGuard)
  @ApiOperation({
    summary: 'Obtener los permisos del usuario autenticado',
    description:
      'Acepta JWT (Bearer) o servicio (x-service-key + x-user-id o ?userId=).',
  })
  @ApiResponse({
    status: 200,
    description: 'Permisos completos',
    schema: {
      example: {
        message: 'Permissions retrieved successfully',
        statusCode: 200,
        status: 'Success',
        data: [
          {
            name: 'Crear',
            description: 'Permite registrar nuevos datos en el sistema',
            action: 'create',
            isActive: true,
          },
        ],
        meta: { totalData: 1, id: 'id-usuario' },
      },
    },
  })
  profilePermissions(@Req() req: any, @Query('userId') userId?: string) {
    return this.usersService.getUserPermissions(
      this.resolveProfileId(req, userId),
    );
  }

  private resolveProfileId(req: any, userId?: string) {
    if (req.user?.isService) {
      const target = req.headers?.['x-user-id'] || userId;
      if (!target) {
        throw new UnauthorizedException(
          'Para llamadas de servicio, envía x-user-id o el query param userId',
        );
      }
      return { _id: target };
    }
    return req.user;
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
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const user = req.user;
    return this.usersService.findByDate(user, startDate, endDate);
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
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: any,
  ) {
    const user = req.user;
    if (!user.isAdmin) {
      throw new UnauthorizedException('No tienes permiso para crear usuarios');
    }
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
  remove(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    if (!user.isAdmin) {
      throw new UnauthorizedException('No tienes permiso para crear usuarios');
    }
    return this.usersService.remove(id);
  }

  // Métodos para microservicio con MessagePattern (no documentados en Swagger)

  @MessagePattern({ cmd: 'createExternalUser' })
  msCreateExternal(@Payload() payload: any) {
    return this.usersService.createExternal(payload);
  }

  @MessagePattern({ cmd: 'createUser' })
  msCreate(@Payload() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @MessagePattern({ cmd: 'findAllUsers' })
  msFindAll(@Payload() payload: any) {
    const user = payload?.user;
    return this.usersService.findAll(user);
  }

  @MessagePattern({ cmd: 'findUsersByTenant' })
  msFindByTenant(@Payload() payload: any) {
    const user = payload?.user || payload;
    const onlyAgents = payload?.onlyAgents !== undefined ? payload.onlyAgents : false;
    return this.usersService.findActiveByTenant(user, onlyAgents);
  }

  @MessagePattern({ cmd: 'findUsersByPagination' })
  msFindByPagination(@Payload() payload: any) {
    const user = payload?.user;
    const page = payload?.page || 1;
    const limit = payload?.limit || 10;
    return this.usersService.findByPagination(user, page, limit);
  }

  @MessagePattern({ cmd: 'findUserById' })
  msFindById(@Payload() payload: any) {
    const id = payload?.id ?? payload;
    return this.usersService.findOne(id);
  }

  @MessagePattern({ cmd: 'getUserProfile' })
  msGetUserProfile(@Payload() payload: any) {
    return this.usersService.getProfile(payload);
  }

  @MessagePattern({ cmd: 'findUsersByDate' })
  msFindByDate(@Payload() payload: any) {
    const user = payload?.user;
    const { startDate, endDate } = payload;
    return this.usersService.findByDate(user, startDate, endDate);
  }

  @MessagePattern({ cmd: 'updateUser' })
  msUpdate(@Payload() payload: { id: string; updateUserDto: UpdateUserDto }) {
    return this.usersService.update(payload.id, payload.updateUserDto);
  }

  @MessagePattern({ cmd: 'removeUser' })
  msRemove(@Payload() payload: any) {
    const id = payload?.id ?? payload;
    return this.usersService.remove(id);
  }

  @Post('tcp-docs/message-patterns')
  @ApiOperation({
    summary: '[SOLO DOCUMENTACIÓN] Patrones TCP soportados por UsersService',
    description: `
Este endpoint EXCLUSIVAMENTE documenta los comandos TCP soportados por el microservicio para integración entre servicios.  
**No enviar datos reales aquí; la comunicación real es por sockets TCP.**

**Autenticación entre servicios (obligatoria):** todo payload TCP debe incluir
\`serviceKey\` con el valor de \`SERVICE_API_KEY\`. Los handlers que antes recibían
una primitiva (\`id\`) ahora reciben \`{ serviceKey, id }\`.

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
