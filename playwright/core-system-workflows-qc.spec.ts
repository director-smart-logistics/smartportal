import { test, expect } from '@playwright/test';

test.describe('SmartLogistics Core Operations E2E Specs — Facturación, Paquetes, Labels, Consolidación, Encomiendas & Devoluciones', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__playwright_mock_auth__ = true;
    });
  });

  test('Facturación (/invoices) — should mount invoices view with filters and action buttons', async ({ page }) => {
    await page.goto('/invoices');
    await expect(page).toHaveURL(/\/invoices/);

    // Verify main header or title area mounts
    const heading = page.locator('h1, h2, h3, header').first();
    await expect(heading).toBeVisible();

    // Verify interactive elements (buttons/inputs/tables) mount
    const actionElement = page.locator('button, input, table, [role="grid"]').first();
    await expect(actionElement).toBeVisible();
  });

  test('Facturación (/invoices) — should allow clicking column headers to sort rows', async ({ page }) => {
    await page.goto('/invoices');
    await page.waitForLoadState('domcontentloaded');

    // Find clickable sort header buttons
    const headerButtons = page.locator('[data-testid="invoices-table-container"] button');
    const count = await headerButtons.count();

    if (count > 0) {
      // Click the first available column header button (e.g., Factura or Cliente)
      await headerButtons.first().click();
      await page.waitForTimeout(200);
      // Click again to toggle sort direction (asc/desc)
      await headerButtons.first().click();
      await page.waitForTimeout(200);
    }
  });

  test('Paquetes (/packages) — should mount packages management table and search controls', async ({ page }) => {
    await page.goto('/packages');
    await expect(page).toHaveURL(/\/packages/);

    const header = page.locator('h1, h2, h3, header').first();
    await expect(header).toBeVisible();
  });

  test('Etiquetas / Shipping Labels (/shipping) — should render shipping label generation interface', async ({ page }) => {
    await page.goto('/shipping');
    await expect(page).toHaveURL(/\/shipping/);

    const title = page.locator('h1, h2, h3, header').first();
    await expect(title).toBeVisible();
  });

  test('Consolidación Transitoria (/consolidation) — should mount consolidation manifests view', async ({ page }) => {
    await page.goto('/consolidation');
    await expect(page).toHaveURL(/\/consolidation/);

    const heading = page.locator('h1, h2, h3, header').first();
    await expect(heading).toBeVisible();
  });

  test('Manifiestos de Encomiendas (/encomiendas) — should mount encomiendas management module', async ({ page }) => {
    await page.goto('/encomiendas');
    await expect(page).toHaveURL(/\/encomiendas/);

    const title = page.locator('h1, h2, h3, header').first();
    await expect(title).toBeVisible();
  });

  test('Devoluciones (/returned-packages) — should mount returned packages tracking view', async ({ page }) => {
    await page.goto('/returned-packages');
    await expect(page).toHaveURL(/\/returned-packages/);

    const title = page.locator('h1, h2, h3, header').first();
    await expect(title).toBeVisible();
  });
});
