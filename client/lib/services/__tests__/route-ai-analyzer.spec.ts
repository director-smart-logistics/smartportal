import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isDashboardAIEnabled,
  disableDashboardAI,
  analyzeDashboardImage,
} from '../route-ai-analyzer';

describe('route-ai-analyzer — Dashboard Vision Guard & Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly reports enabled state for dashboard vision', () => {
    expect(typeof isDashboardAIEnabled()).toBe('boolean');
  });

  it('disables dashboard AI vision when disableDashboardAI is triggered', () => {
    disableDashboardAI('Test vision failure simulation');
    expect(isDashboardAIEnabled()).toBe(false);
  });

  it('analyzeDashboardImage returns safe fallback object without throwing when disabled', async () => {
    disableDashboardAI('Forced inactive');
    const result = await analyzeDashboardImage('data:image/jpeg;base64,mockimagedata123');

    expect(result).toBeDefined();
    expect(result.confidence).toBe(0);
    expect(result.kmReading).toBeUndefined();
    expect(result.fuelLevel).toBeUndefined();
    expect(result.fuelLevelPercent).toBeUndefined();
    expect(result.notes).toContain('inactivo');
  });
});
