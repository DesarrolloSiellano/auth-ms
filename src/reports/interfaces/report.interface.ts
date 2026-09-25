export type ReportColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date';

export type ReportAlign = 'left' | 'center' | 'right';

export interface ColorRule {
  op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq';
  value: number;
  color?: string;
  bgColor?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  type?: ReportColumnType;
  width?: number;
  align?: ReportAlign;
  colorRules?: ColorRule[];
}

export interface ReportSummaryItem {
  label: string;
  value: string | number;
}

export interface ReportChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
}

export interface ReportChart {
  type: 'bar' | 'line' | 'doughnut' | 'pie';
  labels: string[];
  datasets: ReportChartDataset[];
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, any>[];
  summary?: ReportSummaryItem[];
  chart?: ReportChart;
  meta?: Record<string, any>;
}

export type ReportFilterType = 'text' | 'date' | 'select' | 'boolean' | 'number';

export interface ReportFilterOption {
  label: string;
  value: any;
}

export interface ReportFilter {
  key: string;
  label: string;
  type: ReportFilterType;
  options?: ReportFilterOption[];
  placeholder?: string;
}

export interface ReportContext {
  user: any;
  userId: string;
  userName: string;
  company?: string;
  tenantId?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  tenantLabel: string;
}

export interface ReportDeps {
  userModel: any;
  sessionModel: any;
  companyModel: any;
  tenantConfigService: any;
  auditService: any;
}

export interface ReportDefinition {
  id: string;
  nombre: string;
  descripcion: string;
  category: string;
  filters: ReportFilter[];
  build: (
    ctx: ReportContext,
    filters: any,
    deps: ReportDeps,
  ) => Promise<ReportResult>;
}

export type ReportFormat = 'xlsx' | 'csv' | 'pdf';
