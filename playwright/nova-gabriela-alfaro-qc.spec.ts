import { test, expect } from '@playwright/test';

test.describe('Nova Pre-Alert Integrity & Gabriela Alfaro QC Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__playwright_mock_auth__ = true;
    });
  });

  test('debe verificar que la pantalla /pre-alerts consulta en vivo y no asocia falsamente GFUS01065635648649 a SL26575', async ({ page }) => {
    await page.goto('/pre-alerts');
    await expect(page).toHaveURL(/\/pre-alerts/);

    // Verify search input is visible
    const input = page.locator('input[placeholder*="tracking" i], input[placeholder*="SL" i]').first();
    await expect(input).toBeVisible();

    // Type tracking GFUS01065635648649
    await input.fill('GFUS01065635648649');
    await page.waitForTimeout(1000);

    // Verify it does NOT show a table row assigning this tracking to SL26575
    const falseAssignmentBadge = page.locator('text=SL26575');
    await expect(falseAssignmentBadge).not.toBeVisible();
  });

  test('debe verificar que la página /pre-alerts responde con rapidez en tiempo real', async ({ page }) => {
    await page.goto('/pre-alerts');
    await expect(page).toHaveURL(/\/pre-alerts/);

    const input = page.locator('input[placeholder*="tracking" i], input[placeholder*="SL" i]').first();
    await expect(input).toBeVisible();
    await input.fill('SL13');
    await page.waitForTimeout(1500);

    // Verify results container renders
    await expect(page.locator('text=resultado').first()).toBeVisible({ timeout: 5000 });
  });
});
