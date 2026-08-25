import { test, expect } from '@playwright/test';

test.describe('Nova Chatbot and Manifest Processor E2E Specs', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock authentication hook before page load
    await page.addInitScript(() => {
      (window as any).__playwright_mock_auth__ = true;
    });
  });

  test('should load the chatbot workspace and show empty state with suggestions', async ({ page }) => {
    // Navigate to the Nova page
    await page.goto('/nova');

    // Verify the page does not crash and renders the main layout
    await expect(page).toHaveURL(/\/nova/);

    // Verify the greeting and assistant hero texts are visible
    await expect(page.locator('text=Hola')).toBeVisible();
    await expect(page.locator('text=¿En qué puedo ayudarte?')).toBeVisible();

    // Verify suggestion chips are loaded
    await expect(page.locator('text=Obtener manifiestos')).toBeVisible();
    await expect(page.locator('text=Top clientes')).toBeVisible();
    await expect(page.locator('text=Paquetes pendientes')).toBeVisible();
  });

  test('should match baseline visual layout for suggestions area', async ({ page }) => {
    // Navigate to the Nova page
    await page.goto('/nova');

    // Locate the suggestions chips grid
    const chipsContainer = page.locator('.flex.flex-wrap.gap-2').first();
    await expect(chipsContainer).toBeVisible();

    // Verify chips layout and buttons structurally
    const chips = chipsContainer.locator('button');
    const count = await chips.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Take a screenshot of the container and verify against baseline in local macOS environment
    if (!process.env.CI) {
      await expect(chipsContainer).toHaveScreenshot('nova-suggestions-chips.png', {
        maxDiffPixelRatio: 0.05,
      });
    }
  });
});
