import {
  ReportColumn,
  ReportDefinition,
  ReportResult,
} from './interfaces/report.interface';
import { scopeOf } from './helpers/report-context.helper';

const STATE_OPTIONS = [
  { label: 'Todos', value: '' },
  { label: 'Activos', value: 'true' },
  { label: 'Inactivos', value: 'false' },
];

const SESSION_STATE_OPTIONS = [
  { label: 'Activas', value: 'active' },
  { label: 'Histórico (cerradas)', value: 'history' },
  { label: 'Todas', value: '' },
];

const AUDIT_CATEGORY_OPTIONS = [
  { label: 'Todas', value: '' },
  { label: 'Autenticación', value: 'auth' },
  { label: 'Sesiones', value: 'session' },
  { label: 'Configuración', value: 'config' },
  { label: 'Políticas', value: 'policy' },
  { label: 'Usuarios', value: 'user' },
  { label: 'Seguridad', value: 'security' },
];

const AUDIT_STATUS_OPTIONS = [
  { label: 'Todos', value: '' },
  { label: 'Exitoso', value: 'success' },
  { label: 'Fallido', value: 'failed' },
];

const QUOTA_MAP: Array<{
  label: string;
  usageMetric: string;
  limitKey: string;
}> = [
  { label: 'SMS', usageMetric: 'sms.sent', limitKey: 'channels.sms.monthlyLimit' },
  {
    label: 'Audio',
    usageMetric: 'audio.sent',
    limitKey: 'channels.audio.monthlyLimit',
  },
  {
    label: 'Correo',
    usageMetric: 'email.sent',
    limitKey: 'channels.email.monthlyLimit',
  },
  {
    label: 'WhatsApp utilidad',
    usageMetric: 'whatsapp.utilidad',
    limitKey: 'messages.bolsa.utilidad',
  },
  {
    label: 'WhatsApp marketing',
    usageMetric: 'whatsapp.marketingComercial',
    limitKey: 'messages.bolsa.marketingComercial',
  },
  {
    label: 'WhatsApp autenticación',
    usageMetric: 'whatsapp.autenticacion',
    limitKey: 'messages.bolsa.autenticacion',
  },
  {
    label: 'WhatsApp servicio',
    usageMetric: 'whatsapp.servicio',
    limitKey: 'messages.bolsa.servicio',
  },
];

function dateRangeFilter(
  field: string,
  filters: any,
  asDate = false,
): Record<string, any> {
  if (!filters?.desde && !filters?.hasta) return {};
  const range: any = {};
  if (filters.desde) {
    range.$gte = asDate ? new Date(filters.desde) : filters.desde;
  }
  if (filters.hasta) {
    range.$lte = asDate
      ? new Date(`${filters.hasta}T23:59:59.999Z`)
      : `${filters.hasta} 23:59:59`;
  }
  return { [field]: range };
}

