import * as XLSX from 'xlsx';
import { ManifestRow, ManifestRowSchema, DuplicateDetection, ValidationError } from '@shared/manifest';

/**
 * Parse CSV content from a string
 * Filters out completely empty columns
 */
export function parseCSV(content: string): string[][] {
  const lines = content.split('\n').filter((line) => line.trim());
  const rows = lines.map((line) =>
    line
      .split(',')
      .map((cell) => cell.trim().replace(/^"|"$/g, ''))
  );

  // Find indices of empty columns (columns where all values are empty)
  if (rows.length === 0) return rows;

  const emptyColumnIndices = new Set<number>();
  const maxColumns = Math.max(...rows.map((r) => r.length));

  for (let col = 0; col < maxColumns; col++) {
    const isEmpty = rows.every((row) => !row[col] || row[col].trim() === '');
    if (isEmpty) {
      emptyColumnIndices.add(col);
    }
  }

  // Filter out empty columns from all rows
  if (emptyColumnIndices.size > 0) {
    return rows.map((row) =>
      row.filter((_, idx) => !emptyColumnIndices.has(idx))
    );
  }

  return rows;
}

/**
 * Parse XLSX file
 * Filters out completely empty columns
 */
export async function parseXLSX(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        let rows = XLSX.utils.sheet_to_json<string[]>(worksheet, {
          header: 1,
          blankrows: false,
        });

        // Filter out completely empty columns
        if (rows.length === 0) {
          resolve(rows);
          return;
        }

        const emptyColumnIndices = new Set<number>();
        const maxColumns = Math.max(...rows.map((r) => r.length));

        for (let col = 0; col < maxColumns; col++) {
          const isEmpty = rows.every((row) => !row[col] || String(row[col]).trim() === '');
          if (isEmpty) {
            emptyColumnIndices.add(col);
          }
        }

        // Filter out empty columns from all rows
        if (emptyColumnIndices.size > 0) {
          rows = rows.map((row) =>
            row.filter((_, idx) => !emptyColumnIndices.has(idx))
          );
        }

        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Auto-detect column headers from raw data
 * Skips empty or whitespace-only headers
 */
export function autoDetectColumns(
  headers: string[],
  requiredFields: string[]
): Record<string, number | null> {
  const mapping: Record<string, number | null> = {};
  
  // Filter out empty headers and create mapping from original to filtered indices
  const filteredHeaders: { index: number; header: string; lowerCase: string }[] = [];
  for (let i = 0; i < headers.length; i++) {
    const trimmed = headers[i].trim();
    if (trimmed) {
      filteredHeaders.push({
        index: i,
        header: trimmed,
        lowerCase: trimmed.toLowerCase()
      });
    }
  }

  const fieldPatterns: Record<string, RegExp> = {
    trackingNumber: /tracking|tracking\s*number|track|tn|tracking_number|number/i,
    weight: /weight|wt|weight_kg|weight_lbs|mass|wgt|peso|^lb$|^lbs$|^kg$/i,
    description: /description|desc|notes|detail|remarks|comment|contenido|content/i,
    guideId: /^guia$|^guide$|guide\s*id|guide_id|guia\s*id|manifest\s*guide|manifest_guide|awb|airway\s*bill|numero\s*guia|no\.\s*guia/i,
    manifestNumber: /manifest\s*number|manifest_number|manifest\s*id|manifest_id|^manifest$|no\.\s*manifiesto|numero\s*manifiesto/i,
    customerName: /customer\s*name|nombre.*cliente|client\s*name|fullname|full_name|shipper|recipient|^nombre$|^cliente$/i,
    origin: /origin|from|source|origin_location|from_location|departure|source_city|origen/i,
    destination: /destination|to|dest|destination_location|to_location|arrival|dest_city|destino/i,
    customerId: /customer\s*id|customerid|cust_id|customer_code|codigo.*cliente|código.*cliente|client\s*code|^code$|^codigo$|^código$/i,
    type: /type|shipment\s*type|shipping\s*type|delivery\s*type|transport\s*type|mode|tipo/i,
    status: /status|state|delivery_status|order_status|estado/i,
  };

  for (const field of requiredFields) {
    const pattern = fieldPatterns[field];
    if (pattern) {
      // Find best match among filtered headers
      let bestMatchIndex = -1;
      let bestMatchConfidence = 0;

      for (const filtered of filteredHeaders) {
        if (pattern.test(filtered.lowerCase)) {
          // Higher confidence for exact field name matches
          const confidence = filtered.lowerCase.includes(field.toLowerCase().replace(/([A-Z])/g, ' $1').toLowerCase()) ? 0.95 : 0.7;
          if (confidence > bestMatchConfidence) {
            bestMatchConfidence = confidence;
            bestMatchIndex = filtered.index;
          }
        }
      }

      mapping[field] = bestMatchIndex >= 0 ? bestMatchIndex : null;
    } else {
      mapping[field] = null;
    }
  }

  return mapping;
}

/**
 * Extract rows based on column mapping
 */
export function extractRows(
  rawData: string[][],
  columnMapping: Record<string, number>,
  defaultType: string = 'air',
  defaultOrigin: string = 'USA',
  defaultDestination: string = 'CR',
  defaultStatus: string = 'received',
  defaultManifestNumber: string = ''
): Partial<ManifestRow>[] {
  const [headers, ...dataRows] = rawData;

  return dataRows
    .filter((row) => row.some((cell) => cell && cell.trim()))
    .map((row) => {
      const obj: any = {};
      for (const [field, colIndex] of Object.entries(columnMapping)) {
        if (colIndex >= 0 && colIndex < row.length) {
          let value = row[colIndex];
          // Convert description to UPPERCASE
          if (field === 'description' && value) {
            value = value.toUpperCase();
          }
          obj[field] = value;
        }
      }
      // Apply default values if not provided or empty
      if (!obj.type || obj.type.trim() === '') {
        obj.type = defaultType;
      }
      if (!obj.origin || obj.origin.trim() === '') {
        obj.origin = defaultOrigin;
      }
      if (!obj.destination || obj.destination.trim() === '') {
        obj.destination = defaultDestination;
      }
      if (!obj.status || obj.status.trim() === '') {
        obj.status = defaultStatus;
      }
      if (!obj.manifestNumber || obj.manifestNumber.trim() === '') {
        if (defaultManifestNumber && defaultManifestNumber.trim() !== '') {
          obj.manifestNumber = defaultManifestNumber;
        }
      }
      return obj;
    });
}

/**
 * Validate individual row
 */
export function validateRow(
  rowData: Partial<ManifestRow>,
  rowIndex: number
): ValidationError[] {
  try {
    ManifestRowSchema.parse(rowData);
    return [];
  } catch (error: any) {
    if (error.issues) {
      return error.issues.map((issue: any) => ({
        rowIndex,
        field: issue.path[0] || 'unknown',
        value: rowData[issue.path[0] as keyof ManifestRow],
        error: issue.message,
      }));
    }
    return [
      {
        rowIndex,
        field: 'unknown',
        value: null,
        error: 'Validation failed',
      },
    ];
  }
}

/**
 * Detect duplicates within the dataset
 */
export function detectDuplicates(rows: ManifestRow[]): DuplicateDetection[] {
  const trackingNumbers = new Map<string, number[]>();

  rows.forEach((row, idx) => {
    const tn = row.trackingNumber.toLowerCase();
    if (!trackingNumbers.has(tn)) {
      trackingNumbers.set(tn, []);
    }
    trackingNumbers.get(tn)!.push(idx);
  });

  return Array.from(trackingNumbers.entries())
    .filter(([, indices]) => indices.length > 1)
    .map(([tn, indices]) => ({
      trackingNumber: tn,
      rowIndices: indices,
      isDuplicate: true,
    }));
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if file is valid type
 */
export function isValidFileType(file: File): boolean {
  const validTypes = ['text/csv', 'application/vnd.ms-excel', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  return validTypes.includes(file.type) || 
    file.name.endsWith('.csv') || 
    file.name.endsWith('.xlsx');
}

/**
 * Check if file size is within limits (10MB)
 */
export function isValidFileSize(file: File): boolean {
  const maxSize = 10 * 1024 * 1024; // 10MB
  return file.size <= maxSize;
}
