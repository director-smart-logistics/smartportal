# Traspaso — Pre-alertas SP2 y match de Nova (SP1) · 2026-09-25

Documento para continuar en una sesión nueva sin perder contexto. Leer completo antes de tocar
código.

---

## 0. Reglas del usuario (no negociables)

1. **Cero regresiones.** Cambios quirúrgicos y minuciosos, uno por hallazgo, cada uno con su
   prueba. Nova es crítico: un falso positivo termina en factura y correo a otro cliente, y en
   paquetes duplicados en SP2.
2. **El `slCode` es la identidad del cliente.** Nunca se deriva del `userId` ni del ID del
   documento.
3. **No borrar nada de `pre_alerts`.**
4. **Nada de `set()` ni `merge` que mezcle datos sin control.** Escrituras atómicas (`create`,
   transacciones) y con condiciones.
5. **Producción no se toca para probar.** Todo `localhost` de SP1 y SP2 apunta a producción:
   probar **solo** en el emulador combinado (§4).
6. **No desplegar ni subir (push) sin aprobación explícita.** En producción solo se prueba con la
   cuenta QA del usuario (`SL25001`). Las credenciales las da el usuario en el chat; **nunca
   guardarlas**.
7. Mensajes al cliente cortos y claros. Responder al usuario **en español**.

---

## 1. Qué ya está en producción (SP2, smart-portal-2)

`main` = `48e423f` (hosting `1.0.2115`), desplegado el 25-sep. Detalle en
`smart-portal-2/docs/audits/PREALERT_FIX_REPORT_2026-09-24.md`.

- **Un solo punto de creación de pre-alertas:** `createPreAlert()` en
  `src/functions/src/prealert-register.ts`.
  - Transacción + `create`; ID `TRACKING_SLCODE`.
  - Dueño = `slCode`.
  - Ventana de **120 días** (pendiente bajarla a **90**, §6).
  - Lo usan `slSmartPreAlert` (formulario) y `slCreatePreAlert` (dashboard).
- **Regla de tracking compartida:** `src/shared/prealert-tracking-check.ts` y su copia en
  functions, con paridad verificada por `scripts/check-shared-sync.cjs`.
  - Solo letras y números.
  - Órdenes de compra (Amazon 3-7-7 y Shein `GSU…`) → *"Eso es un número de orden. Usa el
    tracking de tu paquete."*
  - Se aplica en el **paso 1** de los dos formularios del home y en el dashboard.
- **Búsqueda en reversa en SP2:**
  - código de barras (20+) que **termina** con lo que escribió el cliente (12+);
  - FedEx 34 → últimos 12;
  - paquete sin `slCode` → dueño por `userId`.
- **Sync de facturas SP1→SP2:** los paquetes creados por factura llevan `slCode`, y
  `sp1-tracking-match` busca también por los **últimos 12** de un código numérico largo.
- **Permiso Cloud Run:** `slCreatePreAlert` necesita invocador `allUsers` (ya aplicado, y declarado
  en código con `invoker: 'public'`). El emulador **no** verifica IAM.
- **Pendiente de aprobación:** borrar las funciones viejas `slCreatePreAlertHttp`,
  `slCreatePreAlertFromWizard` y `slAdminNormalizePreAlerts`.
- `git stash@{0}` en SP2: trabajo incompleto de otra IA (página admin "Pre-Alertas"). No se
  despliega.

---

## 2. SP1 (smart-portal-1) — rama de trabajo

Rama **`fix/nova-prealert-match`**, **sin push**, basada en `main` `5fc3bb9a`:

| Commit | Qué |
|---|---|
| `8ac8b25d` | `client/lib/services/__tests__/pre-alert-resolver.characterization.spec.ts` (+ snapshot): **golden master** del resolver **antes** de arreglarlo. `[STABLE]` = no debe cambiar nunca; `[BUG Nx]` = comportamiento malo actual, que cambia solo en el commit que arregla ese hallazgo |
| `024f555e` | Emulador combinado SP1+SP2 (§4). `client/lib/firebase/config.ts`: en modo emulador, `dbSP2` y las funciones también van al emulador (**antes leía SP2 de producción**). `functions/src/config/sp2-target.ts`: proyecto SP2 para las funciones de SP1, siempre `smart-portal-2` fuera del emulador |
| (último commit de la rama) | `scripts/qa-emulator/seed-nova-scenarios.cjs`, `fixtures/manifest-prealert-scenarios.csv`, `e2e/nova-upload.cjs` y este documento — ver §5 |

**Pruebas SP1:** 2599/2599 (el hook de pre-commit corre `tsc` y la suite completa).

**Auditoría completa:** `docs/audits/NOVA_PREALERT_MATCH_AUDIT_2026-09-25.md`.

---

## 3. Flujo de negocio a proteger (explicado por el usuario)

1. En **Nova** (SP1), el admin usa el **chat** para descargar el manifiesto de ML Cargo (o adjunta
   el archivo). Eso **abre la tabla de Nova**.
2. Nova valida cada tracking contra las **pre-alertas de SP2**. Si hay pre-alerta, pone la **"P"**
   y **asigna el cliente de una vez** (prioridad 1: la pre-alerta manda).
3. El admin revisa de arriba abajo **confiando en las "P"**, guarda el manifiesto y **genera las
   facturas**, que **se envían por correo**.
4. La factura se **sincroniza a SP2**: el cliente la ve en su dashboard con sus paquetes. **No debe
   duplicar**: el merge tiene que ser sólido.

Clave:
- **ML trae el tracking COMPLETO** (código de barras); **el cliente pre-alerta el CORTO**. La
  búsqueda **en reversa** (de atrás hacia adelante, completa, por familia de carrier) es
  fundamental: USPS, UPS, Shein, FedEx, TBA.
- **Si el paquete de SP2 de esa pre-alerta ya está entregado → la pre-alerta NO aplica**, aunque
  los carriers reciclen números.

---

## 4. Emulador combinado SP1 + SP2 (probar entre sistemas sin tocar producción)

Guía completa: `docs/QA_EMULATOR_SP1_SP2.md`.

```bash
cd smart-portal-1
scripts/qa-emulator/start.sh      # T1: emuladores (proyecto demo-sp-qa; SP2=(default), SP1=portal)
scripts/qa-emulator/seed.sh       # T2: cuentas SP2 (SL90001/SL90002) + invitación ADMIN de SP1
FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=demo-sp-qa \
  node scripts/qa-emulator/seed-nova-scenarios.cjs   # escenarios de Nova (§5)
scripts/qa-emulator/web-sp1.sh    # T3: Nova en http://localhost:5174
```

**Entrar a Nova:**
1. "Continuar con Google" (pantalla del emulador).
2. "Add new account" → `admin@prueba.local`.

**Seguridad verificada:**
- Proyecto `demo-*`.
- `HOME` vacío (sin credenciales de Google; si encuentra alguna, `start.sh` no arranca).
- `.env` de funciones solo de QA (sin claves).
- En las pruebas de navegador se bloquea todo lo que no sea `localhost`, salvo fuentes y el
  cargador de la ventana de Google.

**Ya probado entre sistemas:**
- Cliente SP2 → SP1 (`portal/customers`): ✅
- Factura de SP1 con FedEx de 34 → SP2 liga al paquete pre-alertado de 12 **sin duplicar**: ✅
- Login admin en Nova: ✅

**Límites conocidos:**
- `slMLockerProxy` y `slSendPasswordReset` de SP2 no se cargan (mismo nombre que en SP1).
- Las reglas de seguridad de Firestore no se aplican.
- Un solo emulador de login para los dos sistemas.
- ML Cargo está bloqueado: el manifiesto se **adjunta como archivo** en el chat de Nova.

