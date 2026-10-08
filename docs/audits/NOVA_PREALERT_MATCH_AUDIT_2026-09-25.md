# Nova ↔ pre-alertas: cómo se decide la "P" y quién es el dueño (auditoría 2026-09-25)

**Alcance:** solo lectura del código de SP1. No se cambió nada.

**Por qué importa:** en Nova la pre-alerta **manda**. Cuando un tracking tiene pre-alerta,
Nova cambia el cliente de la fila al de la pre-alerta y factura a ese cliente. Si el resolver
devuelve la pre-alerta equivocada, se factura a otra persona sin ningún aviso.

Relacionado (SP2):
- `smart-portal-2/docs/audits/PREALERT_INTEGRITY_AUDIT_2026-09-24.md` (hallazgo H1: `"SL"+userId`);
- `SP1_SYNC_ISSUES_2026-09-25.md` (A1, A2).

---

## 1. El flujo actual (archivos y líneas)

| Paso | Dónde | Qué hace |
|---|---|---|
| 1 | `client/lib/services/manifest-processor/parser.ts` ~686–745 | Al procesar un manifiesto llama a `batchResolvePreAlerts(trackings)`. Si hay pre-alerta con `slCode`, **sobrescribe** el cliente que se había sacado del nombre del manifiesto (`preAlertOverrideMap`). No compara con ese nombre |
| 2 | `client/lib/services/pre-alert-resolver.ts` `batchResolvePreAlerts` | Busca en SP2 `pre_alerts` por `tracking`, `canonicalTracking` y `trackingNumber`, filtra con `isEligiblePreAlert` y elige **un** documento por tracking |
| 3 | `client/lib/utils/tracking-canonicalizer.ts` | Convierte lo escaneado (código de barras) en el tracking que el cliente pre-alertó (búsqueda "en reversa") |
| 4 | `client/components/nova/NovaTableModal.tsx` ~1527–1640 | Listener en vivo (`watchPreAlerts`): si el `slCode` de la pre-alerta difiere del de la fila, **reasigna la fila automáticamente** (si la política del manifiesto lo permite) |
| 5 | `NovaTableModal.tsx` `handleVerifyPreAlerts` ~2874–3000 | Botón "verificar pre-alertas": **reasigna** toda fila cuyo `slCode` difiera del de la pre-alerta |
| 6 | `NovaTableModal.tsx` ~9876–9930 | Dibuja la **"P"** ("Pre-alerta Verificada") |
| 7 | `pre-alert-resolver.ts` `batchConsumePreAlerts` | Al manifestar o facturar, marca la pre-alerta como `manifested`/`invoiced` en SP2 |
| 8 | `functions/src/prealerts/sync.ts` (`syncPreAlertsFromSP2`, 4 veces al día) | Copia paquetes de SP2 a `portal/pre_alerts` de **SP1** |

---

## 2. Hallazgos (ordenados por riesgo para la facturación)

### N1. El dueño se inventa a partir del `userId` o del ID del documento — CRÍTICO
`resolveCustomerSlCode` (resolver, líneas 204–292): si la pre-alerta no trae `slCode`,
- lo saca del final del ID (`/_(\d{3,7})$/` → `SL` + dígitos);
- o de un `userId` numérico: `'2429'` → `SL2429`.

Es el mismo error H1 que ya corregimos en SP2. `users/2429` es **SL1854**; SL2429 es **otra
persona**. En SP1, la copia de `sync.ts` guarda la pre-alerta con el ID del paquete de SP2
(`TRACKING_userId8`), así que `TRACKING_2429` → **SL2429**.

La prueba `pre-alert-resolver.spec.ts:103` exige hoy ese comportamiento (`'1796'` → `SL1796`).

**Efecto:** la P aparece con un cliente equivocado, el parser sobrescribe la fila con ese
cliente y se le factura.

### N2. Si dos clientes tienen pre-alerta del mismo tracking, se escoge uno en silencio — CRÍTICO
- `batchResolvePreAlerts` ordena los candidatos por "tiene `slCode` + tiene nombre" y toma el
  primero (líneas 521–529 y 541–547).
