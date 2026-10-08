# Despliegue único y controlado (SP1 + SP2)

**Decisión del 2026-09-26:** no se despliega fase por fase. Se terminan todas las fases, se prueba todo junto y se hace **un solo despliegue controlado**. Los scripts de datos van **después** del despliegue, por etapas.

Este documento se actualiza al cerrar cada fase.

## Ramas

| App | Rama | Estado |
|---|---|---|
| SP1 (Nova, smart-portal-1) | `fix/nova-prealert-match` | **En producción 2026-09-27 14:10 UTC** (`14a734e1`) |
| SP2 (SmartWeb, smart-portal-2) | `fix/prealert-close-on-delivery` | Sin push |

## Estado de las fases

| Fase | Qué es | Estado | Piezas para desplegar |
|---|---|---|---|
| F6 | Admin Paquetes: detalle de ML Cargo | ✅ código | SP2 hosting |
| F7 | Runner de regresión | ✅ | — (solo QA) |
| F8 | Una dirección en SP2, sync inmediato, servicio de encomienda | ✅ código | SP2 hosting y functions; SP1 functions y hosting |
| F9 | Rutas: "Entregado" en lote llega a SP2 | ✅ código | SP2 functions |
| F10 | Manifiestos de consolidación: "Día 1" por paquete = última factura; contador del cliente = la más vieja; cada línea muestra su factura (`docs/F10_CONSOLIDATION_DAY_ONE.md`) | ✅ código | SP1 hosting |
| F11 | Etiquetas y manifiesto de encomiendas: una regla de dirección; la etiqueta de Nova actualiza SP2 (casilla marcada por defecto, solo si el admin escribió); nada se borra | ✅ código | SP1 functions (`slUpdateSp2AddressFromLabel`) y hosting |
| F12 | Dirección principal en `users` (single-v1) | ✅ código · ⏳ F12.4 e2e | SP2 rules, functions y hosting; SP1 functions |
| F13 | Cuentas duplicadas (SEC-1, D-1…D-8, O-2, O-6) | ✅ código | SP2 rules y functions **juntas**, y hosting |
| Pre-alertar rápido | Pulido visual | ⏳ pendiente | SP2 hosting |
| Google sign-in | Plan de retiro | 📄 plan | Nada hasta decidir |

## Runbook del despliegue (paso a paso)

**Producción hoy:**
- SP2 corre `48e423f` (hosting 1.0.2115). La rama agrega 36 commits encima.
- SP1 corre `main`. La rama agrega 73 commits.

**Qué se despliega:**
- **SP2:** `firestore.rules` (F13: la identidad solo la escribe el servidor), las functions del codebase `smartlogistics` y el hosting `portal-2`.
- **SP1:** las functions (codebase `default`) y el hosting. Sin cambios en las reglas de SP1.

### 0. Antes (sin tocar producción)
1. Ronda de validación completa en verde: runner, suites de SP1, de SP2 y de functions.
2. **Push de las dos ramas**, con aprobación.
3. **Worktrees limpios** del commit empujado, **nunca** desde el árbol compartido de SP2 (otra IA lo edita):
   - copiar los `.env*`;
   - enlazar `node_modules`;
   - `npm run build` y verificar que compila.

### 1. Respaldo
Verificado el 2026-09-26 (solo lectura): **SP1** (`portal`) tiene recuperación a un punto en el tiempo (7 días) y respaldos
diarios y semanales automáticos (111; el último, de hoy) → no necesita respaldo manual. **SP2** (`(default)`) no tenía
ninguno (solo 1 hora de versiones) → respaldo manual **hecho**:
- Bucket privado `gs://smart-portal-2-backups` (us-east1, acceso público bloqueado, fuera de Firebase: la app no lo alcanza).
  No usar `smart-portal-2.firebasestorage.app`: sus reglas dejan leer cualquier archivo a cualquier usuario autenticado.
- Export `gs://smart-portal-2-backups/pre-deploy-2026-09-26` — SUCCESSFUL, 655.713 documentos, 1.026 archivos (572 MB).
- Restaurar (solo si hiciera falta; sobrescribe los documentos exportados):
  `gcloud firestore import gs://smart-portal-2-backups/pre-deploy-2026-09-26 --database='(default)' --project smart-portal-2`
- Pendiente (después): activar en SP2 la recuperación a un punto en el tiempo y respaldos diarios, como SP1.
Anotar la versión actual del hosting de las dos apps en la consola de Firebase (Hosting → historial de versiones), para poder revertir con un clic.

