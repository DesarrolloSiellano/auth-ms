import { Injectable, Logger } from '@nestjs/common';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

export const DEFAULT_TIMEZONE = 'America/Bogota';
export const DEFAULT_LOCALE = 'es-CO';

interface DateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

/**
 * Resuelve `general.timezone` / `general.locale` del tenant y formatea
 * fechas para visualización. Usa `Intl.DateTimeFormat` (soporta IANA sin
 * dependencias extra).
 */
@Injectable()
export class LocaleService {
  private readonly logger = new Logger(LocaleService.name);

  constructor(private readonly tenantConfigService: TenantConfigService) {}

  async getTimezone(
    tenantId?: string,
    company?: string,
  ): Promise<string> {
    const value = await this.policy(
      tenantId,
      company,
      'general.timezone',
    );
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : DEFAULT_TIMEZONE;
  }

  async getLocale(tenantId?: string, company?: string): Promise<string> {
    const value = await this.policy(tenantId, company, 'general.locale');
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : DEFAULT_LOCALE;
  }

  /** `YYYY-MM-DD` en la zona indicada. */
  formatDate(
    date: Date | string | null | undefined,
    timezone: string = DEFAULT_TIMEZONE,
  ): string {
    const parts = this.parts(date, timezone);
    if (!parts) return '';
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  /** `HH:mm:ss` en la zona indicada (24h). */
  formatTime(
    date: Date | string | null | undefined,
    timezone: string = DEFAULT_TIMEZONE,
  ): string {
    const parts = this.parts(date, timezone);
    if (!parts) return '';
    return `${parts.hour}:${parts.minute}:${parts.second}`;
  }

  /** Fecha y hora legibles según locale, en la zona indicada. */
  formatDateTime(
    date: Date | string | null | undefined,
    timezone: string = DEFAULT_TIMEZONE,
    locale: string = DEFAULT_LOCALE,
  ): string {
    const value = this.toDate(date);
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(value);
    } catch {
      return value.toISOString();
    }
  }

  private async policy(
    tenantId: string | undefined,
    company: string | undefined,
    key: string,
  ): Promise<any> {
    try {
      return await this.tenantConfigService.getPolicyValue(
        tenantId,
        company,
        key,
      );
    } catch (error: any) {
      this.logger.warn(
        `No se pudo resolver "${key}", se usa el default: ${error?.message}`,
      );
      return undefined;
    }
  }

  private toDate(date: Date | string | null | undefined): Date | null {
    if (!date) return null;
    const value = date instanceof Date ? date : new Date(date);
    return Number.isNaN(value.getTime()) ? null : value;
  }

  private parts(
    date: Date | string | null | undefined,
    timezone: string,
  ): DateParts | null {
    const value = this.toDate(date);
    if (!value) return null;
    try {
      const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(value);
      const map: Record<string, string> = {};
      for (const part of formatted) {
        if (part.type !== 'literal') map[part.type] = part.value;
      }
      return {
        year: map.year ?? '',
        month: map.month ?? '',
        day: map.day ?? '',
        hour: map.hour ?? '',
        minute: map.minute ?? '',
        second: map.second ?? '',
      };
    } catch {
      return null;
    }
  }
}