- `watchPreAlerts` toma el primero que encuentra (`break`, líneas 652–660).

No se detecta la ambigüedad. En SP2 hay 376 gemelas y cuentas duplicadas de la misma persona:
el paquete puede terminar en cualquiera de las dos cuentas.

### N3. Pre-alertas "fantasma": respaldo contra la copia local de SP1 — CRÍTICO
Si SP2 no devuelve ninguna coincidencia, el resolver busca en `portal/pre_alerts` de **SP1**
(líneas 458–498). Esa colección:
- la llena `sync.ts` con **paquetes** de SP2, no con pre-alertas: cualquier `source='prealert'`,
  con el estado del paquete;
- es una copia que no se entera de las cancelaciones, las fusiones (`mergedInto`) ni los
  `needsReview` de SP2.

Justo cuando SP2 dice "no hay pre-alerta", se toma una copia vieja y aparece una P fantasma.

### N4. Una pre-alerta ya consumida vuelve a servir en otro manifiesto — ALTO (dobles en facturación)
`isEligiblePreAlert`: con `status` `manifested` o `processed`, basta con que exista **algún**
`currentManifestNumber` (líneas 154–157). **No compara** que sea el mismo manifiesto de la
pre-alerta (`manifestNumber`). Al editar o revalidar el manifiesto B, se asocia una pre-alerta
ya usada en el manifiesto A.

### N5. Pre-alertas sin fecha son válidas para siempre — ALTO
La ventana de 60 días solo se aplica si hay fecha (líneas 159–172). Sin `preAlertDate`,
`createdAt` ni `submittedAt`, la pre-alerta nunca vence. Las pre-alertas viejas de SP2 no
siempre tienen fecha.

### N6. Se ignora la marca de revisión de SP2 — ALTO
Desde el 24-sep, el trigger de SP2 marca `needsReview: true` cuando el `slCode` no es válido o
no coincide con la cuenta. El resolver no lo mira: una pre-alerta que SP2 declaró dudosa sigue
mandando en Nova.

### N7. FedEx: el código de barras de 34 dígitos nunca encuentra la pre-alerta de 12 — ALTO
El canonicalizador no tiene regla para el barcode FedEx `96…` de 34 dígitos. Cae en "numérico
puro" y se compara entero. Ejemplo: `9632001960806794376300877098560696` vs la pre-alerta
`877098560696`.

**Efecto:** falta la P, se asigna por nombre y en SP2 sale un duplicado (el caso real C1). El
sistema anterior sí comparaba los **últimos 12 dígitos de atrás hacia adelante**.

### N8. USPS: el respaldo del canonicalizador no está anclado al final — MEDIO
Cuando el `420+ZIP` no calza, busca "el primer `9` seguido de 19–21 dígitos" en **cualquier
parte** del código (línea ~221). Debe ser el **final** del código (`$`), que es donde siempre
está el tracking.

### N9. "Consumir" marca pre-alertas de otros clientes — ALTO
`batchConsumePreAlerts` recibe `item.slCode` pero **no lo usa**. Marca como
`manifested`/`invoiced`, con el número de factura, **todas** las pre-alertas que tengan ese
tracking (hasta 5 por consulta), también las de otra cuenta. Eso "gasta" la pre-alerta legítima
de otra persona.

### N10. La "P" aparece aunque la pre-alerta no tenga dueño — MEDIO
En el badge (`NovaTableModal.tsx` ~9884), si la pre-alerta no trae `slCode`, se usa el `slCode`
**de la fila**. Se muestra "Pre-alerta Verificada" con el cliente que ya tenía la fila, aunque
la pre-alerta no pertenezca a nadie.

### N11. El botón "verificar pre-alertas" pisa decisiones del operador — MEDIO
El listener en vivo respeta las filas aprobadas a mano (`approvedMatchesRef`). El botón no:
reasigna también esas filas, y si no encuentra el perfil del cliente asigna el `slCode` igual
(línea ~2980).