### 2. SP2 — reglas, functions y hosting **en una sola ventana**
Las reglas de F13 dependen de las functions nuevas. Si las reglas salen solas, el perfil de verificación no se guarda.
```
cd <worktree SP2> && npm run build
firebase deploy --only firestore:rules,functions:smartlogistics,hosting:portal-2 --project smart-portal-2
```
**IAM (incidente del 2026-09-25):** las onCall nuevas ya traen `invoker: 'public'`. Hay que verificarlo en Cloud Run:
- `slCompleteMyProfile`, `slUpdateMyIdentity` y `slAdminUpdateIdentity`;
- `slDeletePreAlert`.
```
gcloud run services get-iam-policy slcompletemyprofile --region us-central1 --project smart-portal-2
```
Debe listar `allUsers` con `roles/run.invoker`. Si falta, el usuario lo agrega:
```
gcloud run services add-iam-policy-binding <servicio> --region us-central1 --member=allUsers --role=roles/run.invoker --project smart-portal-2
```

#### 2b. Búsqueda por los últimos dígitos (Admin → Paquetes) — obligatorio, en este orden
Sin este paso la búsqueda por 6–9 dígitos **no funciona en prod** (hoy el índice solo tiene terminaciones de 10+ y
`pre_alerts` no tiene índice). Ensayado en el emulador con el estado real de prod: `sp2-tracking-backfill-rehearsal` 6/6.
1. Confirmar que las functions nuevas quedaron desplegadas (`slShipmentSearchIndex` con mínimo 6 y `slPreAlertSearchIndex`).
   **Nunca** correr el backfill antes: el trigger viejo deshace cada escritura.
2. `node scripts/backfill-tracking-search-keys.cjs` (dry-run) → revisar `needsWrite` (~29.656) y colisiones.
3. `node scripts/backfill-tracking-search-keys.cjs --fix --limit=500` → `node scripts/verify-tracking-ending-search.cjs --sample=100`
   (en esta etapa solo cuenta que no haya errores).
4. `node scripts/backfill-tracking-search-keys.cjs --fix --pause-ms=1000` (shipments completo).
5. `node scripts/backfill-tracking-search-keys.cjs --collection=pre_alerts` (dry-run) y luego `… --collection=pre_alerts --fix`.
6. **Verificación que decide el paso:** `node scripts/verify-tracking-ending-search.cjs --sample=250 --also=044088,447343876,667905`
   → debe decir **✅ PASA** (≥ 99 % en 6, 8 y 10 dígitos, en shipments y pre_alerts). Antes del deploy da ❌ (medido el 2026-09-26: 0 % en 6 y 8).
7. Prueba manual con SL25001 / gerencia@: buscar 6 dígitos de un paquete real en Admin → Paquetes.

### 3. SP1 — functions y hosting
**Hecho 2026-09-27 (14:10 UTC), commit `14a734e1`:** 96 functions por nombre (95 actualizadas + `slUpdateSp2AddressFromLabel` nueva; responde 401 sin login = OK). No se tocaron `health` (existe en producción y no en el código) ni las 4 de correo que están en el código pero nunca se desplegaron (`sendEmail`, `sendInvoiceEmail`, `getEmailStatus`, `getEmailStatusBatch`). Hosting versión `1ece677c02232662`; **reversa: `cc34c27aa85d78c2`**. Durante la actualización hubo reintentos por cuota (429) que terminaron bien.

```
cd <worktree SP1> && npm run build
firebase deploy --only functions,hosting --project smart-portal-admin
```
IAM: verificar lo mismo para `slupdatesp2addressfromlabel` (nueva, con `invoker: "public"`).

### 4. Humo en producción, solo con SL25001 (y sin escribir datos de clientes reales)
| Qué | Esperado |
|---|---|
| Login, "Olvidé mi contraseña", "entrar como usuario" (admin) | Funcionan igual |
| Registro de un cliente nuevo de prueba | Se crea con cédula; la dirección queda en `users` y llega a SP1 al instante |
| Dashboard SP2 | Pre-Alertar Rápido en una fila; se crea y se elimina una pre-alerta de prueba |
| Editar la dirección de SL25001 en SP2 | Aparece en la etiqueta de Nova |
| Etiqueta de Nova de SL25001, corrigiendo la dirección con la casilla SP2 | SP2 la recibe; SP1 la devuelve; nada se borra |
| Manifiestos de consolidación | La línea muestra "Día 1 · anulada/factura/sin factura"; el contador usa la factura más vieja |
| Anular una factura de prueba de SL25001 | Sus paquetes quedan en consolidación transitoria al instante |

### 5. Monitoreo (24 h)
- Logs de functions de los dos proyectos: errores de `slUpdateSp2AddressFromLabel`, `slCompleteMyProfile`, del trigger de facturas y del sync.
- Colecciones `identity_alerts` y `sp2_address_admin_edits`.
- 403 o errores de permisos en la consola del navegador.

