import Papa from 'papaparse';
import type { InvalidRow } from '@/lib/validators/customerImportValidator';

/**
 * Generate error report CSV from invalid rows
 * 
 * Creates a CSV with:
 * - All original columns
 * - __ROW_NUMBER__ column for easy identification
 * - __ERRORS__ column with detailed error messages
 * 
 * Users can fix errors in Excel/Google Sheets and re-upload
 * 
 * @param invalidRows - Array of invalid rows with errors
 * @returns CSV string
 */
export function generateErrorCSV(invalidRows: InvalidRow[]): string {
  const rows = invalidRows.map(({ row, data, errors }) => ({
    // Error columns first for visibility
    __ROW_NUMBER__: row,
    __ERRORS__: errors.join(' | '),
    // Original data columns
    fullName: data.fullName || '',
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    idNumber: data.idNumber || '',
    email: data.email || '',
    phone: data.phone || '',
    address: data.address || '',
    city: data.city || '',
    country: data.country || '',
    zipCode: data.zipCode || '',
    slCode: data.slCode || '',
    deliveryAddress1: data.deliveryAddress1 || '',
    deliveryAddress2: data.deliveryAddress2 || '',
    deliveryAddress3: data.deliveryAddress3 || '',
    preferredRouteId: data.preferredRouteId || '',
    notes: data.notes || '',
    status: data.status || 'active',
  }));

  return Papa.unparse(rows, {
    header: true,
    columns: [
      '__ROW_NUMBER__',
      '__ERRORS__',
      'fullName',
      'firstName',
      'lastName',
      'idNumber',
      'email',
      'phone',
      'address',
      'city',
      'country',
      'zipCode',
      'slCode',
      'deliveryAddress1',
      'deliveryAddress2',
      'deliveryAddress3',
      'preferredRouteId',
      'notes',
      'status',
    ],
  });
}

/**
 * Download error CSV file
 * 
 * @param invalidRows - Array of invalid rows with errors
 */
export function downloadErrorCSV(invalidRows: InvalidRow[]): void {
  const csv = generateErrorCSV(invalidRows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().split('T')[0];
  
  link.setAttribute('href', url);
  link.setAttribute('download', `customers-import-errors-${timestamp}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
