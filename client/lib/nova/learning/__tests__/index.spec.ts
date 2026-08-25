import { describe, it, expect } from 'vitest';
import * as learning from '../index';

describe('Nova Learning Module entrypoint', () => {
  it('should export all learning and memory services', () => {
    expect(learning.createSession).toBeDefined();
    expect(learning.appendSessionMessages).toBeDefined();
    expect(learning.getRecentSession).toBeDefined();
    expect(learning.saveManifestRecord).toBeDefined();
    expect(learning.getRecentManifests).toBeDefined();
    expect(learning.getManifestsThisMonth).toBeDefined();
    expect(learning.getAgentContext).toBeDefined();
    expect(learning.updateAgentContext).toBeDefined();
    expect(learning.invalidateAgentContextCache).toBeDefined();
    expect(learning.saveConversationTurn).toBeDefined();
    expect(learning.getRecentConversationTurns).toBeDefined();
    expect(learning.recordManifestLearning).toBeDefined();
  });
});
