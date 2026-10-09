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
import { ParamFormat } from 'src/core/decorators/param-format.decorator';
import { ServiceOrJwtGuard } from 'src/core/guards/service-or-jwt.guard';
import { AuditService } from 'src/audit/audit.service';
import { TenantConfigService } from './tenant-config.service';
import {
  CreatePolicyDefinitionDto,
  UpdatePolicyDefinitionDto,
} from './dto/policy-definition.dto';
import {
  PatchTenantConfigValuesDto,
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
  @ParamFormat({ param: 'key', kind: 'token' })
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
  @ParamFormat({ param: 'key', kind: 'token' })
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
    const finalTenant = tenantId || req?.user?.tenantId || undefined;
    const finalCompany = company || req?.user?.company || undefined;
    return this.tenantConfigService.resolveConfig(finalTenant, finalCompany);
  }

  @Get('config/:tenantId')
  @ParamFormat({ param: 'tenantId', kind: 'token' })
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtiene la configuración de un tenant (SuperAdmin)' })
  @ApiQuery({ name: 'company', required: false, type: String })
  getConfigByTenant(
    @Param('tenantId') tenantId: string,
    @Query('company') company: string | undefined,
    @Req() req: any,
  ) {
    this.assertSuperAdmin(req);
    return this.tenantConfigService.getConfigByTenant(tenantId, company);
  }

  @Put('config/:tenantId')
  @ParamFormat({ param: 'tenantId', kind: 'token' })
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
  @ParamFormat({ param: 'tenantId', kind: 'token' })
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Actualiza valores de políticas (SuperAdmin)' })
  @ApiQuery({ name: 'company', required: false, type: String })
  async patchValues(
    @Param('tenantId') tenantId: string,
    @Body() dto: PatchTenantConfigValuesDto,
    @Query('company') company: string | undefined,
    @Req() req: any,
  ) {
    this.assertSuperAdmin(req);
    const result = await this.tenantConfigService.patchValues(
      tenantId,
      dto,
      company,
    );
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

  // ------------------------------------------------------------------ TCP

  @MessagePattern({ cmd: 'getTenantConfig' })
  msGetTenantConfig(@Payload() payload: any) {
    return this.tenantConfigService.resolveConfig(
      payload?.tenantId,
      payload?.company,
    );
  }

  /**
   * Valida el par canónico (company + tenantId) de una empresa activa.
   * Usado por apps consumidoras para validar la selección de empresa del
   * SuperAdmin sin crear configs huefanas ni consultar por cada petición.
   */
  @MessagePattern({ cmd: 'resolveCompanyPair' })
  async msResolveCompanyPair(@Payload() payload: any) {
    const identity = await this.tenantConfigService.resolveCompanyPair(
      payload?.company,
      payload?.tenantId,
    );
    return {
      valid: identity !== null,
      company: identity?.name ?? null,
      tenantId: identity?.id ?? null,
    };
  }

  @MessagePattern({ cmd: 'getTenantPolicyCatalog' })
  msGetPolicyCatalog() {
    return this.tenantConfigService.getCatalog(true);
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
