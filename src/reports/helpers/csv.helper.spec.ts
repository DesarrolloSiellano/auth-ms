import { buildCsv } from './csv.helper';
import { ReportColumn } from '../interfaces/report.interface';

describe('buildCsv', () => {
  const columns: ReportColumn[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'total', label: 'Total', type: 'number' },
  ];

  it('genera un CSV con BOM y encabezados', () => {
    const csv = buildCsv(columns, [{ nombre: 'Ana', total: 3 }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Nombre;Total');
    expect(csv).toContain('Ana;3');
  });

  it('escapa valores con separador o comillas', () => {
    const csv = buildCsv(columns, [{ nombre: 'A; B "x"', total: 1 }]);
    expect(csv).toContain('"A; B ""x"""');
  });

  it('formatea valores nulos como vacío', () => {
    const csv = buildCsv(columns, [{ nombre: null, total: undefined }]);
    expect(csv.endsWith(';')).toBe(true);
  });
});