function nestedValue(obj: any, path: string): any {
  return path
    .split('.')
    .reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

function fullName(u: any): string {
  return `${u?.name || ''} ${u?.lastName || ''}`.trim();
}

function rolesLabel(u: any): string {
  return (u?.roles || [])
    .map((r: any) => r.codeRol || r.name)
    .filter(Boolean)
    .join(', ');
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'users-list',
    nombre: 'Usuarios',
    descripcion:
      'Usuarios con filtros por rol, estado y rango de fechas de creación.',
    category: 'Usuarios',
    filters: [
      { key: 'rol', label: 'Rol (código o nombre)', type: 'text' },
      {
        key: 'estado',
        label: 'Estado',
        type: 'select',
        options: STATE_OPTIONS,
      },
      { key: 'empresa', label: 'Empresa', type: 'text' },
      { key: 'desde', label: 'Creados desde', type: 'date' },
      { key: 'hasta', label: 'Creados hasta', type: 'date' },
    ],
    build: async (ctx, filters, deps): Promise<ReportResult> => {
      const query: any = { ...scopeOf(ctx) };
      if (ctx.isSuperAdmin && filters?.empresa) {
        query.company = new RegExp(filters.empresa, 'i');
      }
      if (filters?.estado !== undefined && filters?.estado !== '') {
        query.isActived = String(filters.estado) === 'true';
      }
      if (filters?.rol) {
        const rx = new RegExp(filters.rol, 'i');
        query.$or = [{ 'roles.codeRol': rx }, { 'roles.name': rx }];
      }
      Object.assign(query, dateRangeFilter('created', filters, true));

      const users = await deps.userModel
        .find(query)
        .sort({ created: -1 })
        .limit(10000)
        .setOptions({ bypassTenant: true })
        .lean()
        .exec();

      const columns: ReportColumn[] = [
        { key: 'nombre', label: 'Nombre' },
        { key: 'email', label: 'Correo' },
        { key: 'usuario', label: 'Usuario' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'roles', label: 'Roles' },
        { key: 'estado', label: 'Estado', align: 'center' },
        { key: 'empresa', label: 'Empresa' },
        { key: 'creado', label: 'Creado', type: 'date', align: 'center' },
      ];

      const rows = users.map((u: any) => ({
        nombre: fullName(u),
        email: u.email || '',
        usuario: u.username || '',
        telefono: u.phone || '',
        roles: rolesLabel(u),
        estado: u.isActived ? 'Activo' : 'Inactivo',
        empresa: u.company || '',
        creado: u.created || '',
      }));

      return {
        columns,
        rows,
        summary: [
          { label: 'Total usuarios', value: rows.length },
          {
            label: 'Activos',
            value: rows.filter((r) => r.estado === 'Activo').length,
          },
          {
            label: 'Inactivos',
            value: rows.filter((r) => r.estado === 'Inactivo').length,
          },
        ],
      };
    },
  },
  {
    id: 'sessions-list',
    nombre: 'Sesiones',
    descripcion:
      'Sesiones activas e históricas por usuario, empresa, IP, dispositivo y período.',
    category: 'Sesiones',
    filters: [
      { key: 'email', label: 'Correo o usuario', type: 'text' },
      { key: 'ip', label: 'IP', type: 'text' },
      { key: 'dispositivo', label: 'Dispositivo (OS/navegador)', type: 'text' },
      {
        key: 'estado',
        label: 'Estado',
        type: 'select',
        options: SESSION_STATE_OPTIONS,
      },
      { key: 'empresa', label: 'Empresa', type: 'text' },
      { key: 'desde', label: 'Desde', type: 'date' },
      { key: 'hasta', label: 'Hasta', type: 'date' },
    ],
    build: async (ctx, filters, deps): Promise<ReportResult> => {
      const query: any = { ...scopeOf(ctx) };
      if (ctx.isSuperAdmin && filters?.empresa) {
        query.company = new RegExp(filters.empresa, 'i');
      }
      if (filters?.email) {
        query.email = new RegExp(filters.email, 'i');
      }
      if (filters?.ip) query.ip = new RegExp(filters.ip, 'i');
      if (filters?.dispositivo) {
        const rx = new RegExp(filters.dispositivo, 'i');
        query.$or = [{ browser: rx }, { os: rx }];
      }
      if (filters?.estado === 'active') query.isActive = true;
      else if (filters?.estado === 'history') query.isActive = false;
      Object.assign(query, dateRangeFilter('created', filters, false));

      const sessions = await deps.sessionModel
        .find(query)
        .select('-refreshToken')
        .sort({ created: -1 })
        .limit(10000)
        .setOptions({ bypassTenant: true })
        .lean()
        .exec();

      const columns: ReportColumn[] = [
        { key: 'email', label: 'Correo' },
        { key: 'empresa', label: 'Empresa' },
        { key: 'ip', label: 'IP' },
        { key: 'dispositivo', label: 'Dispositivo' },
        { key: 'estado', label: 'Estado', align: 'center' },
        { key: 'creada', label: 'Creada', type: 'date', align: 'center' },
        {
          key: 'ultimaActividad',
          label: 'Última actividad',
          type: 'date',
          align: 'center',
        },
      ];

      const rows = sessions.map((s: any) => ({
        email: s.email || '',
        empresa: s.company || '',
        ip: s.ip || '',
        dispositivo: [s.browser, s.os].filter(Boolean).join(' · '),
        estado: s.isActive ? 'Activa' : 'Cerrada',
        creada: s.created || '',
        ultimaActividad: s.lastActivityAt || '',
      }));

      return {
        columns,
        rows,
        summary: [
          { label: 'Total sesiones', value: rows.length },
          {
            label: 'Activas',
            value: rows.filter((r) => r.estado === 'Activa').length,
          },
          {
            label: 'Cerradas',
            value: rows.filter((r) => r.estado === 'Cerrada').length,
          },
        ],
      };
    },
  },
  {
    id: 'usage-vs-quotas',
    nombre: 'Uso vs cuotas',
    descripcion:
      'Consumo reportado por empresa frente a las cuotas configuradas, con gráfico.',
    category: 'Consumo',
    filters: [
      { key: 'period', label: 'Período (YYYY-MM)', type: 'text' },
      { key: 'empresa', label: 'Empresa', type: 'text' },
    ],
    build: async (ctx, filters, deps): Promise<ReportResult> => {
      const [usageRes, configRes] = await Promise.all([
        deps.tenantConfigService.listUsage(filters?.period || undefined),
        deps.tenantConfigService.listConfigs(),
      ]);

      const configs: any[] = (configRes?.data || []).filter((c: any) =>
        ctx.isSuperAdmin
          ? true
          : c.tenantId === ctx.tenantId || c.company === ctx.company,
      );
      const usage: any[] = (usageRes?.data || []).filter((u: any) => {
        if (!ctx.isSuperAdmin && !configs.some((c) => c.tenantId === u.tenantId)) {
          return false;
        }
        if (filters?.empresa) {
          const cfg = configs.find((c) => c.tenantId === u.tenantId);
          const name = cfg?.company || u.tenantId;
          if (!new RegExp(filters.empresa, 'i').test(name)) return false;
        }
        return true;
      });

      const usageByTenant = new Map<string, Record<string, number>>();
      for (const u of usage) {
        const prev = usageByTenant.get(u.tenantId) || {};
        for (const [key, value] of Object.entries(u.metrics || {})) {
          prev[key] = (prev[key] || 0) + Number(value || 0);
        }
        usageByTenant.set(u.tenantId, prev);
      }

      const tenantIds = new Set<string>();
      configs.forEach((c) => c.tenantId && tenantIds.add(c.tenantId));
      usage.forEach((u) => u.tenantId && tenantIds.add(u.tenantId));

      const rows: any[] = [];
      for (const tenantId of tenantIds) {
        const cfg = configs.find((c) => c.tenantId === tenantId);
        if (filters?.empresa) {
          const name = cfg?.company || tenantId;
          if (!new RegExp(filters.empresa, 'i').test(name)) continue;
        }
        const resolved = await deps.tenantConfigService.resolveConfig(
          tenantId,
          cfg?.company,
        );
        const nested = resolved?.data || {};
        const metrics = usageByTenant.get(tenantId) || {};
        for (const quota of QUOTA_MAP) {
          const used = Number(metrics[quota.usageMetric] || 0);
          const rawLimit = Number(nestedValue(nested, quota.limitKey) ?? 0);
          const unlimited = !rawLimit || rawLimit <= 0;
          const percent = unlimited
            ? 0
            : Math.round((used / rawLimit) * 1000) / 10;
          rows.push({
            empresa: cfg?.company || tenantId,
            tenantId,
            metrica: quota.label,
            uso: used,
            cuota: unlimited ? 0 : rawLimit,
            porcentaje: percent,
            estado: unlimited
              ? 'Sin límite'
              : used > rawLimit
                ? 'Excedido'
                : 'OK',
          });
        }
      }

      const chartLabels = QUOTA_MAP.map((q) => q.label);
      const chartUsed = QUOTA_MAP.map((q) =>
        rows
          .filter((r) => r.metrica === q.label)
          .reduce((acc, r) => acc + r.uso, 0),
      );
      const chartLimit = QUOTA_MAP.map((q) =>
        rows
          .filter((r) => r.metrica === q.label)
          .reduce((acc, r) => acc + r.cuota, 0),
      );

      const columns: ReportColumn[] = [
        { key: 'empresa', label: 'Empresa' },
        { key: 'tenantId', label: 'Tenant' },
        { key: 'metrica', label: 'Métrica' },
        { key: 'uso', label: 'Uso', type: 'number', align: 'right' },
        { key: 'cuota', label: 'Cuota', type: 'number', align: 'right' },
        {
          key: 'porcentaje',
          label: '% Uso',
          type: 'percent',
          align: 'right',
          colorRules: [
            { op: 'gt', value: 100, color: '#dc2626' },
            { op: 'gte', value: 80, color: '#d97706' },
          ],
        },
        { key: 'estado', label: 'Estado', align: 'center' },
      ];

      const excedidos = rows.filter((r) => r.estado === 'Excedido').length;

      return {
        columns,
        rows,
        summary: [
          { label: 'Empresas', value: tenantIds.size },
          { label: 'Registros', value: rows.length },
          { label: 'Métricas excedidas', value: excedidos },
        ],
        chart: {
          type: 'bar',
          labels: chartLabels,
          datasets: [
            {
              label: 'Uso',
              data: chartUsed,
              backgroundColor: '#2d3a74',
            },
            {
              label: 'Cuota',
              data: chartLimit,
              backgroundColor: '#94a3b8',
            },
          ],
        },
      };
    },
  },
  {
    id: 'audit-access',
    nombre: 'Accesos / auditoría',
    descripcion:
      'Eventos de autenticación, sesiones y cambios de políticas/configuración.',
    category: 'Auditoría',
    filters: [
      {
        key: 'category',
        label: 'Categoría',
        type: 'select',
        options: AUDIT_CATEGORY_OPTIONS,
      },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: AUDIT_STATUS_OPTIONS,
      },
      { key: 'action', label: 'Acción', type: 'text' },
      { key: 'email', label: 'Usuario (correo)', type: 'text' },
      { key: 'desde', label: 'Desde', type: 'date' },
      { key: 'hasta', label: 'Hasta', type: 'date' },
      { key: 'page', label: 'Página', type: 'number' },
      { key: 'limit', label: 'Registros por página', type: 'number' },
    ],
    build: async (ctx, filters, deps): Promise<ReportResult> => {
      const exportAll = filters?.__export === true;
      const result = await deps.auditService.findForReport(
        filters || {},
        {
          isSuperAdmin: ctx.isSuperAdmin,
          company: ctx.company,
        },
        exportAll
          ? { all: true }
          : {
              page: Number(filters?.page) || 1,
              limit: Number(filters?.limit) || 100,
            },
      );
      const items = result.data || [];

      const columns: ReportColumn[] = [
        { key: 'fecha', label: 'Fecha', type: 'date', align: 'center' },
        { key: 'hora', label: 'Hora', align: 'center' },
        { key: 'accion', label: 'Acción' },
        { key: 'categoria', label: 'Categoría', align: 'center' },
        { key: 'estado', label: 'Estado', align: 'center' },
        { key: 'usuario', label: 'Usuario' },
        { key: 'empresa', label: 'Empresa' },
        { key: 'ip', label: 'IP' },
        { key: 'dispositivo', label: 'Dispositivo' },
        { key: 'detalle', label: 'Detalle' },
      ];

      const rows = (items || []).map((a: any) => {
        const created = a.createdAt ? new Date(a.createdAt) : null;
        return {
          fecha: created ? created.toISOString().slice(0, 10) : '',
          hora: created ? created.toISOString().slice(11, 19) : '',
          accion: a.action || '',
          categoria: a.category || '',
          estado: a.status === 'failed' ? 'Fallido' : 'Exitoso',
          usuario: a.email || a.userId || '',
          empresa: a.company || '',
          ip: a.ip || '',
          dispositivo: [a.browser, a.os].filter(Boolean).join(' · '),
          detalle: a.detail ? JSON.stringify(a.detail) : '',
        };
      });

      return {
        columns,
        rows,
        summary: [
          { label: 'Total eventos', value: result.total ?? rows.length },
          {
            label: 'Exitosos',
            value: rows.filter((r) => r.estado === 'Exitoso').length,
          },
          {
            label: 'Fallidos',
            value: rows.filter((r) => r.estado === 'Fallido').length,
          },
        ],
        meta: { total: result.total ?? rows.length },
      };
    },
  },
];
