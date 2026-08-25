import { describe, it, expect } from 'vitest';
import * as index from '.././index';

describe('integrity index entrypoint', () => {
  it('should export all public API members', () => {
    expect(index.auditManifestIntegrity).toBeDefined();
    expect(index.computeIntegrityReport).toBeDefined();
    expect(index.compareRow).toBeDefined();
    expect(index.applyIntegrityRepairs).toBeDefined();
  });
});
