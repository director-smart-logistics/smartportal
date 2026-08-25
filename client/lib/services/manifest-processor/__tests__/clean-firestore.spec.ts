import { describe, it, expect } from 'vitest';
import { cleanForFirestore } from '../ingestion';

describe('cleanForFirestore', () => {
  it('removes top-level undefined properties from an object', () => {
    const input = {
      tracking: '1Z123456',
      slCode: 'SL1001',
      emptyField: undefined,
      nullField: null,
      numberField: 0,
      boolField: false,
    };
    const cleaned = cleanForFirestore(input);
    expect(cleaned).toEqual({
      tracking: '1Z123456',
      slCode: 'SL1001',
      nullField: null,
      numberField: 0,
      boolField: false,
    });
    expect('emptyField' in cleaned).toBe(false);
  });

  it('removes deeply nested undefined properties from preAlert objects', () => {
    const input = {
      tracking: 'TBA123456',
      preAlert: {
        found: true,
        slCode: 'SL7388',
        clientName: undefined,
        description: undefined,
        declaredValue: 25.5,
        invoiceUrl: undefined,
      },
    };
    const cleaned = cleanForFirestore(input);
    expect(cleaned).toEqual({
      tracking: 'TBA123456',
      preAlert: {
        found: true,
        slCode: 'SL7388',
        declaredValue: 25.5,
      },
    });
    expect('clientName' in cleaned.preAlert).toBe(false);
    expect('description' in cleaned.preAlert).toBe(false);
    expect('invoiceUrl' in cleaned.preAlert).toBe(false);
  });

  it('cleans arrays with undefined elements or objects with undefined properties', () => {
    const input = {
      packages: [
        { tracking: 'A', name: 'Alice', unused: undefined },
        { tracking: 'B', name: 'Bob', unused: undefined },
      ],
    };
    const cleaned = cleanForFirestore(input);
    expect(cleaned).toEqual({
      packages: [
        { tracking: 'A', name: 'Alice' },
        { tracking: 'B', name: 'Bob' },
      ],
    });
    expect('unused' in cleaned.packages[0]).toBe(false);
  });
});
