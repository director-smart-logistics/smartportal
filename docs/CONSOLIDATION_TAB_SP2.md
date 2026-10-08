# "Día 1" (primera factura) y pestaña "En Consolidación" de SP2

Fecha: 2026-09-28. Estado: código y pruebas en el emulador. **Sin deploy y sin escrituras en producción.** La única lectura de producción fue la verificación de solo lectura (35/35).

## 1. Qué cambia

| Dónde | Antes | Ahora |
|---|---|---|
| SP1, Manifiesto de Consolidación, "Día 1" de cada paquete | Fecha de la **última** factura (se reiniciaba con cada re-facturación) | Fecha de la **primera** factura en que el paquete se facturó, cualquiera que haya sido su estado después |
| SP1, contador del cliente ("Consolida desde", gracia, "Más de 90 días") | El Día 1 más viejo con la regla anterior | El Día 1 más viejo con la regla nueva |
| SP1, orden de los paquetes dentro del bloque del cliente | El de los datos | Por Día 1 ascendente, comparando el momento exacto (no solo el día). Empates por tracking |
| SP1, paquete | — | Atributos `firstInvoiceNumber`, `firstInvoiceDate`, `firstInvoiceSetAt`, `firstInvoiceSource` (y `firstInvoiceSetBy` si los escribió el backfill). Se escriben **una sola vez** |
| SP2, dashboard del cliente | Facturados · Pre-alertados · Entregado | Facturados · Pre-alertados · **En Consolidación** · Entregado. La nueva pestaña lista solo tracking + "En consolidación desde el <fecha>", del más viejo al más nuevo, sin acciones. También aparece en la "Vista de cliente" del admin |
| SP2, Firestore | — | Colecciones `consolidation_items` (lista del cliente) y `consolidation_sync_logs` |

Nada más cambia en la página de consolidación: bloques, montos, facturas y botones quedan igual. La prueba `sp1-consolidation-day-one` compara la página contra el código anterior y verifica que el contenido sea idéntico.

## 2. La regla "Día 1" (una sola, en dos copias puras)

- Cliente: `client/lib/consolidation/day-one.ts`, con `packageDayOne`, `customerDayOne`, `firstInvoiceFromInvoices` y `sortByDayOne`.
- Servidor: `functions/src/consolidation/consolidation-start.ts`, con `consolidationStart`, `firstInvoiceFromInvoices`, `isInConsolidation` y `consolidationOps`. Functions no puede importar código del cliente, por eso hay dos copias.
- Una prueba de paridad corre las dos copias con los mismos casos (`client/lib/consolidation/__tests__/consolidation-start.spec.ts`), incluidos los 6 casos de producción. **Si se cambia una, hay que cambiar la otra.**

Orden de fuentes:

1. **El atributo guardado del paquete** (`firstInvoiceDate` / `firstInvoiceNumber`). Si existe, es la verdad.
2. Si no existe, la fecha **más temprana** (por momento exacto) entre:
   - las facturas SP1 del cliente (`slCode` o `clientSlCode`) cuyos ítems (`invoiceItems` o `items`) contienen el tracking, en cualquier estado, incluso anuladas o canceladas. Se ignoran las borradas (`isDeleted`). Es la fuente confiable: el paquete solo guarda la **última** factura anulada;
   - `annulledInvoiceDate`, `annulledInvoiceNumber` e `invoicedAt` del paquete;
   - cada "Factura <número>" que aparece en las notas de `statusHistory`;
   - la factura actual del paquete (`invoiceNumber`, más `invoiceDate` si existe).

   La fecha exacta de una factura le gana al "mediodía" que se lee de su número. Solo `invoiceDate` cuenta como exacta; el número da únicamente el día.
3. Si el paquete nunca se facturó: `firstConsolidatedAt`; si no hay, el primer evento `consolidated` de su historia; si no hay, `createdAt`.

## 3. Quién está "En Consolidación"

Exactamente lo que lista la página de Consolidación de SP1:

