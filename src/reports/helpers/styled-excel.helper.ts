import * as ExcelJS from 'exceljs';
import {
  ReportColumn,
  ReportColumnType,
  ReportSummaryItem,
} from '../interfaces/report.interface';

const BRAND = 'FF2D3A74';
const BRAND_SOFT = 'FFEEF2FF';
const WHITE = 'FFFFFFFF';
const ZEBRA = 'FFF1F5F9';
const BORDER = 'FFD0D9E2';
const TEXT = 'FF1E293B';
const MUTED = 'FF64748B';

function numFmtFor(type?: ReportColumnType): string | undefined {
  switch (type) {
    case 'number':
      return '#,##0';
    case 'currency':
      return '"$"#,##0';
    case 'percent':
      return '0.0"%"';
    case 'date':
      return 'yyyy-mm-dd';
    default:
      return undefined;
  }
}

function displayValue(value: any, type?: ReportColumnType): any {
  if (value === null || value === undefined) return '';
  if (type === 'number' || type === 'currency' || type === 'percent') {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  return value;
}

function computeWidth(
  column: ReportColumn,
  rows: Record<string, any>[],
): number {
  if (column.width) return column.width;
  let max = column.label.length + 2;
  const sample = rows.slice(0, 120);
  for (const row of sample) {
    const val = row[column.key];
    const len = val === null || val === undefined ? 0 : String(val).length;
    if (len > max) max = len;
  }
  return Math.min(Math.max(max + 2, 12), 45);
}

/** Genera un XLSX con estilos corporativos, formatos y totales. */
export async function buildStyledExcel(params: {
  title: string;
  meta?: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  summary?: ReportSummaryItem[];
  sheetName?: string;
}): Promise<Buffer> {
  const { title, meta, columns, rows, summary } = params;
  const sheetName = (params.sheetName || 'Reporte').slice(0, 31);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BpoNet Authentication';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  sheet.columns = columns.map((c) => ({
    key: c.key,
    width: computeWidth(c, rows),
  }));

  const colCount = Math.max(columns.length, 1);

  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: BRAND },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, colCount);
  const metaCell = sheet.getCell(2, 1);
  metaCell.value = meta || '';
  metaCell.font = { italic: true, size: 9, color: { argb: MUTED } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 16;

  sheet.getRow(3).height = 6;

  const headerRow = sheet.getRow(4);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BRAND },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: BORDER } },
      left: { style: 'thin', color: { argb: BORDER } },
      right: { style: 'thin', color: { argb: BORDER } },
      bottom: { style: 'thin', color: { argb: BORDER } },
    };
  });
  headerRow.height = 22;

  rows.forEach((row, rIdx) => {
    const excelRow = sheet.getRow(5 + rIdx);
    columns.forEach((c, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      cell.value = displayValue(row[c.key], c.type);
      cell.font = { size: 9, color: { argb: TEXT } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c.align || (c.type && c.type !== 'text' ? 'right' : 'left'),
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: BORDER } },
        left: { style: 'thin', color: { argb: BORDER } },
        right: { style: 'thin', color: { argb: BORDER } },
        bottom: { style: 'thin', color: { argb: BORDER } },
      };
      const fmt = numFmtFor(c.type);
      if (fmt) cell.numFmt = fmt;

      if (rIdx % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: ZEBRA },
        };
      }

      if (c.colorRules && cell.value !== '' && cell.value !== null) {
        const numeric = Number(row[c.key]);
        if (!Number.isNaN(numeric)) {
          for (const rule of c.colorRules) {
            const match =
              (rule.op === 'lt' && numeric < rule.value) ||
              (rule.op === 'lte' && numeric <= rule.value) ||
              (rule.op === 'gt' && numeric > rule.value) ||
              (rule.op === 'gte' && numeric >= rule.value) ||
              (rule.op === 'eq' && numeric === rule.value);
            if (match) {
              if (rule.color) {
                cell.font = {
                  ...cell.font,
                  bold: true,
                  color: { argb: rule.color.replace('#', 'FF') },
                };
              }
              if (rule.bgColor) {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: rule.bgColor.replace('#', 'FF') },
                };
              }
              break;
            }
          }
        }
      }
    });
  });

  let currentRow = 5 + rows.length;
  if (summary && summary.length > 0) {
    currentRow += 1;
    const summaryRow = sheet.getRow(currentRow);
    summaryRow.getCell(1).value = 'Resumen';
    summaryRow.getCell(1).font = {
      bold: true,
      size: 10,
      color: { argb: BRAND },
    };
    summaryRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BRAND_SOFT },
    };
    summary.forEach((s, i) => {
      const row = sheet.getRow(currentRow + i);
      row.getCell(1).value = s.label;
      row.getCell(1).font = { bold: true, size: 9, color: { argb: TEXT } };
      row.getCell(2).value = s.value;
      row.getCell(2).font = { bold: true, size: 9, color: { argb: BRAND } };
    });
  }

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: colCount },
  };
  sheet.pageSetup = {
    orientation: colCount > 6 ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
  };
  sheet.headerFooter = {
    oddFooter: '&L&8BpoNet Authentication&C&8Página &P de &N&R&8' + title,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

/**
 * Escribe un XLSX con estilos directamente al stream de respuesta usando el
 * writer incremental de ExcelJS (memoria acotada, sin construir el workbook
 * completo en memoria).
 */
export async function streamStyledExcel(
  res: NodeJS.WritableStream,
  params: {
    title: string;
    meta?: string;
    columns: ReportColumn[];
    rows: Record<string, any>[];
    summary?: ReportSummaryItem[];
    sheetName?: string;
  },
): Promise<void> {
  const { title, meta, columns, rows, summary } = params;
  const sheetName = (params.sheetName || 'Reporte').slice(0, 31);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res as any,
    useStyles: true,
    useSharedStrings: false,
  });
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  sheet.columns = columns.map((c) => ({
    key: c.key,
    width: computeWidth(c, rows),
  }));
  const colCount = Math.max(columns.length, 1);

  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: BRAND },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 28;
  sheet.getRow(1).commit();

  sheet.mergeCells(2, 1, 2, colCount);
  const metaCell = sheet.getCell(2, 1);
  metaCell.value = meta || '';
  metaCell.font = { italic: true, size: 9, color: { argb: MUTED } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).commit();
  sheet.getRow(3).height = 6;
  sheet.getRow(3).commit();

  const headerRow = sheet.getRow(4);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BRAND },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: BORDER } },
      left: { style: 'thin', color: { argb: BORDER } },
      right: { style: 'thin', color: { argb: BORDER } },
      bottom: { style: 'thin', color: { argb: BORDER } },
    };
  });
  headerRow.height = 22;
  headerRow.commit();

  for (const [rIdx, row] of rows.entries()) {
    const excelRow = sheet.addRow({});
    columns.forEach((c, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      cell.value = displayValue(row[c.key], c.type);
      cell.font = { size: 9, color: { argb: TEXT } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c.align || (c.type && c.type !== 'text' ? 'right' : 'left'),
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: BORDER } },
        left: { style: 'thin', color: { argb: BORDER } },
        right: { style: 'thin', color: { argb: BORDER } },
        bottom: { style: 'thin', color: { argb: BORDER } },
      };
      const fmt = numFmtFor(c.type);
      if (fmt) cell.numFmt = fmt;
      if (rIdx % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: ZEBRA },
        };
      }
    });
    excelRow.commit();
  }

  if (summary && summary.length > 0) {
    const header = sheet.addRow(['Resumen']);
    header.getCell(1).font = { bold: true, size: 10, color: { argb: BRAND } };
    header.commit();
    for (const s of summary) {
      const row = sheet.addRow([s.label, s.value]);
      row.getCell(1).font = { bold: true, size: 9, color: { argb: TEXT } };
      row.getCell(2).font = { bold: true, size: 9, color: { argb: BRAND } };
      row.commit();
    }
  }

  sheet.commit();
  await workbook.commit();
}
