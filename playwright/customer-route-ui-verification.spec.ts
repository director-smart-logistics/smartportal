/**
 * customer-route-ui-verification.spec.ts
 *
 * Playwright E2E — Verifica la ruta de cada cliente del triple_verification_report.csv
 * conectándose vía CDP al Chrome ya autenticado en http://localhost:9222.
 *
 * Optimizado para máxima velocidad:
 * - Waits mínimos (100-200ms)
 * - fill directo sin clear previo
 * - Re-navigate solo si el input desaparece
 * - Video grabado automáticamente (playwright-report/)
 */

import { test, expect, chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Load 290 customers from verification report ──────────────────────────────

interface CustomerToVerify {
  slCode: string;
  nombre: string;
  rutaEsperada: string;
}

function loadVerificationData(): CustomerToVerify[] {
  const candidatePaths = [
    path.join(__dirname, '../triple_verification_report.csv'),
    path.join(process.cwd(), 'triple_verification_report.csv'),
    '/Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/triple_verification_report.csv',
  ];
  const reportPath = candidatePaths.find(p => fs.existsSync(p));
  if (!reportPath) {
    return [];
  }
  try {
    const lines = fs.readFileSync(reportPath, 'utf8').split('\n').filter(Boolean);
    const customers: CustomerToVerify[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols: string[] = [];
      let cur = ''; let inQ = false;
      for (const ch of lines[i]) {
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { cols.push(cur); cur = ''; continue; }
        cur += ch;
      }
      cols.push(cur);
      if (cols.length >= 3 && cols[0] && cols[2]) {
        customers.push({
          slCode: cols[0].trim(),
          nombre: cols[1].trim(),
          rutaEsperada: cols[2].trim(),
        });
      }
    }
    return customers;
  } catch {
    return [];
  }
}

const CUSTOMERS = loadVerificationData();

// ─── Test ─────────────────────────────────────────────────────────────────────

test.describe('Verificación UI — Rutas de Clientes', () => {

  test(`Verificar ruta UI uno a uno — ${CUSTOMERS.length} clientes`, async ({ browser }, testInfo) => {
    if (CUSTOMERS.length === 0) {
      test.skip(true, 'triple_verification_report.csv no está presente en este entorno (ej. CI)');
      return;
    }

    // ── Connect to real Chrome with Firebase session via CDP ──────────────
    let page: any;
    let context: any;
    let cdpBrowser: any;

    try {
      cdpBrowser = await chromium.connectOverCDP('http://localhost:9222');
      const contexts = cdpBrowser.contexts();
      context = contexts[0] || await cdpBrowser.newContext();
      const pages = context.pages();
      page = pages.find((p: any) => p.url().includes('localhost:5173')) || pages[0] || await context.newPage();
      console.log(`\n🔗 CDP conectado — página actual: ${page.url()}\n`);
    } catch {
      // Fallback: Playwright browser with mock auth
      console.log('\n⚠️  CDP no disponible — usando mock auth\n');
      context = await browser.newContext({ recordVideo: { dir: 'playwright-videos/' } });
      page = await context.newPage();
      await page.addInitScript(() => { (window as any).__playwright_mock_auth__ = true; });
    }

    // ── Navigate to /customers ────────────────────────────────────────────
    if (!page.url().includes('/customers')) {
      await page.goto('http://localhost:5173/customers');
    }

    await page.waitForSelector('[data-testid="customer-search-input"]', { timeout: 20_000 });

    const searchInput = page.locator('[data-testid="customer-search-input"]');

    // ── Results accumulator ───────────────────────────────────────────────
    const results: {
      slCode: string; nombre: string; rutaEsperada: string;
      cardStatus: 'PASS' | 'FAIL' | 'NOT_FOUND';
      detailStatus: 'PASS' | 'FAIL' | 'SKIP';
      actualRutaInCard: string | null;
      actualRutaInDetail: string | null;
      note: string;
    }[] = [];

    let pass = 0, fail = 0, notFound = 0;

    for (let idx = 0; idx < CUSTOMERS.length; idx++) {
      const c = CUSTOMERS[idx];

      // Live title so operator sees progress in the Chrome window
      await page.evaluate(({ n, t, sl, nom }: any) => {
        document.title = `[${n}/${t}] ${sl} — ${nom}`;
      }, { n: idx + 1, t: CUSTOMERS.length, sl: c.slCode, nom: c.nombre.split(' ')[0] }).catch(() => {});

      // ── Search: fill directly (faster than clear+fill) ─────────────────
      await searchInput.fill(c.slCode);

      // ── Wait for card ──────────────────────────────────────────────────
      const card = page.locator(`[data-testid="customer-result-${c.slCode}"]`);
      const cardFound = await card.waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true).catch(() => false);

      if (!cardFound) {
        notFound++;
        fail++;
        results.push({
          slCode: c.slCode, nombre: c.nombre, rutaEsperada: c.rutaEsperada,
          cardStatus: 'NOT_FOUND', detailStatus: 'SKIP',
          actualRutaInCard: null, actualRutaInDetail: null,
          note: `❌ Card no apareció`,
        });
        // Recover: re-navigate only if input is stale
        const inputOk = await searchInput.isVisible().catch(() => false);
        if (!inputOk) {
          await page.goto('http://localhost:5173/customers');
          await page.waitForSelector('[data-testid="customer-search-input"]', { timeout: 10_000 });
        }
        continue;
      }

      // ── Check route badge in card ──────────────────────────────────────
      const rutaBadge = card.locator(`[data-testid="customer-ruta-badge-${c.slCode}"]`);
      let actualRutaInCard: string | null = null;
      let cardStatus: 'PASS' | 'FAIL' | 'NOT_FOUND' = 'FAIL';

      const badgeVisible = await rutaBadge.waitFor({ state: 'visible', timeout: 2_000 })
        .then(() => true).catch(() => false);

      if (badgeVisible) {
        actualRutaInCard = (await rutaBadge.getAttribute('data-ruta')) || (await rutaBadge.textContent()) || '';
        cardStatus = actualRutaInCard.trim() === c.rutaEsperada.trim() ? 'PASS' : 'FAIL';
      } else {
        // Try any badge in the card
        const anyBadge = card.locator('[data-testid^="customer-ruta-badge-"]');
        if (await anyBadge.count() > 0) {
          actualRutaInCard = (await anyBadge.first().getAttribute('data-ruta')) || (await anyBadge.first().textContent());
        }
        cardStatus = 'FAIL';
      }

      if (cardStatus === 'PASS') pass++;

      // ── Open detail modal (eye button) ────────────────────────────────
      let detailStatus: 'PASS' | 'FAIL' | 'SKIP' = 'SKIP';
      let actualRutaInDetail: string | null = null;

      const eyeBtn = page.locator(`[data-testid="btn-view-detail-${c.slCode}"]`);
      if (await eyeBtn.count() > 0) {
        await eyeBtn.click();
        await page.waitForTimeout(300); // minimal wait for modal animation

        // Check badge in modal (last occurrence = modal badge)
        const modalBadge = page.locator(`[data-testid="customer-ruta-badge-${c.slCode}"]`).last();
        const modalBadgeOk = await modalBadge.waitFor({ state: 'visible', timeout: 2_000 })
          .then(() => true).catch(() => false);

        if (modalBadgeOk) {
          actualRutaInDetail = (await modalBadge.getAttribute('data-ruta')) || (await modalBadge.textContent());
          detailStatus = (actualRutaInDetail || '').trim() === c.rutaEsperada.trim() ? 'PASS' : 'FAIL';
        } else {
          // Fallback: search body text
          const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
          if (bodyText.includes(c.rutaEsperada)) {
            actualRutaInDetail = c.rutaEsperada + ' (body)';
            detailStatus = 'PASS';
          } else {
            detailStatus = 'FAIL';
          }
        }

        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);

        // If the input disappeared after modal close, recover
        const inputOk = await searchInput.isVisible().catch(() => false);
        if (!inputOk) {
          await page.goto('http://localhost:5173/customers');
          await page.waitForSelector('[data-testid="customer-search-input"]', { timeout: 10_000 });
        }
      }

      if (cardStatus !== 'PASS') fail++;

      results.push({
        slCode: c.slCode, nombre: c.nombre, rutaEsperada: c.rutaEsperada,
        cardStatus, detailStatus, actualRutaInCard, actualRutaInDetail,
        note: cardStatus === 'PASS'
          ? `✅ Card="${actualRutaInCard}" Modal="${actualRutaInDetail || 'N/A'}"`
          : `❌ Esperada="${c.rutaEsperada}" | Actual="${actualRutaInCard || 'no badge'}"`,
      });

      if ((idx + 1) % 25 === 0 || idx === CUSTOMERS.length - 1) {
        console.log(`[${idx + 1}/${CUSTOMERS.length}] ✅ ${pass} PASS | ❌ ${fail} FAIL (${notFound} no encontrados)`);
      }
    }

    // ── Write CSV report ──────────────────────────────────────────────────
    const passRate = Math.round((pass / CUSTOMERS.length) * 100);
    const csvLines = [
      'SL_Code,Nombre,Ruta_Esperada,Card_Status,Detail_Status,Ruta_En_Card,Ruta_En_Modal,Nota',
      ...results.map(r => [
        `"${r.slCode}"`, `"${r.nombre}"`, `"${r.rutaEsperada}"`,
        `"${r.cardStatus}"`, `"${r.detailStatus}"`,
        `"${(r.actualRutaInCard || '').replace(/"/g, "'")}"`,
        `"${(r.actualRutaInDetail || '').replace(/"/g, "'")}"`,
        `"${r.note.replace(/"/g, "'")}"`,
      ].join(',')),
    ];

    const csvPath = '/Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/playwright_route_verification_result.csv';
    fs.writeFileSync(csvPath, csvLines.join('\n'));
    await testInfo.attach('reporte-ui.csv', { body: csvLines.join('\n'), contentType: 'text/csv' });

    const failedList = results.filter(r => r.cardStatus !== 'PASS');
    const summary = [
      '='.repeat(65),
      'RESUMEN — VERIFICACIÓN UI RUTAS DE CLIENTES',
      '='.repeat(65),
      `Total:            ${CUSTOMERS.length}`,
      `✅ PASS:          ${pass} (${passRate}%)`,
      `❌ FAIL:          ${fail}  (${notFound} no encontrados en búsqueda)`,
      '',
      ...(failedList.length > 0
        ? ['Clientes fallidos:', ...failedList.slice(0, 20).map(r => `  ❌ ${r.slCode} | Esperada="${r.rutaEsperada}" | UI="${r.actualRutaInCard || 'ninguna'}"` )]
        : ['🟢 TODOS muestran la ruta correcta en el UI']),
      '='.repeat(65),
    ].join('\n');

    console.log('\n' + summary);
    await testInfo.attach('resumen.txt', { body: summary, contentType: 'text/plain' });

    expect(passRate, `Pass rate ${passRate}% < 90%`).toBeGreaterThanOrEqual(90);
  });
});
