import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
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

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
@UseGuards(AuthGuard('jwt'))
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // Métodos HTTP REST

  @Post()
  @ApiOperation({ summary: 'Crear una compañía nueva' })
  @ApiBody({ type: CreateCompanyDto })
  @ApiResponse({
    status: 201,
    description: 'Compañía creada exitosamente',
    schema: {
      example: {
        message: 'Company created successfully',
        statusCode: 201,
        status: 'Success',
        data: {
          /* objeto compañía creada */
        },
        meta: {
          totalData: 1,
          createdAt: '2025-09-11T14:30:00.000Z',
          updatedAt: '2025-09-11T14:30:00.000Z',
          id: 'id-compania',
        },
      },
    },
  })
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las compañías' })
  @ApiResponse({
    status: 200,
    description: 'Listado de todas las compañías',
    schema: {
      example: {
        message: 'find all companies',
        statusCode: 200,
        status: 'Success',
        data: [
          /* array de compañías */
        ],
        meta: { totalData: 5 },
      },
    },
  })
  findAll() {
    return this.companiesService.findAll();
  }

  @Get('findByPage')
  @ApiOperation({ summary: 'Obtener compañías por página' })
  @ApiResponse({
    status: 200,
    description: 'Listado de compañías por página',
    schema: {
      example: {
        message: 'find companies',
        statusCode: 200,
        status: 'Success',
        data: [
          /* array de compañías */
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
    return this.companiesService.findByPage(fromNumber, limitNumber, global, filters);
  }

  @Get('findByAutoComplete')
  @ApiOperation({ summary: 'Obtener las compañías' })
  @ApiResponse({
    status: 200,
    description: 'Listado de las compañías filtrando por nombre',
    schema: {
      example: {
        message: 'find  companies',
        statusCode: 200,
        status: 'Success',
        data: [
          /* array de compañías */
        ],
        meta: { totalData: 5 },
      },
    },
  })
  findByAutoComplete(
    @Query('name') name?: string,
  ) {
  
    
    return this.companiesService.findByAutoComplete(name);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una compañía por ID' })
  @ApiParam({ name: 'id', description: 'ID de la compañía' })
  @ApiResponse({
    status: 200,
    description: 'Compañía encontrada',
    schema: {
      example: {
        message: 'find one company',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto compañía */
        },
        meta: { totalData: 1 },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Compañía no encontrada',
  })
  @UseGuards(ValidateObjectIdGuard)
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar una compañía por ID' })
  @ApiParam({ name: 'id', description: 'ID de la compañía a actualizar' })
  @ApiBody({ type: UpdateCompanyDto })
  @ApiResponse({
    status: 200,
    description: 'Compañía actualizada exitosamente',
    schema: {
      example: {
        message: 'Company updated successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto compañía actualizado */
        },
        meta: {
          totalData: 1,
          updatedAt: '2025-09-11T15:00:00.000Z',
          id: 'id-compania',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Compañía no encontrada',
  })
  @UseGuards(ValidateObjectIdGuard)
  update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto) {
    return this.companiesService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una compañía por ID' })
  @ApiParam({ name: 'id', description: 'ID de la compañía a eliminar' })
  @ApiResponse({
    status: 200,
    description: 'Compañía eliminada exitosamente',
    schema: {
      example: {
        message: 'Company deleted successfully',
        statusCode: 200,
        status: 'Success',
        data: {
          /* objeto compañía eliminada */
        },
        meta: {
          totalData: 1,
          deletedAt: '2025-09-11T16:00:00.000Z',
          id: 'id-compania',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Compañía no encontrada',
  })
  @UseGuards(ValidateObjectIdGuard)
  remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }

  // Métodos de microservicio con MessagePattern - no documentados por Swagger

  @MessagePattern({ cmd: 'createCompany' })
  msCreate(@Payload() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @MessagePattern({ cmd: 'findAllCompanies' })
  msFindAll() {
    return this.companiesService.findAll();
  }

  @MessagePattern({ cmd: 'findOneCompany' })
  msFindOne(@Payload() id: string) {
    return this.companiesService.findOne(id);
  }

  @MessagePattern({ cmd: 'updateCompany' })
  msUpdate(
    @Payload()
    payload: {
      id: string;
      updateCompanyDto: UpdateCompanyDto;
    },
  ) {
    return this.companiesService.update(payload.id, payload.updateCompanyDto);
  }

  @MessagePattern({ cmd: 'removeCompany' })
  msRemove(@Payload() id: string) {
    return this.companiesService.remove(id);
  }

  @Post('tcp-docs/message-patterns')
  @ApiOperation({
    summary: '[SOLO DOCUMENTACIÓN] Patrones TCP soportados por CompaniesService',
    description: `
Este endpoint EXCLUSIVAMENTE documenta los comandos TCP soportados por el microservicio para integración entre servicios.  
**No enviar datos reales aquí; la comunicación real es por sockets TCP.**

Usa el decorador @MessagePattern en NestJS, ejemplo:
\`@MessagePattern({ cmd: 'createCompany' })\`
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Documentación de patrones TCP disponible en este microservicio',
    schema: {
      example: {
        message: 'Comandos TCP disponibles en companies',
        patterns: [
          {
            command: 'createCompany',
            description: 'Crea una compañía. Payload: CreateCompanyDto. Devuelve objeto de creación.',
            payloadExample: {
              name: 'Compañía Ejemplar S.A.',
              legalRepresentative: 'Juan Pérez',
              ruc: '1234567890',
              address: 'Calle 123 #45-67, Ciudad',
              phone: '+57 311 1234567',
              email: 'contacto@compania.com',
              web: 'https://www.compania.com',
              logo: 'https://www.compania.com/logo.png',
              isActive: true,
              created: '2025-09-11T14:30:00Z',
              modified: '2025-09-11T14:30:00Z',
            },
            responseExample: {
              message: 'Company created successfully',
              statusCode: 201,
              status: 'Success',
              data: {
                /* ...estructura compañía creada... */
              },
              meta: { totalData: 1, createdAt: '2025-09-11T14:30:00Z' },
            },
          },
          {
            command: 'findAllCompanies',
            description: 'Trae todas las compañías. Payload: ninguno.',
            responseExample: {
              message: 'find all companies',
              statusCode: 200,
              status: 'Success',
              data: [
                /* ...array de compañías... */
              ],
              meta: { totalData: 5 },
            },
          },
          {
            command: 'findOneCompany',
            description: 'Busca una compañía por ID. Payload: id:string.',
            payloadExample: { id: 'id-compania' },
          },
          {
            command: 'updateCompany',
            description: 'Actualiza una compañía. Payload: { id: string, updateCompanyDto: UpdateCompanyDto }.',
            payloadExample: {
              id: 'id-compania',
              updateCompanyDto: {
                /* ...campos de actualización... */
              },
            },
          },
          {
            command: 'removeCompany',
            description: 'Elimina una compañía. Payload: id:string.',
            payloadExample: { id: 'id-compania' },
          },
        ],
      },
    },
  })
  tcpPatternsDoc() {
    return {
      message: 'Comandos TCP disponibles en companies',
      patterns: [
        {
          command: 'createCompany',
          description: 'Crea una compañía. Payload: CreateCompanyDto. Devuelve objeto de creación.',
          payloadExample: {
            name: 'Compañía Ejemplar S.A.',
            legalRepresentative: 'Juan Pérez',
            ruc: '1234567890',
            address: 'Calle 123 #45-67, Ciudad',
            phone: '+57 311 1234567',
            email: 'contacto@compania.com',
            web: 'https://www.compania.com',
            logo: 'https://www.compania.com/logo.png',
            isActive: true,
            created: '2025-09-11T14:30:00Z',
            modified: '2025-09-11T14:30:00Z',
          },
          responseExample: {
            message: 'Company created successfully',
            statusCode: 201,
            status: 'Success',
            data: {
              /* ...estructura compañía creada... */
            },
            meta: { totalData: 1, createdAt: '2025-09-11T14:30:00Z' },
          },
        },
        {
          command: 'findAllCompanies',
          description: 'Trae todas las compañías. Payload: ninguno.',
          responseExample: {
            message: 'find all companies',
            statusCode: 200,
            status: 'Success',
            data: [
              /* ...array de compañías... */
            ],
            meta: { totalData: 5 },
          },
        },
        {
          command: 'findOneCompany',
          description: 'Busca una compañía por ID. Payload: id:string.',
          payloadExample: { id: 'id-compania' },
        },
        {
          command: 'updateCompany',
          description: 'Actualiza una compañía. Payload: { id: string, updateCompanyDto: UpdateCompanyDto }.',
          payloadExample: {
            id: 'id-compania',
            updateCompanyDto: {
              /* ...campos de actualización... */
            },
          },
        },
        {
          command: 'removeCompany',
          description: 'Elimina una compañía. Payload: id:string.',
          payloadExample: { id: 'id-compania' },
        },
      ],
    };
  }
}
