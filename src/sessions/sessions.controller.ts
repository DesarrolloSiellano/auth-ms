import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerHybridGuard } from 'src/core/guards/throttler-hybrid.guard';
import { AuditService } from 'src/audit/audit.service';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
@UseGuards(AuthGuard('jwt'), ThrottlerHybridGuard)
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private audit(req: any, action: string, detail: Record<string, any>): void {
    this.auditService?.logAsync({
      action,
      category: 'session',
      status: 'success',
      userId: String(req?.user?._id || ''),
      email: req?.user?.email,
      company: req?.user?.company,
      tenantId: req?.user?.tenantId,
      ip: req?.ip,
      detail,
    });
  }

  /** Solo admin/superadmin; un admin no-super queda acotado a su empresa. */
  private resolveScope(req: any): string | undefined {
    const user = req?.user;
    if (!user?.isAdmin && !user?.isSuperAdmin) {
      throw new ForbiddenException(
        'No tienes permiso para gestionar sesiones',
      );
    }
    return user?.isSuperAdmin ? undefined : user?.company;
  }

  @Get()
  @ApiOperation({ summary: 'Lista las sesiones activas' })
  @ApiQuery({ name: 'email', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Req() req: any,
    @Query('email') email?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: number,
    @Query('limit') limit?: number,
  ) {
    const company = this.resolveScope(req);
    return this.sessionsService.findActiveSessions({
      company,
      email,
      userId,
      from: from !== undefined ? Number(from) : 0,
      limit: limit !== undefined ? Number(limit) : 50,
    });
  }

  @Get('mine')
  @ApiOperation({
    summary: 'Lista las sesiones activas del usuario autenticado',
  })
  findMine(@Req() req: any) {
    return this.sessionsService.findMine(String(req.user._id));
  }

  @Get('findByUser/:userId')
  @ApiOperation({ summary: 'Lista las sesiones activas de un usuario' })
  findByUser(@Param('userId') userId: string, @Req() req: any) {
    const company = this.resolveScope(req);
    return this.sessionsService.findActiveSessions({
      company,
      userId,
      from: 0,
      limit: 100,
    });
  }

  @Post('revoke')
  @ApiOperation({ summary: 'Revoca un lote de sesiones por ids' })
  async revokeMany(@Body() body: { ids: string[] }, @Req() req: any) {
    const company = this.resolveScope(req);
    const ids = body?.ids || [];
    const revoked = await this.sessionsService.revokeMany(ids, company);
    this.audit(req, 'session.revoked.batch', { ids, revoked });
    return {
      message: 'Sessions revoked successfully',
      data: { revoked },
      meta: { totalData: revoked },
    };
  }

  @Delete('user/:userId')
  @ApiOperation({ summary: 'Revoca todas las sesiones de un usuario' })
  async revokeByUser(@Param('userId') userId: string, @Req() req: any) {
    const company = this.resolveScope(req);
    const revoked = await this.sessionsService.revokeByUser(userId, company);
    this.audit(req, 'session.revoked.user', { userId, revoked });
    return {
      message: 'User sessions revoked successfully',
      data: { revoked },
      meta: { totalData: revoked },
    };
  }

  @Delete('mine/:id')
  @ApiOperation({ summary: 'Revoca una sesión propia por id' })
  async revokeMine(@Param('id') id: string, @Req() req: any) {
    const userId = String(req.user._id);
    const session = await this.sessionsService.revokeMine(userId, id);
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }
    this.audit(req, 'session.revoked.self', { sessionId: id });
    return {
      message: 'Session revoked successfully',
      data: session,
      meta: { totalData: 1 },
    };
  }

  @Delete('mine')
  @ApiOperation({ summary: 'Revoca todas las sesiones propias' })
  async revokeAllMine(@Req() req: any) {
    const userId = String(req.user._id);
    const revoked = await this.sessionsService.revokeAllMine(userId);
    this.audit(req, 'session.revoked.self.all', { revoked });
    return {
      message: 'Sessions revoked successfully',
      data: { revoked },
      meta: { totalData: revoked },
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoca una sesión por id' })
  async revokeById(@Param('id') id: string, @Req() req: any) {
    const company = this.resolveScope(req);
    const session = await this.sessionsService.revokeById(id, company);
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }
    this.audit(req, 'session.revoked', { sessionId: id });
    return {
      message: 'Session revoked successfully',
      data: session,
      meta: { totalData: 1 },
    };
  }

  @Delete()
  @ApiOperation({
    summary: 'Revoca todas las sesiones (de la empresa o globales)',
  })
  async revokeAll(@Req() req: any) {
    const company = this.resolveScope(req);
    const revoked = await this.sessionsService.revokeAll(company);
    this.audit(req, 'session.revoked.all', { revoked, company });
    return {
      message: 'Sessions revoked successfully',
      data: { revoked },
      meta: { totalData: revoked },
    };
  }
}
