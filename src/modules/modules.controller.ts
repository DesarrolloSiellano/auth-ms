import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
  Req,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ThrottlerHybridGuard } from 'src/core/guards/throttler-hybrid.guard';
import { ModulesService } from './modules.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiExtraModels,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ValidateObjectIdGuard } from 'src/core/guards/validateObjectId.guard';

@ApiTags('modules')
@ApiExtraModels(CreateModuleDto, UpdateModuleDto)
@ApiBearerAuth()
@Controller('modules')
@UseGuards(AuthGuard('jwt'), ThrottlerHybridGuard)
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  /** La gestión de módulos es exclusiva de SuperAdmin. */
  private assertSuperAdmin(req: any): void {
    if (!req?.user?.isSuperAdmin) {
      throw new ForbiddenException(
        'Solo un SuperAdmin puede gestionar módulos',
      );
    }
  }

  /** Lectura del catálogo: admin de empresa o SuperAdmin. */
  private assertAdmin(req: any): void {
    if (!req?.user?.isAdmin && !req?.user?.isSuperAdmin) {
      throw new ForbiddenException('Se requieren permisos de administrador');
    }
  }

  @Post()
  @ApiOperation({ summary: 'Crear un módulo nuevo' })
  @ApiBody({ type: CreateModuleDto })
  @ApiResponse({
    status: 201,
    description: 'Módulo creado exitosamente',
    schema: {
      example: {
        message: 'Module created successfully',
        statusCode: 201,
        status: 'Success',
        data: {
          /* objeto module creado */
        },
        meta: {
          totalData: 1,
          createdAt: '2025-08-06T12:00:00.000Z',
          updatedAt: '2025-08-06T12:00:00.000Z',
          id: 'id-modulo',
        },
      },
    },
  })
  create(@Body() createModuleDto: CreateModuleDto, @Req() req: any) {
    this.assertSuperAdmin(req);
    return this.modulesService.create(createModuleDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los módulos' })
  @ApiResponse({
    status: 200,
    description: 'Listado de todos los módulos',
    schema: {
      example: {
        message: 'find all modules',
        statusCode: 200,
        status: 'Success',
        data: [
          /* array de módulos */
        ],
        meta: { totalData: 3 },
      },
    },
  })
  findAll(@Req() req: any) {
    this.assertAdmin(req);
    return this.modulesService.findAll();
  }

  @Get('findByPage')
  @ApiOperation({ summary: 'Obtener Módulos por página' })
  @ApiResponse({
    status: 200,
    description: 'Listado de Módulos por página',
    schema: {
      example: {
        message: 'find  modules',
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
    @Req() req?: any,
  ) {
    this.assertAdmin(req);
    const fromNumber = from !== undefined ? Number(from) : 0;
    const limiteNumber = limit !== undefined ? Number(limit) : 10;
    return this.modulesService.findByPage(fromNumber, limiteNumber, global);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un módulo por ID' })
  @ApiParam({ name: 'id', description: 'ID del módulo' })
  @ApiResponse({
    status: 200,
    description: 'Módulo encontrado',
    schema: {
      example: {
        message: 'find one module',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto módulo */
        },
        meta: { totalData: 1 },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Módulo no encontrado',
  })
  @UseGuards(ValidateObjectIdGuard)
  findOne(@Param('id') id: string, @Req() req: any) {
    this.assertAdmin(req);
    return this.modulesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar un módulo por ID' })
  @ApiParam({ name: 'id', description: 'ID del módulo a actualizar' })
  @ApiBody({ type: UpdateModuleDto })
  @ApiResponse({
    status: 200,
    description: 'Módulo actualizado exitosamente',
    schema: {
      example: {
        message: 'Module updated successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto módulo actualizado */
        },
        meta: {
          totalData: 1,
          updatedAt: '2025-08-06T12:30:00.000Z',
          id: 'id-modulo',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Módulo no encontrado',
  })
  @UseGuards(ValidateObjectIdGuard)
  update(
    @Param('id') id: string,
    @Body() updateModuleDto: UpdateModuleDto,
    @Req() req: any,
  ) {
    this.assertSuperAdmin(req);
    return this.modulesService.update(id, updateModuleDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un módulo por ID' })
  @ApiParam({ name: 'id', description: 'ID del módulo a eliminar' })
  @ApiResponse({
    status: 200,
    description: 'Módulo eliminado exitosamente',
    schema: {
      example: {
        message: 'Module deleted successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto módulo eliminado */
        },
        meta: {
          totalData: 1,
          deletedAt: '2025-08-06T13:00:00.000Z',
          id: 'id-modulo',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Módulo no encontrado',
  })
  @UseGuards(ValidateObjectIdGuard)
  remove(@Param('id') id: string, @Req() req: any) {
    this.assertSuperAdmin(req);
    return this.modulesService.remove(id);
  }

  // Métodos microservicio no documentados por Swagger

  @MessagePattern({ cmd: 'createModule' })
  msCreate(@Payload() createModuleDto: CreateModuleDto) {
    return this.modulesService.create(createModuleDto);
  }

  @MessagePattern({ cmd: 'findAllModules' })
  msFindAll() {
    return this.modulesService.findAll();
  }

  @MessagePattern({ cmd: 'findOneModule' })
  msFindOne(@Payload() payload: any) {
    const id = payload?.id ?? payload;
    return this.modulesService.findOne(id);
  }

  @MessagePattern({ cmd: 'updateModule' })
  msUpdate(
    @Payload() payload: { id: string; updateModuleDto: UpdateModuleDto },
  ) {
    return this.modulesService.update(payload.id, payload.updateModuleDto);
  }

  @MessagePattern({ cmd: 'removeModule' })
  msRemove(@Payload() payload: any) {
    const id = payload?.id ?? payload;
    return this.modulesService.remove(id);
  }
}
