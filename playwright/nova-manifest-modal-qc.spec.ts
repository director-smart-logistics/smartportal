import { test, expect } from '@playwright/test';

test.describe('Nova Manifest Modal QC, Auto-Save Immunity & Visual Specs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__playwright_mock_auth__ = true;
    });
  });

  test('should mount Nova workspace without layout distortion or console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/nova');
    await expect(page).toHaveURL(/\/nova/);

    // Verify main assistant greeting text renders
    await expect(page.locator('text=Hola')).toBeVisible();

    // Verify no unhandled critical console errors occurred during render
    const criticalErrors = consoleErrors.filter(e => 
      !e.includes('Firebase') && 
      !e.includes('analytics') && 
      !e.includes('404') && 
      !e.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('should render main input prompt and suggestion chips properly', async ({ page }) => {
    await page.goto('/nova');
    await expect(page.locator('text=Hola')).toBeVisible();
    
    // Check main prompt input box
    const promptInput = page.locator('textarea, input[type="text"]').first();
    await expect(promptInput).toBeVisible();

    // Check action suggestion chips
    await expect(page.locator('text=Obtener manifiestos')).toBeVisible();
    await expect(page.locator('text=Top clientes')).toBeVisible();
  });

  test('should verify auto-save indicator is NOT active on initial workspace load', async ({ page }) => {
    await page.goto('/nova');
    await expect(page.locator('text=Hola')).toBeVisible();

    // Assert that "Guardando..." is NOT present on workspace open
    const savingIndicator = page.locator('text=Guardando...');
    await expect(savingIndicator).not.toBeVisible();
  });

  test('should match baseline visual layout of suggestion chips container', async ({ page }) => {
    await page.goto('/nova');
    await expect(page.locator('text=Hola')).toBeVisible();

    const chipsContainer = page.locator('.flex.flex-wrap.gap-2').first();
    await expect(chipsContainer).toBeVisible();

    // Verify chips layout and buttons structurally
    const chips = chipsContainer.locator('button');
    const count = await chips.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Snapshot match when running in local macOS baseline environment
    if (!process.env.CI) {
      await expect(chipsContainer).toHaveScreenshot('nova-suggestions-chips.png', {
        maxDiffPixelRatio: 0.05,
      });
    }
  });
});
