import { describe, it, expect } from 'vitest';
import * as core from '../index';

describe('Nova Core Module entrypoint', () => {
  it('should export all manifest processing and permit detection services', () => {
    expect(core.processManifestFile).toBeDefined();
    expect(core.generateCSV).toBeDefined();
    expect(core.generateXLSX).toBeDefined();
    expect(core.downloadCSV).toBeDefined();
    expect(core.downloadXLSX).toBeDefined();
    expect(core.generateMultiMatchCSV).toBeDefined();
    expect(core.downloadMultiMatchCSV).toBeDefined();
    expect(core.detectPermit).toBeDefined();
    expect(core.detectPermitFromManifestId).toBeDefined();
    expect(core.detectPermitFromDescription).toBeDefined();
    expect(core.getPricingData).toBeDefined();
  });
});
