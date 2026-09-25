import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { ThrottlerHybridGuard } from 'src/core/guards/throttler-hybrid.guard';
import { ReportsService } from './reports.service';
import type { ReportFormat } from './interfaces/report.interface';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(AuthGuard('jwt'), ThrottlerHybridGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Catálogo de reportes disponibles' })
  catalog(@Req() req: Request) {
    return this.reportsService.getCatalog((req as any).user);
  }

  @Post(':id/preview')
  @ApiOperation({ summary: 'Vista previa de un reporte' })
  preview(
    @Param('id') id: string,
    @Body() body: { filters?: any; limit?: number } | undefined,
    @Req() req: Request,
  ) {
    return this.reportsService.preview(
      id,
      body?.filters || {},
      (req as any).user,
      body?.limit,
    );
  }

  @Post(':id/data')
  @ApiOperation({
    summary: 'Datos completos de un reporte (JSON, para PDF en el navegador)',
  })
  data(
    @Param('id') id: string,
    @Body() body: { filters?: any; limit?: number } | undefined,
    @Req() req: Request,
  ) {
    return this.reportsService.data(
      id,
      body?.filters || {},
      (req as any).user,
      body?.limit,
    );
  }

  @Post(':id/export')
  @ApiOperation({ summary: 'Exporta un reporte en streaming (xlsx/csv)' })
  async export(
    @Param('id') id: string,
    @Query('format') format: ReportFormat,
    @Body() body: { filters?: any } | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.reportsService.exportStream(
      id,
      body?.filters || {},
      format || 'xlsx',
      (req as any).user,
      res,
    );
  }
}
