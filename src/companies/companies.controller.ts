import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ThrottlerHybridGuard } from 'src/core/guards/throttler-hybrid.guard';
import { AuditService } from 'src/audit/audit.service';
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
@UseGuards(AuthGuard('jwt'), ThrottlerHybridGuard)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private audit(
    req: any,
    action: string,
    detail: Record<string, any>,
  ): void {
    this.auditService?.logAsync({
      action,
      category: 'config',
      status: 'success',
      userId: String(req?.user?._id || ''),
      email: req?.user?.email,
      company: req?.user?.company,
      tenantId: req?.user?.tenantId,
      ip: req?.ip,
      detail,
    });
  }

  /** La gestión de compañías es exclusiva de SuperAdmin. */
  private assertSuperAdmin(req: any): void {
    if (!req?.user?.isSuperAdmin) {
      throw new ForbiddenException(
        'Solo un SuperAdmin puede gestionar compañías',
      );
    }
  }

  /** Autocompletado de empresas para la UI: admin de empresa o SuperAdmin. */
  private assertAdmin(req: any): void {
    if (!req?.user?.isAdmin && !req?.user?.isSuperAdmin) {
      throw new ForbiddenException('Se requieren permisos de administrador');
    }
  }

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
  create(@Body() createCompanyDto: CreateCompanyDto, @Req() req: any) {
    this.assertSuperAdmin(req);
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
  findAll(@Req() req: any) {
    this.assertSuperAdmin(req);
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
    @Req() req?: any,
  ) {
    this.assertSuperAdmin(req);
    const fromNumber = from !== undefined ? Number(from) : 0;
    const limitNumber = limit !== undefined ? Number(limit) : 10;
    return this.companiesService.findByPage(fromNumber, limitNumber, global);
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
  findByAutoComplete(@Query('name') name?: string, @Req() req?: any) {
    this.assertAdmin(req);
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
  findOne(@Param('id') id: string, @Req() req: any) {
    this.assertSuperAdmin(req);
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
  update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @Req() req: any,
  ) {
    this.assertSuperAdmin(req);
    return this.companiesService.update(id, updateCompanyDto);
  }

  @Patch(':id/block')
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({
    summary: 'Bloquear una compañía (SuperAdmin)',
    description:
      'Todos los usuarios de la compañía no podrán iniciar sesión. Sin `until` = indefinido.',
  })
  async block(
    @Param('id') id: string,
    @Body() body: { reason?: string; until?: string },
    @Req() req: any,
  ) {
    this.assertSuperAdmin(req);
    const result = await this.companiesService.block(id, body || {});
    this.audit(req, 'company.blocked', { companyId: id, ...body });
    return result;
  }

  @Patch(':id/unblock')
  @UseGuards(ValidateObjectIdGuard)
  @ApiOperation({ summary: 'Desbloquear una compañía (SuperAdmin)' })
  async unblock(@Param('id') id: string, @Req() req: any) {
    this.assertSuperAdmin(req);
    const result = await this.companiesService.unblock(id);
    this.audit(req, 'company.unblocked', { companyId: id });
    return result;
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
  remove(@Param('id') id: string, @Req() req: any) {
    this.assertSuperAdmin(req);
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
  msFindOne(@Payload() payload: any) {
    const id = payload?.id ?? payload;
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
  msRemove(@Payload() payload: any) {
    const id = payload?.id ?? payload;
    return this.companiesService.remove(id);
  }

  @MessagePattern({ cmd: 'blockCompany' })
  msBlock(@Payload() payload: any) {
    return this.companiesService.block(payload?.id, {
      reason: payload?.reason,
      until: payload?.until,
    });
  }

  @MessagePattern({ cmd: 'unblockCompany' })
  msUnblock(@Payload() payload: any) {
    return this.companiesService.unblock(payload?.id);
  }
}
