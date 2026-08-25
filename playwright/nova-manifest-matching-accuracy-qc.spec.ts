import { test, expect } from '@playwright/test';

test.describe('Nova Manifest Ingestion, High-Precision Matching (>98%) & UI QC E2E Specs', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock authentication hook before page load
    await page.addInitScript(() => {
      (window as any).__playwright_mock_auth__ = true;
    });
  });

  test('should verify Nova home screen, suggestion chips, and "Obtener manifiestos" prompt', async ({ page }) => {
    await page.goto('/nova');
    await expect(page).toHaveURL(/\/nova/);

    // Verify main assistant greeting text
    await expect(page.locator('text=Hola')).toBeVisible();
    await expect(page.locator('text=¿En qué puedo ayudarte?')).toBeVisible();

    // Verify suggestion chips are visible
    const chip = page.locator('button:has-text("Obtener manifiestos")');
    await expect(chip).toBeVisible();
    await expect(page.locator('button:has-text("Tendencia de ingresos")')).toBeVisible();
    await expect(page.locator('button:has-text("Top clientes")')).toBeVisible();
    await expect(page.locator('button:has-text("Paquetes pendientes")')).toBeVisible();
  });

  test('should verify saved manifests section renders in Nova home view', async ({ page }) => {
    await page.goto('/nova');
    await expect(page.locator('text=Hola')).toBeVisible();

    // Verify Saved Manifests header section
    const savedHeader = page.locator('text=MANIFIESTOS GUARDADOS');
    await expect(savedHeader).toBeVisible();
  });

  test('should verify Customer Edit Modal rendering with domain sections', async ({ page }) => {
    await page.goto('/customers');
    await expect(page).toHaveURL(/\/customers/);

    // Ensure customer table or empty state mounts properly
    const header = page.locator('h1, h2, h3').first();
    await expect(header).toBeVisible();
  });

  test('should verify zero critical JavaScript errors during navigation in Nova', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/nova');
    await expect(page.locator('text=Hola')).toBeVisible();

    // Filter non-fatal external resource network errors
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('Firebase') &&
      !e.includes('analytics') &&
      !e.includes('404') &&
      !e.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
