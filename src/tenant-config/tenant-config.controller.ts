import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

import { ThrottlerHybridGuard } from 'src/core/guards/throttler-hybrid.guard';
import { ServiceOrJwtGuard } from 'src/core/guards/service-or-jwt.guard';
import { AuditService } from 'src/audit/audit.service';
import { TenantConfigService } from './tenant-config.service';
import {
  CreatePolicyDefinitionDto,
  UpdatePolicyDefinitionDto,
} from './dto/policy-definition.dto';
import {
  PatchTenantConfigValuesDto,
  ReportTenantUsageDto,
} from './dto/tenant-config.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(ThrottlerHybridGuard)
export class TenantConfigController {
  constructor(
    private readonly tenantConfigService: TenantConfigService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private assertSuperAdmin(req: any): void {
    if (!req?.user?.isSuperAdmin) {
      throw new ForbiddenException(
        'Solo un SuperAdmin puede administrar la configuración de tenants',
      );
    }
  }

  private audit(
    req: any,
    action: string,
    category: 'config' | 'policy',
    detail: Record<string, any>,
  ): void {
    this.auditService?.logAsync({
      action,
      category,
      status: 'success',
      userId: String(req?.user?._id || ''),
      email: req?.user?.email,
      company: req?.user?.company,
      tenantId: req?.user?.tenantId,
      ip: req?.ip,
      detail,
    });
  }

  // ------------------------------------------------------------- Catalog

  @Get('policy-catalog')
  @UseGuards(ServiceOrJwtGuard)
  @ApiOperation({ summary: 'Obtiene el catálogo de políticas' })
  @ApiQuery({ name: 'all', required: false, type: Boolean })
  getCatalog(@Query('all') all?: string) {
    const onlyActive = String(all).toLowerCase() !== 'true';
    return this.tenantConfigService.getCatalog(onlyActive);
  }

  @Post('policy-definitions')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Crea una definición de política (SuperAdmin)' })
  async createDefinition(
    @Body() dto: CreatePolicyDefinitionDto,
    @Req() req: any,
  ) {
    this.assertSuperAdmin(req);
    const result = await this.tenantConfigService.createDefinition(dto);
    this.audit(req, 'policy.created', 'policy', { key: dto.key });
    return result;
  }

  @Put('policy-definitions/:key')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Actualiza una definición de política (SuperAdmin)' })
  async updateDefinition(
    @Param('key') key: string,
    @Body() dto: UpdatePolicyDefinitionDto,
    @Req() req: any,
  ) {
    this.assertSuperAdmin(req);
    const result = await this.tenantConfigService.updateDefinition(key, dto);
    this.audit(req, 'policy.updated', 'policy', {
      key,
      fields: Object.keys(dto || {}),
    });
    return result;
  }

  @Delete('policy-definitions/:key')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Elimina una definición de política (SuperAdmin)' })
  async removeDefinition(@Param('key') key: string, @Req() req: any) {
    this.assertSuperAdmin(req);
    const result = await this.tenantConfigService.removeDefinition(key);
    this.audit(req, 'policy.removed', 'policy', { key });
    return result;
  }

  // -------------------------------------------------------- Tenant config

  @Get('config')
  @UseGuards(ServiceOrJwtGuard)
  @ApiOperation({
    summary: 'Obtiene la configuración resuelta de un tenant',
    description:
      'Acepta JWT o service-key (con x-tenant-id / x-company-id). ' +
      'Indica ?tenantId= o ?company=.',
  })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiQuery({ name: 'company', required: false, type: String })
  getConfig(
    @Query('tenantId') tenantId?: string,
    @Query('company') company?: string,
    @Req() req?: any,
  ) {
    const isSuper = req?.user?.isSuperAdmin === true;
    const isService = req?.user?.isService === true;
    // Un usuario normal solo puede ver la config de su propia compañía.
    if (req?.user && !isSuper && !isService) {
      return this.tenantConfigService.resolveConfig(
        req.user.tenantId,
        req.user.company,
      );
    }
    const finalTenant =
      tenantId || req?.user?.tenantId || req?.user?.company || undefined;
    const finalCompany =
      company || req?.user?.company || req?.user?.tenantId || undefined;
    return this.tenantConfigService.resolveConfig(finalTenant, finalCompany);
  }

  @Get('config/:tenantId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtiene la configuración de un tenant (SuperAdmin)' })
  getConfigByTenant(@Param('tenantId') tenantId: string, @Req() req: any) {
    this.assertSuperAdmin(req);
    return this.tenantConfigService.getConfigByTenant(tenantId);
  }

