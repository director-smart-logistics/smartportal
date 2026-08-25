import { describe, it, expect } from 'vitest';
import * as matching from '../index';

describe('Nova Matching Module entrypoint', () => {
  it('should export all customer matching and learning services', () => {
    expect(matching.findCustomerMatch).toBeDefined();
    expect(matching.batchFindCustomerMatches).toBeDefined();
    expect(matching.batchFindCustomerMatchesWithAI).toBeDefined();
    expect(matching.searchCustomersLocal).toBeDefined();
    expect(matching.invalidateCustomerCache).toBeDefined();
    expect(matching.saveMatchFeedback).toBeDefined();
    expect(matching.loadLearnedMatches).toBeDefined();
    expect(matching.lookupLearned).toBeDefined();
    expect(matching.getLearnedCandidatesForAI).toBeDefined();
    expect(matching.updateCustomerRuta).toBeDefined();
    expect(matching.updateCustomerConsolidation).toBeDefined();
  });
});