**Script de navegador:** `scripts/qa-emulator/e2e/nova-upload.cjs` (login + adjuntar manifiesto;
falta el paso de enviar, ver §5). Se corre con
`NODE_PATH=<carpeta de playwright>/node_modules node scripts/qa-emulator/e2e/nova-upload.cjs`.
Patrón:
- Playwright;
- `ctx.route('**/*')` que bloquea todo lo que no sea local;
- login con el popup del emulador (si la cuenta ya existe, click en `admin@prueba.local`; si no,
  "Add new account").

Playwright está instalado fuera del repo; en SP2 se usa `PLAYWRIGHT_DIR`.

---

## 5. Escenarios de Nova sembrados (`seed-nova-scenarios.cjs` + manifiesto CSV)

| Fila | Tracking en el manifiesto | Estado en SP2 | Hoy (bug) | Esperado |
|---|---|---|---|---|
| M1 | `9632001960806794376300877098560696` (FedEx 34) | pre-alerta `877098560696` de SL90001 | sin P (N7) | P SL90001 |
| M2 | `420331959405511899223197428491` (USPS 420) | pre-alerta `9405511899223197428491` de SL90002 | P SL90002 | igual |
| M3 | `TBA330000000301` (nombre "Cliente Uno") | pre-alerta de SL90002 | P SL90002 | P SL90002 **con aviso** (nombre ≠ pre-alerta, decisión a) |
| M4 | `TBA330000000401` | gemelas SL90001 y SL90002 | elige una (N2) | sin P, "por revisar" |
| M5 | `TBA330000000402` | sin `slCode`, `userId` 2429 | P SL2429 (N1) | sin P |
| M6 | `TBA330000000403` | solo en la copia de SP1 | P fantasma (N3) | sin P |
| M7 | `TBA330000000404` | sin fecha | P (N5) | sin P |
| M8 | `TBA330000000405` | `needsReview` | P (N6) | sin P |
| M9 | `TBA330000000406` | pre-alerta pendiente, **paquete SP2 entregado** | P (N13) | sin P |
| M10 | `TBA330000000407` | cancelada | sin P | igual |
| M11 | `TBA330000000408` | de hace 200 días | sin P | igual |
| M13 | `TBA330000000409` | usada en otro manifiesto | depende (N4) | sin P |
| M12 | `TBA330000000499` | sin pre-alerta | sin P, asignado por nombre | igual |

**Siguiente paso:** en Nova, adjuntar `scripts/qa-emulator/fixtures/manifest-prealert-scenarios.csv`
en el chat **y enviarlo**. En la sesión anterior el archivo quedó adjunto sin enviar, por eso la
tabla no abrió. Después, leer de la tabla, por fila:
- la "P": `span` con texto `P` y `title` "Pre-alerta: SLxxxx …";
- el cliente asignado.

Esa lectura queda como **golden master del flujo real**, antes de cada arreglo.

---

## 6. Hallazgos en Nova / SP1 (detalle en la auditoría) y decisiones