  @Put('config/:tenantId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Crea/actualiza la configuración de un tenant (SuperAdmin)' })
  async upsertConfig(
    @Param('tenantId') tenantId: string,
    @Body()
    body: { company?: string; isActive?: boolean; values?: Record<string, any> },
    @Req() req: any,
  ) {
    this.assertSuperAdmin(req);
    const result = await this.tenantConfigService.upsertConfig({
      tenantId,
      company: body?.company,
      isActive: body?.isActive,
      values: body?.values,
    });
    this.audit(req, 'config.updated', 'config', {
      tenantId,
      keys: Object.keys(body?.values || {}),
    });
    return result;
  }

  @Patch('config/:tenantId/values')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Actualiza valores de políticas (SuperAdmin)' })
  async patchValues(
    @Param('tenantId') tenantId: string,
    @Body() dto: PatchTenantConfigValuesDto,
    @Req() req: any,
  ) {
    this.assertSuperAdmin(req);
    const result = await this.tenantConfigService.patchValues(tenantId, dto);
    this.audit(req, 'config.patched', 'config', {
      tenantId,
      keys: Object.keys(dto?.values || {}),
    });
    return result;
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Lista las configuraciones de todos los tenants (SuperAdmin)' })
  listConfigs(@Req() req: any) {
    this.assertSuperAdmin(req);
    return this.tenantConfigService.listConfigs();
  }

  // ---------------------------------------------------------------- Usage

  @Post('usage/report')
  @UseGuards(ServiceOrJwtGuard)
  @ApiOperation({
    summary: 'Reporta consumo (deltas) de un tenant',
    description:
      'Acepta JWT o service-key. Envía deltas por métrica; el servidor acumula con $inc.',
  })
  reportUsage(@Body() dto: ReportTenantUsageDto) {
    return this.tenantConfigService.reportUsage(
      dto.tenantId,
      dto.period,
      dto.metrics,
      dto.reportId,
    );
  }

  @Get('usage')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Lista el consumo de todos los tenants (SuperAdmin)' })
  @ApiQuery({ name: 'period', required: false, type: String })
  listUsage(@Query('period') period: string | undefined, @Req() req: any) {
    this.assertSuperAdmin(req);
    return this.tenantConfigService.listUsage(period);
  }

  @Get('usage/:tenantId')
  @UseGuards(ServiceOrJwtGuard)
  @ApiOperation({ summary: 'Obtiene el consumo de un tenant' })
  @ApiQuery({ name: 'period', required: false, type: String })
  getUsage(
    @Param('tenantId') tenantId: string,
    @Query('period') period?: string,
    @Req() req?: any,
  ) {
    const isSuper = req?.user?.isSuperAdmin === true;
    const isService = req?.user?.isService === true;
    const finalTenant =
      req?.user && !isSuper && !isService
        ? req.user.tenantId || req.user.company
        : tenantId;
    return this.tenantConfigService.getUsage(finalTenant, period);
  }

  // ------------------------------------------------------------------ TCP

  @MessagePattern({ cmd: 'getTenantConfig' })
  msGetTenantConfig(@Payload() payload: any) {
    return this.tenantConfigService.resolveConfig(
      payload?.tenantId,
      payload?.company,
    );
  }

  @MessagePattern({ cmd: 'getTenantPolicyCatalog' })
  msGetPolicyCatalog() {
    return this.tenantConfigService.getCatalog(true);
  }

  @MessagePattern({ cmd: 'reportTenantUsage' })
  msReportTenantUsage(@Payload() payload: any) {
    return this.tenantConfigService.reportUsage(
      payload?.tenantId,
      payload?.period,
      payload?.metrics,
      payload?.reportId,
    );
  }

  @MessagePattern({ cmd: 'getTenantUsage' })
  msGetTenantUsage(@Payload() payload: any) {
    return this.tenantConfigService.getUsage(
      payload?.tenantId,
      payload?.period,
    );
  }

  @MessagePattern({ cmd: 'setTenantConfig' })
  msSetTenantConfig(@Payload() payload: any) {
    return this.tenantConfigService.upsertConfig({
      tenantId: payload?.tenantId,
      company: payload?.company,
      isActive: payload?.isActive,
      values: payload?.values,
    });
  }

  @MessagePattern({ cmd: 'upsertPolicyDefinition' })
  msUpsertPolicyDefinition(@Payload() payload: any) {
    const definition = payload?.definition ?? payload;
    return this.tenantConfigService.createDefinition(definition);
  }
}
