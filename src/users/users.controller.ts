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
  ForbiddenException,
  Optional,
  Patch,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ThrottlerHybridGuard } from 'src/core/guards/throttler-hybrid.guard';
import { UsersService } from './users.service';
import { UserAdminService, BulkAction } from './user-admin.service';
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
import { resolveRequestOrigin } from 'src/core/helpers/app-url.helper';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(ThrottlerHybridGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @Optional() private readonly userAdminService?: UserAdminService,
  ) {}

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
    if (!user.isAdmin && !user.isSuperAdmin) {
      throw new UnauthorizedException('No tienes permiso para crear usuarios');
    }
    // Solo un SuperAdmin puede crear usuarios SuperAdmin.
    if (createUserDto.isSuperAdmin && !user.isSuperAdmin) {
      throw new ForbiddenException(
        'Solo un SuperAdmin puede crear usuarios SuperAdmin',
      );
    }
    // Aislamiento multi-tenant: un usuario de empresa solo crea en SU empresa.
    if (!user.isSuperAdmin) {
      if (createUserDto.company && createUserDto.company !== user.company) {
        throw new ForbiddenException(
          'No puedes crear usuarios para otra empresa',
        );
      }
      createUserDto.company = user.company;
      (createUserDto as any).tenantId = user.tenantId || user.company;
    }
    // El enlace del correo usa el origen real del front que origina la petición.
    const origin = resolveRequestOrigin(req);
    const provided = createUserDto.redirectUri;
    createUserDto.redirectUri =
      origin ||
      (provided && provided !== 'null' && provided !== 'undefined'
        ? provided
        : undefined);
    return this.usersService.create(createUserDto, user);
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
    @Query('filters') filters?: string,
  ) {
    const user = req.user;
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

  @Get('check-availability')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Verifica si un correo o un nombre de usuario ya está registrado',
    description:
      'Devuelve emailExists y usernameExists (unicidad global). Acepta excludeId ' +
      'para omitir al propio usuario en edición.',
  })
  @ApiQuery({ name: 'email', required: false, type: String })
  @ApiQuery({ name: 'username', required: false, type: String })
  @ApiQuery({ name: 'excludeId', required: false, type: String })
  checkAvailability(
    @Req() req: any,
    @Query('email') email?: string,
    @Query('username') username?: string,
    @Query('excludeId') excludeId?: string,
  ) {
    // Anti-enumeración: solo administradores pueden consultar existencia global.
    if (!req?.user?.isAdmin && !req?.user?.isSuperAdmin) {
      throw new ForbiddenException('Se requieren permisos de administrador');
    }
    return this.usersService.checkAvailability({ email, username, excludeId });
  }

  @Get('export-data')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Datos de la lista filtrada (JSON, para PDF en el navegador)',
  })
  exportData(@Req() req: any, @Query() query: any) {
    const filters = { ...(query || {}) };
    const limit = filters.limit !== undefined ? Number(filters.limit) : undefined;
    delete filters.format;
    delete filters.from;
    delete filters.limit;
    return this.userAdminService!.exportData(req.user, filters, limit);
  }

  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Exporta la lista filtrada en streaming (xlsx/csv)' })
  async export(
    @Req() req: any,
    @Query() query: any,
    @Query('format') format: 'xlsx' | 'csv',
    @Res() res: Response,
  ) {
    const filters = { ...(query || {}) };
    delete filters.format;
    delete filters.from;
    delete filters.limit;
    await this.userAdminService!.exportStream(
      req.user,
      filters,
      format || 'xlsx',
      res,
    );
  }

  @Get('saved-filters')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Lista las búsquedas guardadas del usuario/empresa' })
  listSavedFilters(@Req() req: any) {
    return this.userAdminService!.listSavedFilters(req.user);
  }

  @Post('saved-filters')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Guarda una búsqueda de usuarios' })
  createSavedFilter(@Req() req: any, @Body() body: any) {
    return this.userAdminService!.createSavedFilter(req.user, body || {});
  }

  @Delete('saved-filters/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Elimina una búsqueda guardada' })
  deleteSavedFilter(@Param('id') id: string, @Req() req: any) {
    return this.userAdminService!.deleteSavedFilter(id, req.user);
  }

  @Post('bulk')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Acciones masivas sobre usuarios' })
  bulk(
    @Req() req: any,
    @Body() body: { action: BulkAction; ids: string[]; payload?: any },
  ) {
    return this.userAdminService!.bulkAction(
      req.user,
      body?.action,
      body?.ids || [],
      body?.payload || {},
    );
  }

  @Post(':id/resend-invite')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Reenvía invitación/activación a un usuario' })
  resendInvite(@Param('id') id: string, @Req() req: any) {
    return this.userAdminService!.resendInvite(
      id,
      req.user,
      resolveRequestOrigin(req),
    );
  }

  @Patch(':id/block')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Bloquea temporalmente a un usuario' })
  block(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.userAdminService!.block(id, req.user, body || {});
  }

  @Patch(':id/unblock')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Desbloquea a un usuario' })
  unblock(@Param('id') id: string, @Req() req: any) {
    return this.userAdminService!.unblock(id, req.user);
  }

  @Patch(':id/tags')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Actualiza etiquetas/grupos de un usuario' })
  setTags(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.userAdminService!.setTagsGroups(id, req.user, body || {});
  }

  @Get('custom-fields')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Lista los campos personalizados de la empresa' })
  listCustomFields(@Req() req: any, @Query('company') company?: string) {
    return this.userAdminService!.listCustomFields(req.user, company);
  }

  @Post('custom-fields')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Crea un campo personalizado (SuperAdmin)' })
  createCustomField(@Req() req: any, @Body() body: any) {
    return this.userAdminService!.createCustomField(req.user, body || {});
  }

  @Put('custom-fields/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Actualiza un campo personalizado (SuperAdmin)' })
  updateCustomField(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.userAdminService!.updateCustomField(id, req.user, body || {});
  }

  @Delete('custom-fields/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Elimina un campo personalizado (SuperAdmin)' })
  deleteCustomField(@Param('id') id: string, @Req() req: any) {
    return this.userAdminService!.deleteCustomField(id, req.user);
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
    if (!user.isAdmin && !user.isSuperAdmin) {
      throw new UnauthorizedException('No tienes permiso para actualizar usuarios');
    }
    // La restricción de `isAdmin`/`permissions`/`modules` (A2b) se aplica en el servicio.
    return this.usersService.update(id, updateUserDto, user);
  }

  @Delete(':id/hard')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Eliminar definitivamente un usuario (SuperAdmin)' })
  @ApiParam({ name: 'id', description: 'ID del usuario a eliminar' })
  async hardRemove(@Param('id') id: string, @Req() req: any) {
    const data = await this.userAdminService!.hardRemove(id, req.user);
    return { message: 'Usuario eliminado definitivamente', data };
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Eliminar (soft) un usuario por ID' })
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
  async remove(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    if (!user.isAdmin && !user.isSuperAdmin) {
      throw new UnauthorizedException('No tienes permiso para eliminar usuarios');
    }
    const data = await this.userAdminService!.softRemove(id, user);
    return { message: 'Usuario eliminado correctamente', data };
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

  private serviceRequester(payload: any) {
    return {
      isService: true,
      isAdmin: true,
      isSuperAdmin: false,
      company: payload?.company || payload?.tenantId,
      tenantId: payload?.tenantId || payload?.company,
      _id: payload?.userId,
    };
  }

  @MessagePattern({ cmd: 'removeUser' })
  msRemove(@Payload() payload: any) {
    const id = payload?.id ?? payload;
    return this.userAdminService!.softRemove(id, this.serviceRequester(payload));
  }

  @MessagePattern({ cmd: 'softRemoveUser' })
  msSoftRemove(@Payload() payload: any) {
    const id = payload?.id ?? payload;
    return this.userAdminService!.softRemove(id, this.serviceRequester(payload));
  }

  @MessagePattern({ cmd: 'hardRemoveUser' })
  msHardRemove(@Payload() payload: any) {
    const id = payload?.id ?? payload;
    return this.userAdminService!.hardRemove(id, this.serviceRequester(payload));
  }
}
