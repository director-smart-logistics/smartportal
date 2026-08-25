import * as XLSX from 'xlsx';
import { SeaManifestRowData } from '@/components/ui/usa-sea-spreadsheet/useSpreadsheetCalculations';

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Normalizes column names for robust matching.
 */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function parseExcelToSpreadsheetRows(file: File): Promise<SeaManifestRowData[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        if (rawRows.length < 2) {
          return resolve([]);
        }

        // Detect header row (usually the first row, but let's scan the first 5 rows)
        let headerRowIndex = 0;
        let headers: string[] = [];
        let maxCols = 0;
        
        for (let i = 0; i < Math.min(5, rawRows.length); i++) {
          const cols = rawRows[i].filter(c => typeof c === 'string' && c.trim() !== '');
          if (cols.length > maxCols) {
            maxCols = cols.length;
            headerRowIndex = i;
            headers = rawRows[i].map(c => String(c || '').trim());
          }
        }

        const normHeaders = headers.map(normalizeHeader);
        
        // Map common column names to our fields
        const colMap = {
          warehouseId: normHeaders.findIndex(h => h.includes('tracking') || h.includes('warehouse') || h.includes('guia')),
          slCode: normHeaders.findIndex(h => h.includes('smartid') || h.includes('cuenta') || h.includes('cliente') || h.includes('code')),
          length: normHeaders.findIndex(h => h.includes('largo') || h.includes('length') || h === 'l'),
          width: normHeaders.findIndex(h => h.includes('ancho') || h.includes('width') || h === 'w' || h === 'a'),
          height: normHeaders.findIndex(h => h.includes('alto') || h.includes('height') || h === 'h'),
        };

        const rowsData: SeaManifestRowData[] = [];
        
        // Parse data rows
        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          
          // Skip completely empty rows
          if (row.every(cell => !cell)) continue;
          
          const warehouseId = colMap.warehouseId >= 0 ? String(row[colMap.warehouseId] || '').trim() : '';
          const slCode = colMap.slCode >= 0 ? String(row[colMap.slCode] || '').trim() : '';
          const length = colMap.length >= 0 ? String(row[colMap.length] || '').trim() : '';
          const width = colMap.width >= 0 ? String(row[colMap.width] || '').trim() : '';
          const height = colMap.height >= 0 ? String(row[colMap.height] || '').trim() : '';
          
          // If at least one important field is present
          if (warehouseId || slCode || length || width || height) {
            let formattedSlCode = slCode;
            if (/^\d+$/.test(formattedSlCode)) {
              formattedSlCode = `SL${formattedSlCode}`;
            }

            rowsData.push({
              id: generateId(),
              warehouseId,
              slCode: formattedSlCode,
              customerName: '',
              ruta: '',
              length,
              width,
              height,
              priceOverride: ''
            });
          }
        }
        
        resolve(rowsData);
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    reader.readAsBinaryString(file);
  });
}
