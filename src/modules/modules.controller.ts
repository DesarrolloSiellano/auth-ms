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
  UnauthorizedException,
  Query,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
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
import { UserPayload } from 'src/core/interfaces/user-payload.interface';
import { ValidateObjectIdGuard } from 'src/core/guards/validateObjectId.guard';

@ApiTags('modules')
@ApiExtraModels(CreateModuleDto, UpdateModuleDto)
@ApiBearerAuth()
@Controller('modules')
@UseGuards(AuthGuard('jwt'))
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  
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
     const user = req.user as UserPayload;
    if(!user.isAdmin){
      throw new UnauthorizedException('User is not admin');
    }
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
    const user = req.user as UserPayload;
    if(!user.isAdmin){
      throw new UnauthorizedException('User is not admin');
    }
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
      @Query('filters') filters?: string,
    ) {
      
      const fromNumber = from !== undefined ? Number(from) : 0;
      const limiteNumber = limit !== undefined ? Number(limit) : 10;
      return this.modulesService.findByPage(fromNumber, limiteNumber, global, filters);
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
  findOne(@Param('id') id: string) {
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
  update(@Param('id') id: string, @Body() updateModuleDto: UpdateModuleDto) {
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
  remove(@Param('id') id: string) {
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
  msFindOne(@Payload() id: string) {
    return this.modulesService.findOne(id);
  }

  @MessagePattern({ cmd: 'updateModule' })
  msUpdate(
    @Payload() payload: { id: string; updateModuleDto: UpdateModuleDto },
  ) {
    return this.modulesService.update(payload.id, payload.updateModuleDto);
  }

  @MessagePattern({ cmd: 'removeModule' })
  msRemove(@Payload() id: string) {
    return this.modulesService.remove(id);
  }

  @Post('tcp-docs/message-patterns')
  @ApiOperation({
    summary: '[SOLO DOCUMENTACIÓN] Patrones TCP soportados por ModulesService',
    description: `
Este endpoint EXCLUSIVAMENTE documenta los comandos TCP soportados por el microservicio para integración entre servicios.  
**No enviar datos reales aquí; la comunicación real es por sockets TCP.**

Ejemplos de uso del decorador @MessagePattern en NestJS:
\`@MessagePattern({ cmd: 'createModule' })\`
  `,
  })
  @ApiResponse({
    status: 200,
    description:
      'Documentación de patrones TCP disponible en este microservicio',
    schema: {
      example: {
        message: 'Comandos TCP disponibles en modules',
        patterns: [
          {
            command: 'createModule',
            description:
              'Crea un módulo. Payload: CreateModuleDto. Devuelve objeto de creación.',
            payloadExample: {
              name: 'Módulo ejemplo',
              description: 'Módulo para pruebas',
              created: '2025-08-06T12:00:00Z',
              modified: '2025-08-06T12:00:00Z',
              isActive: true,
              isSystemModule: false,
            },
            responseExample: {
              message: 'Module created successfully',
              statusCode: 201,
              status: 'Success',
              data: {
                /* objeto módulo creado */
              },
              meta: { totalData: 1, createdAt: '2025-08-06T12:00:00Z' },
            },
          },
          {
            command: 'findAllModules',
            description: 'Trae todos los módulos. Payload: ninguno.',
            responseExample: {
              message: 'find all modules',
              statusCode: 200,
              status: 'Success',
              data: [
                /* array de módulos */
              ],
              meta: { totalData: 3 },
            },
          },
          {
            command: 'findOneModule',
            description: 'Busca un módulo por ID. Payload: id:string.',
            payloadExample: { id: 'id-modulo' },
          },
          {
            command: 'updateModule',
            description:
              'Actualiza un módulo. Payload: { id: string, updateModuleDto: UpdateModuleDto }.',
            payloadExample: {
              id: 'id-modulo',
              updateModuleDto: {
                /* campos UpdateModuleDto */
              },
            },
          },
          {
            command: 'removeModule',
            description: 'Elimina un módulo por ID. Payload: id:string.',
            payloadExample: { id: 'id-modulo' },
          },
        ],
      },
    },
  })
  tcpPatternsDoc() {
    return {
      message: 'Comandos TCP disponibles en modules',
      patterns: [
        {
          command: 'createModule',
          description:
            'Crea un módulo. Payload: CreateModuleDto. Devuelve objeto de creación.',
          payloadExample: {
            name: 'Módulo ejemplo',
            description: 'Módulo para pruebas',
            created: '2025-08-06T12:00:00Z',
            modified: '2025-08-06T12:00:00Z',
            isActive: true,
            isSystemModule: false,
          },
          responseExample: {
            message: 'Module created successfully',
            statusCode: 201,
            status: 'Success',
            data: {
              /* ...estructura del módulo creado... */
            },
            meta: { totalData: 1, createdAt: '2025-08-06T12:00:00Z' },
          },
        },
        {
          command: 'findAllModules',
          description: 'Trae todos los módulos. Payload: ninguno.',
          responseExample: {
            message: 'find all modules',
            statusCode: 200,
            status: 'Success',
            data: [
              /* ...array de módulos... */
            ],
            meta: { totalData: 3 },
          },
        },
        {
          command: 'findOneModule',
          description: 'Busca un módulo por ID. Payload: id:string.',
          payloadExample: { id: 'id-modulo' },
        },
        {
          command: 'updateModule',
          description:
            'Actualiza un módulo. Payload: { id: string, updateModuleDto: UpdateModuleDto }.',
          payloadExample: {
            id: 'id-modulo',
            updateModuleDto: {
              /* ...campos de actualización... */
            },
          },
        },
        {
          command: 'removeModule',
          description: 'Elimina un módulo por ID. Payload: id:string.',
          payloadExample: { id: 'id-modulo' },
        },
      ],
    };
  }
}