### 6. Reversa
- **Hosting:** rollback a la versión anotada, en la consola; es inmediato.
- **Functions:** redesplegar el commit anterior:
  - SP2 desde `48e423f`, junto con sus reglas de ese commit;
  - SP1 desde `main`.
- **Datos:** este despliegue **no modifica datos**. Los scripts de datos van después y cada uno tiene su propio `--rollback`.
- **Índice de búsqueda (`trackingSearchKeys`):** no hace falta revertirlo: las claves de 8–9 caracteres son adicionales y el código anterior solo consulta las de 10 o más.

## Scripts de datos (después del despliegue, por etapas, siempre dry-run antes)

| Script | Qué hace | Etapas |
|---|---|---|
| `smart-portal-2/scripts/backfill-uniqueness-indexes.cjs` (cédula, correo y SL) | Completar los índices de unicidad. Dry-run en prod 2026-09-26: 2.891 cuentas; hoy indexadas cédula 1.119 / correo 864 / SL 82. A escribir: correos 2.025, cédulas 1.691, SL 2.805. **10 conflictos** (1 correo, 9 cédulas) = cuentas duplicadas que ya existen: el script NO las toca; revisión manual y fusión (`slAdminMergeUsers`, conserva la cuenta con actividad) antes de indexarlas. Mientras tanto el servidor igual bloquea duplicados revisando las cuentas viejas campo por campo (prueba D-5). El CSV tiene datos personales: moverlo fuera del repo. | Dry-run, `--fix` (salta conflictos), revisar los 10 con el usuario |
| `scripts/audit/migrate-principal-address.cjs` (F12) | Dirección principal a `users` | SL25001, luego 10, luego 100, luego el resto |
| `scripts/audit/cleanup-admin-overrides.cjs` (F11.3) | Direcciones escritas a mano: las 35 con el mismo contenido solo reciben fecha | 5, luego el resto |
| Revisión manual F11.3 (`audit-output/F11_REVISION_MANUAL_DIRECCIONES.md`, local, con datos personales) | Las 18 restantes. Cada una tiene una propuesta **solo de formato** (mismas palabras; se verificó que no se pierde ni se agrega nada). Ninguna se actualiza sin aprobación manual, una por una. 3 tienen conflicto de ubicación (confirmar con el cliente) y 1 no tiene dirección (pedirla al cliente). | Solo las aprobadas, una por una |
| Corrección F9 | 12 paquetes atascados detrás de su copia entregada | Uno, luego el resto |
| `smart-portal-2/scripts/backfill-tracking-search-keys.cjs` (búsqueda admin por últimos 6 dígitos) | Reconstruye `trackingSearchKeys` en `shipments` (ahora desde 6 caracteres). Dry-run en prod 2026-09-26: 31.489 leídos, **29.656 a escribir**, máx. 56 claves/doc; terminaciones compartidas: 6 díg. 2,8 %, 8 díg. 0,2 %, 10 díg. 0,14 % (se listan para elegir). Escribe **solo** ese campo, nunca `updatedAt`; idempotente. Requiere desplegar antes las functions (`slShipmentSearchIndex`) | Dry-run (revisar el reporte de colisiones en 6–9), `--limit=500 --fix`, luego `--fix --pause-ms=1000` |
| `… backfill-tracking-search-keys.cjs --collection=pre_alerts` | Crea `trackingSearchKeys` en `pre_alerts` (nuevo trigger `slPreAlertSearchIndex`). Solo ese campo; `slPreAlertCreated` es solo de creación, no se re-dispara | Dry-run, `--limit=200 --fix`, luego `--fix` |
| Corrección Nova "Re-generar factura" (auditoría prod 2026-09-26, solo lectura) | 2 paquetes de SL7330 (manifiesto 23-09-2026DAN; anulada SL7330-20260924144840752) quedaron en `consolidacion_transitoria`, estado `route`, sin factura, mientras su factura regenerada SL7330-20260925085709816-C está **pagada**. Volverlos a su manifiesto y ligarlos a esa factura. Revisar también 11 paquetes que quedaron en su manifiesto sin el vínculo a la factura regenerada (6 entregados, 5 en ruta). | Dry-run con el detalle de cada paquete, aprobación, uno, luego el resto |
| Datos demo QADEMO en SL25001 | Limpieza | Al final |

**No aplicar** `single-address-cleanup.cjs` (F8.5): F12 lo reemplaza.

## Pruebas antes del despliegue (todo en verde)

- `scripts/qa-emulator/run-regression.sh`: ver la última ronda de validación en el reporte del día.
- Suites: SP1 (2872), SP2 app y SP2 functions.
- Suites e2e nuevas de cada fase pendiente (F10, F12.4, pre-alertar rápido).