- el paquete **no está terminado** (su estado no es `delivered`, `processed`, `returned` ni `pickup`), **y**
- está en **transitoria**: `updatedManifest`, o si falta `manifestId`, o si falta `manifestNumber`, o si falta `manifiesto`, vale `consolidacion_transitoria`.

`packages.status == consolidated` solo **no** alcanza: en producción está desactualizado en 20 paquetes.

## 4. Flujos

**Entradas** a consolidación. Todas pasan hoy desde el navegador y **no se tocaron**:
- anular factura desde el panel de Facturas (`Invoices.tsx`);
- `invoice-service` (`moveInvoiceToTransitoria`, `moveUnlinkedPackageToTransitoria`);
- página de Consolidación;
- Mover manifiesto;
- Devueltos;
- Kanban.

Nova no mueve paquetes a consolidación: al regenerar solo anula.

**Salida:** el admin mueve el paquete a un manifiesto (MoveManifestDialog, BulkMoveDialog o `manifest-consolidation-service`). Al refacturarse, su factura aparece en "Facturados".

**Servidor SP1.** Tres triggers sobre `packages/{id}` (base `portal`), todos con `retry: true` y `maxInstances: 10`:

| Trigger | Qué hace |
|---|---|
| `onPackageFirstInvoice` (`packages/first-invoice.ts`) | En la primera escritura en que el paquete tiene factura (`invoiceId`, `invoiceNumber` que no sea transitoria, factura anulada o `invoicedAt`) y todavía no tiene `firstInvoiceDate`: calcula la primera factura (paso 2 de la regla, con las facturas del cliente) y la guarda **en una transacción, solo si sigue vacía**. Registra el log en `first_invoice_logs`. |
| `onPackageConsolidationToSp2` (`packages/consolidation-to-sp2.ts`) | Si cambia la pertenencia a consolidación, envía a SP2: entra → `add` con `since`, sale → `remove`, cambio de cliente o tracking → `remove` del anterior + `add` del nuevo. Si solo cambian otros campos, no envía nada. Registra el log en `consolidation_sync_logs` (SP1). |
| `onPackageWritten` (ya existía) | Solo se agregaron los campos `firstInvoice*` a su lista de campos propios: una escritura que **solo** agrega esos campos no vuelve a aplicar la regla de enlace factura ↔ paquete. Sin esto, esa escritura extra, que llega a mitad de una anulación, dejaba el paquete en `processed` usando una foto vieja del paquete (encontrado en el emulador). Ningún otro comportamiento cambia. |

**SP2** `slSyncConsolidationFromSp1` (`src/functions/src/sp1-consolidation-sync.ts`):
- Autorización con `x-sync-secret` igual a `ENCOMIENDA_SYNC_SECRET` (el mismo de `slSyncShipmentsFromSp1`).
- Cada ítem se procesa en una transacción.
- Documento `consolidation_items/{SL}_{TRACKING}`. La normalización es la misma en SP1 y SP2: SL en mayúsculas; tracking en mayúsculas y sin símbolos.

Campos del documento:

| Campo | Significado |
|---|---|
| `slCode`, `tracking`, `userId`, `sp1PackageId` | `userId` es la cuenta SP2 viva de ese SL: se descartan las cuentas fusionadas, borradas o deshabilitadas. |
| `since`, `sourceInvoiceNumber` | Día 1. **Se escriben una sola vez**, solo si están vacíos. Solo la reconciliación puede corregirlos (`repair_since`, deja `sinceBefore` y `sinceRepairedAt`). |
| `active` | `true` mientras está en consolidación. Un `remove` pone `false` con `removedAt` y `removeReason`: **nunca se borra**. Si vuelve a entrar: `reactivated` y `reenteredAt`, con el mismo `since`. |
| `lastEventAt`, `lastEventId` | Último evento de SP1 aplicado. Un evento **más viejo** se ignora (`ignored_stale`). |
| `addedAt`, `updatedAt`, `lastReason`, `lastBy` | Trazabilidad. |

## 5. Idempotencia y trazabilidad (casos de falla)

