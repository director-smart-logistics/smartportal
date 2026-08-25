/**
 * playwright/auth.setup.ts
 *
 * Paso 1 del flujo de tests: captura el estado de autenticación Firebase
 * del navegador donde el usuario ya está logueado.
 *
 * Abre el navegador en http://localhost:5173, espera que el usuario
 * esté en /dashboard (autenticado), guarda el storageState (localStorage +
 * cookies) en playwright/.auth/user.json, y cierra.
 *
 * Ejecutar UNA sola vez (o cuando expire la sesión):
 *   npx playwright test playwright/auth.setup.ts --headed
 */

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('capturar sesión Firebase autenticada', async ({ page }) => {
  // Navega a la app
  await page.goto('/');

  // Si ya está en /dashboard, está logueado
  const currentUrl = page.url();

  if (currentUrl.includes('/login') || currentUrl.includes('/login')) {
    // El usuario necesita loguearse manualmente
    console.log('\n⚠️  NO estás logueado en localhost:5173');
    console.log('   Por favor, haz login con Google en la ventana del browser.');
    console.log('   El script esperará hasta 120 segundos...\n');

    // Esperar hasta que el usuario haga login y llegue a /dashboard
    await page.waitForURL('**/dashboard**', { timeout: 120_000 });
  }

  // Verificar que estamos autenticados (en dashboard o cualquier ruta protegida)
  await expect(page).not.toHaveURL(/.*login.*/);

  // Guardar el estado completo (localStorage con Firebase Auth tokens, cookies)
  await page.context().storageState({ path: AUTH_FILE });

  console.log(`\n✅ Sesión Firebase guardada en: ${AUTH_FILE}`);
  console.log('   Ahora puedes correr los tests de verificación de clientes.\n');
});
