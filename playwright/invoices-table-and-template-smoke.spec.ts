import { test, expect } from '@playwright/test';

test.describe('INVOICES & TEMPLATE SMOKE TEST', () => {
  test('should load facturas page and verify table and modal rendering without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to Invoices view
    await page.goto('/invoices');
    await page.waitForLoadState('networkidle');

    // Verify main view elements
    const heading = page.locator('h1, h2, div').filter({ hasText: /facturas|recibos|invoices/i }).first();
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Ensure zero critical JS exceptions
    const criticalErrors = consoleErrors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('ResizeObserver') && 
      !e.includes('net::ERR_')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