| Caso | Qué pasa |
|---|---|
| SP2 caído / 5xx / red | El trigger de SP1 lanza error y Firebase **reintenta** (hasta 24 h; después se descarta con aviso en el log). La reconciliación lo detecta y lo repara. |
| Error 4xx o falta el secreto | Se registra en el log y **no** se reintenta. La reconciliación lo reporta. |
| Reintento o evento duplicado | El mismo evento aplicado dos veces no cambia nada: `add` sobre un ítem activo da `unchanged`; `remove` sobre uno inactivo da `not_found`. Probado. |
| Eventos fuera de orden | Todo evento lleva `eventAt` (la hora del evento en SP1). Uno más viejo que `lastEventAt` se ignora (`ignored_stale`): no resucita un ítem ni lo saca. Los no-op también actualizan `lastEventAt`. Probado. |
| Cambio de cliente estando en consolidación | `remove` del SL anterior y `add` del nuevo, en el mismo envío y con el mismo `eventId`. Probado. |
| Edición manual en SP1 (peso, descripción…) dentro de consolidación | No se envía nada: la pertenencia no cambió. Probado. |
| Paquete eliminado en SP1 | `remove`, con motivo "paquete eliminado en SP1". |
| Paquete re-facturado y anulado otra vez | Vuelve a la lista (`reactivated`) con el **mismo** `since`. `firstInvoice*` no cambia. Probado. |
| Flujo real de producción: consolidación → Carry-On a un manifiesto → proceso en Nova → factura **borrador -C** | Sale de la lista de SP2 (`remove`: "movido de consolidación a un manifiesto"). `firstInvoice*` sigue siendo la factura **original**, no el borrador nuevo (se escribe una sola vez y el borrador es más reciente). Probado (paso 12 del e2e). |
| Carrera anulación ↔ primera factura | El guardado de `firstInvoice*` no reactiva la regla de enlace (ver `onPackageWritten`). Si SP2 recibió antes una fecha calculada sin el atributo, la regla es la misma y da el mismo resultado. Probado 3/3 seguidas. |

**Correlación:** el `eventId` del evento de SP1 va en el log de SP1 (`consolidation_sync_logs`) y en el de SP2 (`consolidation_sync_logs`, uno por ítem, incluidos no-op e ignorados). La prueba verifica que coincidan.

## 6. Reglas SP2 (firestore.rules)

- `consolidation_items`: la lectura se permite al dueño (`userId == auth.uid`) o a staff/admin (esto es lo que usa la "Vista de cliente"). **Nadie escribe desde el cliente.**
- `consolidation_sync_logs`: solo el admin lee; nadie escribe.

La prueba usa el SDK real del cliente: lee lo suyo; no puede leer lo de otro cliente, ni escribir, ni leer los logs.

No hace falta índice compuesto: la consulta tiene dos igualdades (`userId`, `active`) y el orden se hace en el cliente.

## 7. Scripts (SP1 repo, `scripts/audit/`)

Antes de correrlos: `cd functions && npx tsc` (leen la regla desde `functions/lib`). Todos dejan su archivo en `audit-output/`, que no se sube a git.

| Script | Qué hace |
|---|---|
| `verify-consolidation-day-one.cjs [--expected <json>]` | **Solo lectura.** Recalcula el Día 1 de todo lo que está en consolidación y lo compara por **día** con la auditoría. Producción, 2026-09-28: **35/35**. Imprime el contador por cliente. |
| `backfill-first-invoice.cjs [--apply] [--only-consolidation] [--rollback <json>]` | Completa `firstInvoice*` **solo donde está vacío**, en una transacción por paquete. Registra el log en `first_invoice_backfill_logs` y deja el respaldo para `--rollback`, que solo deshace lo que sigue igual a lo que escribió. |
| `backfill-consolidation-items.cjs [--apply]` | Carga en SP2 la lista actual por el mismo endpoint (`add`, `eventId` = `backfill-<id>`, `eventAt` = última escritura del paquete). Necesita `SP2_CONSOLIDATION_SYNC_URL` y `SP2_SYNC_SECRET`. |
| `reconcile-consolidation-items.cjs [--apply]` | **Solo lectura** por defecto. Compara lo que está en consolidación en SP1 con `consolidation_items` activos en SP2 y reporta: faltan, sobran, fecha distinta y sin cuenta SP2. Con `--apply` repara por el endpoint (`add` / `remove` / `repair_since`) con `eventId` = `reconcile-<ts>`. |