| # | Hallazgo | Estado |
|---|---|---|
| N1 | `slCode` inventado desde `userId` o el ID del documento (`resolveCustomerSlCode`); la prueba `pre-alert-resolver.spec.ts:103` lo exige | abierto |
| N2 | Dos cuentas con el mismo tracking → elige una en silencio | abierto |
| N3 | Respaldo contra la copia `portal/pre_alerts` → pre-alertas fantasma (revive canceladas) | abierto |
| N4 | Pre-alerta usada en el manifiesto A sirve en el B | abierto |
| N5 | Sin fecha = válida para siempre | abierto |
| N6 | Ignora `needsReview` | abierto |
| N7 | FedEx 34 no encuentra los 12. Arreglo mínimo: **agregar** la variante últimos-12 (no cambiar el canónico: la prueba "Jimena Sibaja" fija el valor completo) | abierto |
| N8 | Respaldo USPS no anclado al final | abierto |
| N9 | "Consumir" marca como facturadas las pre-alertas de **otros** clientes | abierto |
| N10 | La "P" muestra "Verificada" con el cliente de la fila aunque la pre-alerta no tenga dueño | abierto |
| N11 | El botón "verificar pre-alertas" pisa filas aprobadas por el operador | abierto |
| N12 | Credenciales de ML Cargo y del portal escritas en `functions/src/prealerts/sync.ts` | abierto (seguridad) |
| N13 | Paquete de SP2 ya entregado → la pre-alerta no debe aplicar | abierto (nuevo) |
| N14 | `onInvoiceWritten` (SP1): al cambiar el cliente de una factura, reasigna **todos** los paquetes de SP1 con ese tracking, sin mirar fecha ni dueño | ✅ b2d4d8e5 |
| N16 | Disparadores de SP1: re-ligaban un paquete viejo ya facturado a la factura nueva con el mismo tracking | ✅ 16d0d93c |
| A1 | Sync de facturas en SP2: con coincidencia exacta reasigna paquetes de otra cuenta (número reciclado). **Reproducido** | ✅ SP2 8fef9b4 |
| A2 | Factura con un SL inexistente → el paquete queda sin `userId` y desaparece del dashboard. **Reproducido** | ✅ SP2 8fef9b4 |

**Decisiones del usuario:**
- **D-N1 = (a):** la pre-alerta manda, **con aviso visible**. Por eso el match debe ser a prueba de
  errores: ante cualquier duda, **no hay "P"**.
- **Ventana = 90 días** en SP1 **y** en SP2 (SP2 hoy tiene 120: bajarla).
- **La copia de SP1 (`syncPreAlertsFromSP2`) NO se apaga:** también la usan la reasignación del
  admin y el reporte mensual. Solo se quita el **respaldo de Nova** (N3).

**Aparte:**
- `slReassignPreAlert` (SP1) busca la pre-alerta en la copia de SP1 usando el ID de SP2, que son
  distintos, y crea paquetes en SP2 con `allowCreate`. Revisar.
- El `.env` local de SP1 tiene en texto plano la cadena de conexión de una base Postgres (Neon),
  con contraseña. Se vio en la salida de una herramienta; recomendar rotarla si se comparte.

---

## 7. Plan para la próxima sesión (en orden)

1. Arrancar el emulador combinado (§4), sembrar y correr la **carga del manifiesto en Nova**
   (adjuntar + enviar en el chat). Guardar la tabla resultante como golden master del flujo real.
2. (Hecho) El sembrado de escenarios, el CSV y el script de navegador ya están en la rama.
3. Arreglos en SP1, **uno por commit**. Cada uno con:
   - la prueba unitaria del hallazgo;
   - el golden master sin cambios salvo sus propios escenarios;
   - la prueba de mutación (volver a meter el error y ver que una prueba falla);
   - la verificación en el emulador (Nova + sync a SP2).

   Orden: N1 → N2 → N3 → N6 → N13 → N4 → N5 (ventana de 90 días, también en SP2) → N9 → N7 → N8
   → N10 (P con aviso, decisión a) → N11.
4. Sync de facturas: A1, A2 (SP2) y N14 (SP1), con la misma disciplina.
5. Antes de desplegar: comparar, en solo lectura, el resolver viejo contra el nuevo sobre los
   manifiestos de los últimos 60 días, y revisar con el usuario la lista de filas que cambian.
6. Despliegue con aprobación.


---

## 8. AVANCE 2026-09-25 (sesión 2) — leer primero

Flujo real de Nova, emulador combinado:
- `scripts/qa-emulator/e2e/nova-upload.cjs`: adjuntar → enviar → "Configurar procesamiento" →
  "Ver tabla" → leer la P y las asignaciones.
- `VERIFY=1` pulsa "Corregir por Pre-Alertas", `SAVE=1` hace "Guardar en BD" y lee lo aprendido,
  `LATE_PREALERT=T:SL:UID` crea una pre-alerta durante la revisión y `MANIFEST=<csv>` usa otro
  manifiesto.
