import {
  ReportColumn,
  ReportColumnType,
} from '../interfaces/report.interface';

function formatValue(value: any, type?: ReportColumnType): string {
  if (value === null || value === undefined) return '';
  if (type === 'number' || type === 'currency' || type === 'percent') {
    const n = Number(value);
    return Number.isNaN(n) ? String(value) : String(n);
  }
  return String(value);
}

function escapeCsv(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Genera un CSV plano separado por ';' con BOM UTF-8 para que Excel en
 * español muestre correctamente los acentos.
 */
export function buildCsv(
  columns: ReportColumn[],
  rows: Record<string, any>[],
): string {
  const header = columns.map((c) => escapeCsv(c.label)).join(';');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsv(formatValue(row[c.key], c.type))).join(';'),
  );
  return '\uFEFF' + [header, ...lines].join('\r\n');
}

/**
 * Escribe un CSV directamente al stream de respuesta, fila por fila, para no
 * construir todo el contenido en memoria (útil en datasets grandes).
 */
export function streamCsv(
  res: NodeJS.WritableStream,
  columns: ReportColumn[],
  rows: Record<string, any>[],
): void {
  res.write('\uFEFF');
  res.write(columns.map((c) => escapeCsv(c.label)).join(';') + '\r\n');
  for (const row of rows) {
    res.write(
      columns.map((c) => escapeCsv(formatValue(row[c.key], c.type))).join(';') +
        '\r\n',
    );
  }
  res.end();
}