**Todo se calcula en vivo al momento de correrlo.** Los backfills y la reconciliación leen SP1 y SP2 en ese instante; nunca usan un archivo guardado. El JSON de la auditoría del 2026-09-28 (35 paquetes / 23 clientes) es una foto histórica: vale para verificar la regla del Día 1 por día. La pertenencia a consolidación cambia durante el día; por ejemplo, ese mismo día gerencia sacó 13 paquetes por Carry-On a 25-09-2026DAN, los procesó en Nova y generó facturas borrador -C, y la página pasó a 22 / 13.

### Orden para producción (NO ejecutado; requiere el visto bueno del usuario)

```bash
cd functions && npx tsc && cd ..
# 0. deploy SP2 (función + reglas) y luego SP1 (3 triggers + UI), según el runbook
# 1. primera factura en SP1 (simulación → revisar el Excel → aplicar)
node scripts/audit/backfill-first-invoice.cjs
node scripts/audit/backfill-first-invoice.cjs --apply
# 2. lista SP2 desde SP1
SP2_CONSOLIDATION_SYNC_URL=https://us-central1-smart-portal-2.cloudfunctions.net/slSyncConsolidationFromSp1 \
SP2_SYNC_SECRET=<secreto> node scripts/audit/backfill-consolidation-items.cjs --apply
# 3. verificación: debe decir "SIN DIFERENCIAS (0)" y 35/35 (o lo que haya ese día)
node scripts/audit/reconcile-consolidation-items.cjs
node scripts/audit/verify-consolidation-day-one.cjs --expected <auditoría.json>
```

**Rollback:**
- `firstInvoice*`: `node scripts/audit/backfill-first-invoice.cjs --rollback audit-output/backfill-first-invoice-aplicado-<ts>.json`.
- Lista SP2: los ítems nunca se borran. Para ocultar la pestaña basta con revertir el deploy de hosting de SP2. Los datos quedan y se pueden reconciliar después.
- Triggers: redeploy de la versión anterior de SP1.

## 8. Pruebas

- **Unitarias (SP1):**
  - `client/lib/consolidation/__tests__/day-one.spec.ts`, que incluye el caso SL26254, el orden SL7511 y el desempate 13:09 contra 14:29;
  - `consolidation-start.spec.ts`: paridad, los 6 casos de producción, pertenencia y operaciones.
- **Unitarias (SP2):** `tests/unit/prealert-tabs.test.ts` (lista: activos, del más viejo al más nuevo).
- **E2E en el emulador:**
  - `sp1-sp2-consolidation-tab`: flujo real de anulación, primera factura, cambios internos, salida, re-entrada, idempotencia y orden, cambio de cliente, Carry-On → Nova → borrador -C, reglas con SDK real, UI, correlación de logs y reconciliación en 0 para sus paquetes.
  - `sp1-sp2-consolidation-shots`: SL26254 y SL7511; SP1, SP2 escritorio y móvil, y "Vista de cliente".
  - `sp1-consolidation-day-one`: página SP1 con la regla nueva y el orden.

## 9. Riesgo existente encontrado (no se cambió)

`moveInvoiceToTransitoria` (invoice-service) escribe `manifestNumber`/`manifestId = consolidacion_transitoria`, pero **no** `updatedManifest`. En cambio, la anulación del panel de Facturas sí escribe `updatedManifest`.

Consecuencia: si un paquete ya había sido movido a un manifiesto (y por eso tiene `updatedManifest`) y después se anula por ese camino, **no aparece** en la página de Consolidación ni en la lista de SP2, porque `updatedManifest` manda. Queda documentado para decidir aparte.