- `scripts/qa-emulator/e2e/nova-diff.py` compara la corrida contra
  `golden/nova-before-fix.json`.

**SP1 — rama `fix/nova-prealert-match`** (sin push). Cada arreglo tiene su prueba, la prueba
de mutación y la verificación en Nova real:

| Commit | Hallazgo |
|---|---|
| 1e9dff4e | N1: el dueño es solo el `slCode` guardado |
| a9f941bb | N2: 2+ cuentas → nadie (`ambiguousSlCodes`) |
| c6c63dde | N3: sin respaldo a la copia de SP1 (reasignaba sin P) |
| 530a9466 | N6: se ignora lo que tenga `needsReview` |
| 64de5c5a | N5: sin fecha no aplica; ventana de 90 días |
| 408aa9c8 | N4: pre-alerta consumida solo vale en su propio manifiesto |
| 46acf5cb | **N15 (nuevo):** Nova "aprendía" nombre → cliente a partir de las pre-alertas (en el botón, en la auto-validación y al guardar) y extendía la corrección a las filas con el mismo nombre. Ahora está marcado `preAlertAssignedRows` y no se aprende |
| c0dd778f | N9: consumir solo la pre-alerta del cliente facturado (la función no se usa hoy) |
| d438fd2d | N7: FedEx 34 → últimos 12 |
| 3338da38 | N8: USPS 420 leído desde el final |
| 13cdf994 | N10: la "P" solo con dueño real; **P ámbar** si el nombre no coincide o si hay varias cuentas (la letra siempre es "P") |
| 6b3f4101 | N11: "Corregir por Pre-Alertas" respeta al admin y no inventa clientes |
| 3e4a220f | Prueba entre sistemas de A1/A2 (`e2e/sp1-invoice-ownership.cjs`, 4/4) |
| b2d4d8e5 | N14: cambiar el cliente de una factura mueve solo sus paquetes (o paquetes actuales del cliente anterior) |
| 16d0d93c | **N16 (nuevo):** un paquete entregado o viejo (>90 días) ya facturado conserva su factura; una factura nueva con el mismo tracking (número reciclado) no se lo lleva. Aplica en los dos disparadores: factura (`enforcePackageLinksForInvoice`) y paquete (`onPackageWritten`). `e2e/sp1-invoice-reassign.cjs` 3/3 |

**SP2 — rama `fix/prealert-close-on-delivery`** (sin push):

| Commit | Qué |
|---|---|
| 2b43b93 | N13: `slPreAlertClosedOnDelivery` (paquete entregado o devuelto → pre-alerta `delivered`) |
| f4db7d0 | Script `scripts/close-prealerts-of-finished-shipments.cjs`: dry-run por defecto; producción solo con `--project smart-portal-2` |
| 59eb26d | Ventana de 90 días en SP2 (registro y sync SP1) |
| 8fef9b4 | A1: el sync no mueve un paquete terminado/viejo de otra cuenta (crea uno propio). A2: SL desconocido → no toca los paquetes |

**Resultado en Nova real (manifiesto de escenarios):**
- Eliminados los falsos positivos M4, M5, M7, M8 y M9. M4 queda en P ámbar, sin asignar.
- M1 (FedEx) ahora sí se asigna.
- M2 y M3 siguen igual.

**Verificación final:** suite de SP1 2683/2683; funciones de SP2 766/766.

**Pendientes:**
- Auditoría de solo lectura del aprendizaje envenenado en producción (`match_feedback`), que
  requiere permiso de lectura.
- Correr el backfill N13 en producción: primero dry-run, aprobado por el usuario.
- Error menor fuera de alcance: `AppNavbar.tsx:283` se cae si el usuario no tiene `fullName`.
- Push y deploy, con aprobación.
- Actualizar `PREALERT_FIX_REPORT` de SP2 (quedan menciones de 120 días).
