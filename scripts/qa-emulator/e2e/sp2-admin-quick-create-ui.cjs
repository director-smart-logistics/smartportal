// Admin panel → Usuarios → "Crear usuario rápido" modal, real UI on the QA emulator:
//   1. the cédula is marked required and the modal refuses to create without it
//   2. "Enviar enlace al cliente" hides the password field and, after creating, shows the one-time link with
//      "Copiar mensaje" and "Enviar por WhatsApp"
// Needs sp2-admin-quick-create.cjs first (creates the QA admin qc-admin@prueba.local).
// Run: NODE_PATH=<playwright dir>/node_modules [SP2_APP=http://localhost:5175/] node scripts/qa-emulator/e2e/sp2-admin-quick-create-ui.cjs
const { chromium } = require('playwright');
const APP = (process.env.SP2_APP || 'http://localhost:5175/').replace(/\/$/, '');
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = String(Date.now()).slice(-6);

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  await page.goto(APP + '/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  await page.evaluate(async () => { const { authService } = await import('/src/infrastructure/firebase/auth-service.ts'); await authService.signInWithEmail({ email: 'qc-admin@prueba.local', password: 'Prueba1234!' }); });
  await page.goto(APP + '/slm/users', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Herramientas/ }).click({ timeout: 20000 }).catch(() => {});
  const opened = await page.getByTestId('users-quick-create-btn').waitFor({ timeout: 15000 }).then(() => true, () => false);
  check('0. Panel admin → Clientes → Herramientas → "Crear Cliente Rápido"', opened);
  if (!opened) { await b.close(); console.log(`\n${ok}/${n}`); process.exit(1); }
  await page.getByTestId('users-quick-create-btn').click();
  await page.getByTestId('quick-create-raw-input').fill(`Nombre: Ana Modal Prueba\nCorreo: qc-ui-${t}@prueba.local\nTeléfono: 8888-1300`);
  await page.getByTestId('quick-create-parse-btn').click();
  await page.getByTestId('quick-create-submit-btn').waitFor({ timeout: 30000 });
  const label = await page.getByText('Cédula / DIMEX').first().innerText().catch(() => '');
  const hint = await page.getByText('Obligatoria: evita cuentas duplicadas').first().isVisible().catch(() => false);
  // fill what the parser may have missed
  const inputByLabel = (l) => page.locator('label', { hasText: l }).locator('xpath=..').locator('input').first();
  if (!(await inputByLabel('Nombre').inputValue().catch(() => ''))) await inputByLabel('Nombre').fill('Ana Modal');
  if (!(await inputByLabel('Apellidos').inputValue().catch(() => ''))) await inputByLabel('Apellidos').fill('Prueba');
  if (!(await inputByLabel('Email').inputValue().catch(() => ''))) await inputByLabel('Email').fill(`qc-ui-${t}@prueba.local`);
  if (!(await inputByLabel('Teléfono').inputValue().catch(() => ''))) await inputByLabel('Teléfono').fill('88881300');
  await page.getByTestId('quick-create-access-link').click();
  const pwHidden = !(await page.getByTestId('quick-create-password').isVisible().catch(() => false));
  const disabledWithoutDni = await page.getByTestId('quick-create-submit-btn').isDisabled();
  check('1. Cédula marcada obligatoria; sin ella no deja crear', label.includes('*') && hint && disabledWithoutDni, `etiqueta "${label}" · aviso ${hint} · botón deshabilitado ${disabledWithoutDni}`);
  await page.getByTestId('quick-create-dni').fill(`3${t.slice(-5)}777`.slice(0, 9));
  await page.waitForTimeout(800);
  check('2. "Enviar enlace al cliente" oculta la contraseña', pwHidden);
  await page.getByTestId('quick-create-submit-btn').click();
  const box = await page.getByTestId('quick-create-link-box').waitFor({ timeout: 30000 }).then(() => true, () => false);
  const link = box ? await page.getByTestId('quick-create-link').innerText() : '';
  const wa = box ? await page.getByTestId('quick-create-link-whatsapp').getAttribute('href') : '';
  const sl = await page.getByTestId('quick-create-success-sl').innerText().catch(() => '');
  check('3. Al crear muestra el código SL y el enlace con "Copiar" y "WhatsApp"', box && /oobCode=/.test(link) && /wa\.me\/50688881300/.test(wa || '') && /^SL\d+$/.test(sl), `${sl} · wa ${String(wa).slice(0, 40)}`);
  await b.close();
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
