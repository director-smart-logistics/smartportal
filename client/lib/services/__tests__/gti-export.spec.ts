import { describe, it, expect } from 'vitest';
import { buildGTITiquetesCSV, buildGTICalculatedRows, type GTIRowInput } from '../gti-export';

describe('GTI Export Service (Costa Rica Tax Standards)', () => {
  it('should format default tiquete row with standard defaults (Doc 4, Cond 1, Medio 6)', () => {
    const rows: GTIRowInput[] = [
      {
        nombre: 'Juan Perez',
        dni: '112345678',
        email: 'juan@example.com',
        phone: '88888888',
        precioUSD: 10,
      },
    ];

    const csv = buildGTITiquetesCSV(rows, { tc: 520, manifestNumber: 'MF-100' });
    const lines = csv.split('\r\n');
    expect(lines.length).toBe(2);

    const cols = lines[1].split(',');
    // Col D (Tipo de doc) = '4'
    expect(cols[3]).toBe('4');
    // Col E (Condicion venta) = '1' (Contado)
    expect(cols[4]).toBe('1');
    // Col G (Medio pago) = '6' (SINPE)
    expect(cols[6]).toBe('6');
  });

  it('should format electronic invoice row with custom tax fields (Doc 1, Cond 1, Medio 03 Transferencia)', () => {
    const rows: GTIRowInput[] = [
      {
        nombre: 'Empresa CR S.A.',
        dni: '3101999999',
        email: 'billing@empresa.cr',
        phone: '22223333',
        precioUSD: 50,
        electronicInvoiceRequired: true,
        tipoDocumento: '01',
        condicionVenta: '01',
        medioPago: '03',
      },
    ];

    const csv = buildGTITiquetesCSV(rows, { tc: 500, manifestNumber: 'MF-101' });
    const lines = csv.split('\r\n');
    const cols = lines[1].split(',');

    // Col D (Tipo de doc) = '1' (Factura electronica)
    expect(cols[3]).toBe('1');
    // Col E (Condicion venta) = '01' (Contado)
    expect(cols[4]).toBe('01');
    // Col G (Medio pago) = '03' (Transferencia)
    expect(cols[6]).toBe('03');
    // Col L (Cedula) should contain recipient DNI
    expect(cols[11]).toBe('3101999999');
  });

  it('should correctly compute MONTO, FLETE (80%) and LOGISTICA net amounts', () => {
    const rows: GTIRowInput[] = [
      {
        nombre: 'Test User',
        dni: '123456',
        email: 'test@example.com',
        phone: '88888888',
        precioUSD: 100,
      },
    ];

    const calculated = buildGTICalculatedRows(rows, { tc: 500 });
    expect(calculated[0].monto).toBe(50000); // 100 * 500
    expect(calculated[0].flete).toBe(40000); // 50000 * 0.8
    expect(calculated[0].logistica).toBe(8849.55); // (50000 - 40000) / 1.13 trunc
  });

  it('should preserve backward compatibility for legacy rows with undefined tax fields', () => {
    const legacyRow: GTIRowInput = {
      nombre: 'Cliente Historico',
      dni: '11111111',
      email: 'historico@example.com',
      phone: '88888888',
      precioUSD: 25,
      // tipoDocumento, condicionVenta, medioPago are all undefined
    };

    const csv = buildGTITiquetesCSV([legacyRow], { tc: 500 });
    const cols = csv.split('\r\n')[1].split(',');

    // Must default gracefully to historical standard values:
    expect(cols[3]).toBe('4'); // Tiquete electronico default
    expect(cols[4]).toBe('1'); // Contado default
    expect(cols[6]).toBe('6'); // SINPE default
  });
});
