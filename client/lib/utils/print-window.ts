/**
 * print-window.ts
 *
 * Isolated print service that opens a dedicated browser window for printing.
 * This approach is intentionally decoupled from the main document's CSS so that
 * global @media print rules in global.css (e.g. `body * { visibility: hidden }`)
 * cannot interfere with label or document printing.
 *
 * Usage:
 *   printInWindow(htmlContent, 'Title', layoutCss, { pageSize, pageMargin });
 */

export interface PrintWindowOptions {
  pageSize?: string;
  pageMargin?: string;
}

/**
 * Opens a new browser window, injects Tailwind CSS links from the current
 * document (same-origin, no CORS issues), writes the provided HTML content
 * and layout CSS, then triggers print + close.
 *
 * @param htmlContent  Inner HTML of the content to print (already-rendered DOM).
 * @param title        <title> shown in the print dialog.
 * @param layoutCss    Additional CSS (layout, typography, @page rules) scoped
 *                     to this print window only — no !important needed since
 *                     there are zero conflicting rules.
 * @param options      Optional page size / margin overrides.
 */
export function printInWindow(
  htmlContent: string,
  title: string,
  layoutCss: string,
  options: PrintWindowOptions = {}
): void {
  const { pageSize = "letter", pageMargin = "0.5in" } = options;

  const win = window.open("", "_blank");
  if (!win) {
    console.warn("[print-window] Popup blocked — enable pop-ups to print.");
    return;
  }

  // ── Collect CSS from the current document ────────────────────────────────
  // In Vite production builds, CSS is bundled into <link rel="stylesheet">.
  // In Vite dev mode, CSS is injected as <style> tags via JS HMR modules.
  // We copy BOTH so this works in localhost:5173 AND in the deployed site.
  const linkedSheets = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
  )
    .map((el) => el.outerHTML)
    .join("\n");

  const inlineSheets = Array.from(
    document.head.querySelectorAll<HTMLStyleElement>("style")
  )
    .map((el) => `<style>${el.textContent ?? ""}</style>`)
    .join("\n");

  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${linkedSheets}
  ${inlineSheets}
  <style>
    /* ── Baseline reset for the isolated print window ─────────────────── */
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #fff; }

    /* ── Ensure colors print correctly ────────────────────────────────── */
    * {
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }

    /* ── Override global.css @media print { body * { visibility:hidden } }
       that exists in the copied stylesheets. Without this the labels would
       print blank even in the isolated window. ────────────────────────── */
    @media print {
      body * { visibility: visible !important; }
    }

    /* ── Page size (can be overridden by layoutCss @page rule) ────────── */
    @page { size: ${pageSize}; margin: ${pageMargin}; }

    /* ── Caller-provided layout / typography rules ─────────────────────── */
    ${layoutCss}
  </style>
</head>
<body>${htmlContent}</body>
</html>`);

  win.document.close();

  const doPrint = (): void => {
    win.focus();
    win.print();
    win.close();
  };

  if (win.document.readyState === "complete") {
    setTimeout(doPrint, 300);
  } else {
    win.addEventListener("load", () => setTimeout(doPrint, 300));
    setTimeout(doPrint, 3000); // absolute fallback
  }
}

/* ── Pre-built CSS constants ───────────────────────────────────────────────── */

/**
 * Layout CSS for bulk encomienda labels:
 * landscape letter, 2 labels per page, dashed cut guides.
 */
export const BULK_LABEL_LAYOUT_CSS = `
  /* ── Page ─────────────────────────────────────────────────────────── */
  @page { size: letter landscape; margin: 0.75in 0.5in 0.65in 0.5in; }

  /* ── One landscape page per row ────────────────────────────────────── */
  /* Usable height: 8.5in − 0.75in (top) − 0.65in (bottom) = 7.1in     */
  .enc-bulk-page-row {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 7.1in;
    box-sizing: border-box;
    padding-bottom: 0.65in;
    break-after: page;
    page-break-after: always;
    break-inside: avoid;
    page-break-inside: avoid;
    border-bottom: 2px dashed #aaa;
  }
  .enc-bulk-page-row:last-child {
    break-after: avoid;
    page-break-after: avoid;
  }

  /* ── Each label: 50% of landscape width (≈ 5 in each) ─────────────── */
  .enc-bulk-label-item {
    flex: 0 0 50%;
    width: 50%;
    height: 100%;
    min-width: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .enc-bulk-label-item:first-child {
    padding-right: 0.65in;
    border-right: 2px dashed #aaa;
  }
  .enc-bulk-label-item:last-child {
    padding-left: 0.65in;
  }

  /* ── Label card fills its slot fully ───────────────────────────────── */
  .enc-label-body {
    flex: 1;
    width: 100%;
    max-width: none;
    display: flex;
    flex-direction: column;
  }
  .enc-label-address-section { flex-grow: 1; }

  /* ── Typography (scaled for 5-in-wide columns) ─────────────────────── */
  .enc-label-header { padding: 0.65rem 0.8rem; }
  .enc-label-header > div:last-child {
    margin-top: 0.45rem;
    padding: 0.45rem 0.65rem;
  }
  .enc-label-logo { height: 2rem; }
  .enc-label-header h1 { font-size: 1.2rem; line-height: 1.15; }
  .enc-label-sl-code { font-size: 2.25rem; }
  .enc-label-header .grid { grid-template-columns: 1fr; gap: 0.2rem; }
  .enc-label-tracking-num { font-size: 0.75rem; line-height: 1.4; }
  .enc-label-address-section { padding: 0.65rem 0.8rem; }
  .enc-label-address-section > .grid { gap: 0.75rem; }
  .enc-label-recipient { font-size: 1.05rem; margin-bottom: 0.3rem; }
  .enc-label-qr { width: 3.25rem; height: 3.25rem; }
  .enc-label-service-box { height: auto; min-height: 3rem; padding: 0.5rem; }
  .enc-label-service-name { font-size: 1.15rem; }
  .enc-label-body > div:nth-child(3) { padding: 0.5rem; }
  .enc-label-body > div:last-child { padding: 0.35rem; }
`;

/**
 * Layout CSS for a single encomienda label (portrait letter).
 */
export const SINGLE_LABEL_LAYOUT_CSS = `
  @page { size: letter; margin: 0.5in; }
  .enc-label-body {
    max-width: 8.5in;
    margin: 0 auto;
  }
`;