### N12. Credenciales en el código — seguridad
`functions/src/prealerts/sync.ts` líneas ~33–36: usuario y contraseña de ML Cargo y del portal
mayorista escritos en el código. Deben ir a variables de entorno o secretos, y rotarse.

**No verificado:** si `syncPreAlertsFromSP2` está programada y corre hoy en producción. `gcloud`
pidió volver a autenticarse.

---

## 3. Regla correcta (propuesta)

La pre-alerta solo manda cuando **no hay duda**:

1. **Búsqueda en reversa** (código de barras → tracking del cliente):
   - la parte final del código escaneado, comparada de atrás hacia adelante y completa;
   - USPS: `420`+ZIP+tracking de 20–26;
   - FedEx: 34 dígitos → últimos 12.

   Nunca por coincidencia en medio del código ni parcial.
2. **Dueño = el `slCode` guardado en la pre-alerta**, con formato `SL`+dígitos. Sin `slCode`
   válido no hay P ni reasignación. Nunca se deriva del `userId` ni del ID del documento.
3. **Una sola cuenta:** si las pre-alertas vivas del tracking son de más de un `slCode`, no
   se asigna. Se marca "revisar" y se muestran las opciones.
4. **Viva:** `active !== false`, sin `needsReview`, sin `mergedInto` y dentro de la ventana. Una
   pre-alerta sin fecha **no** cuenta. Si está consumida, solo sirve en **su mismo manifiesto**.
5. **Solo SP2:** se elimina el respaldo contra `portal/pre_alerts` de SP1.
6. **Consumir solo la del dueño:** `batchConsumePreAlerts` filtra por el `slCode` del ítem.
7. **La P se muestra solo con dueño real.** Si la pre-alerta contradice al cliente del
   manifiesto, se muestra la P con aviso ("pre-alerta de SLxxxx ≠ fila") en vez de reasignar
   en silencio. **Decisión pendiente** (§5, D-N1).

---

## 4. Plan sin regresiones (quirúrgico)

1. **Congelar el comportamiento actual (golden master):**
   - pruebas de caracterización de `batchResolvePreAlerts`, `watchPreAlerts`,
     `isEligiblePreAlert`, `canonicalizeTracking` y `batchConsumePreAlerts`;
   - dataset real anonimizado: los manifiestos que ya existen en `__tests__` (17-08, real-50,
     1000 filas) más los casos reales (FedEx `…877098560696`, USPS 420, TBA, 1Z, GFUS);
   - todo caso que hoy da bien debe seguir igual.
2. **Un cambio por hallazgo**, cada uno con:
   - su prueba que falla antes y pasa después;
   - el golden master sin diferencias, salvo las filas que el hallazgo corrige, listadas y
     explicadas;
   - prueba de mutación: volver a meter el error y confirmar que alguna prueba lo detecta.

   Orden por riesgo: N1 → N2 → N3 → N6 → N4 → N5 → N9 → N7 → N8 → N10 → N11.
3. **Simulación con datos reales, solo lectura:** correr el resolver viejo y el nuevo sobre los
   manifiestos de los últimos 60 días y listar cada fila cuyo dueño o cuya P cambie. Revisar esa
   lista con ustedes **antes** de desplegar.
4. **Pruebas de Nova:** las suites existentes de `client/components/nova/__tests__` deben
   seguir en verde.
5. **Despliegue** de SP1 con aprobación; verificar en producción con un manifiesto de prueba.

---

## 5. Decisiones pendientes

- **D-N1.** Si la pre-alerta dice SL-A y el nombre del manifiesto coincide fuerte con SL-B:
  - (a) la pre-alerta manda como hoy, pero con aviso visible; o
  - (b) no se reasigna y queda "por revisar".
- **D-N2.** Ventana de tiempo: SP1 usa 60 días y SP2 120 (mediana 12, p99 42, máximo 86). Se
  propone 120 en ambos, para que coincidan.
- **D-N3.** ¿Se apaga `syncPreAlertsFromSP2` (la copia a SP1) una vez que nada la lea?
