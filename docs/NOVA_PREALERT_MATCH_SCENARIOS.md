# Nova ↔ pre-alertas: todos los escenarios de coincidencia (Fase 1)

Fecha: 2026-09-25. Rama SP1 `fix/nova-prealert-match`.

## Reglas que no cambian

1. Nova lee **solo** `pre_alerts` de SP2, **en tiempo real**.
2. El dueño de una pre-alerta es **solo** el `slCode` guardado en ella. Nunca se deduce de
   `userId`, del nombre del documento ni de la copia de SP1.
3. La coincidencia es por **igualdad exacta** sobre un conjunto pequeño de claves por paquetería.
   Una de esas claves es la búsqueda desde el final (reverse lookup), que es obligatoria:
   - FedEx: código de barras de 34 dígitos → los últimos 12;
   - USPS: 420 + ZIP → el tracking de 20 o 22 dígitos del final.

   **Nunca** hay coincidencias "parecidas" (un dígito distinto no es el mismo paquete).
4. Ante cualquier duda **no hay "P" verde**. La "P" siempre es "P" (pre-alerta); el color dice
   si se puede confiar:

   | Badge | Significado |
   |---|---|
   | P verde | Una sola cuenta, pre-alerta vigente, nombre coherente → se asigna |
   | P ámbar | El nombre del manifiesto no se parece al dueño → revisar |
   | **P roja** | **Algo no está bien: más de una coincidencia** (varias cuentas, o el tracking repetido en el manifiesto) → **no se asigna**, el admin decide |
   | sin P | No hay pre-alerta válida |

5. **La validación de pre-alertas se hace una sola vez, antes de guardar.** Cuando el admin
   guarda, Nova **no ejecuta ningún proceso automático**: no revalida pre-alertas ni reasigna
   clientes o rutas. El admin puede seguir editando a mano y volver a guardar.
6. Una pre-alerta es válida solo si:
   - tiene `slCode` válido;
   - tiene fecha de creación y **no pasa de 90 días**;
   - está activa (no cancelada);
   - no está marcada `needsReview`;
   - no se entregó;
   - no se usó en **otro** manifiesto.

## Matriz de escenarios

Estado: ✅ correcto hoy · 🔧 hueco a corregir en la Fase 1 · 🔍 verificar con datos reales.
"Hoy" = resultado medido el 2026-09-25 sobre el código actual (prueba sobre `batchResolvePreAlerts`
= carga del manifiesto y botón, y `watchPreAlerts` = tiempo real).

### A. Formatos y búsqueda desde el final

| # | Caso | Esperado | Hoy |
|---|---|---|---|
| A1 | Tracking exacto (TBA, 1Z, DHL, USPS 22, FedEx 12/15) | P verde | ✅ |
| A2 | Manifiesto con FedEx de 34 dígitos, pre-alerta con los 12 | P verde | ✅ (N7) |
| A3 | Manifiesto con USPS 420+ZIP, pre-alerta con los 20/22 | P verde | ✅ (N8) |
| A4 | Manifiesto con el corto, el cliente pre-alertó el código de barras largo | P verde si SP2 guardó `canonicalTracking` corto | 🔍 sin `canonicalTracking` no se encuentra (seguro, pero se pierde) |
| A5 | Pre-alerta guardada con espacios o minúsculas (datos viejos) | P verde | 🔍 no se encuentra hoy (seguro, pero se pierde) |
| A6 | Pre-alerta con solo el campo `trackingNumber` (datos viejos) | P verde en **todos** los caminos | ✅ F1.2 (los 3 campos en todos los caminos) |
| A7 | Tracking que difiere en un dígito | sin P | ✅ |
| A8 | FedEx 12 exacto y otra pre-alerta de 15 que termina igual | P verde del de 12 (el de 15 es otro paquete) | ✅ |

### B. Más de una coincidencia

| # | Caso | Esperado | Hoy |
|---|---|---|---|
| B1 | Mismo tracking pre-alertado por 2 cuentas | **P roja** "más de una coincidencia", sin asignar | ✅ F1.6 |
| B2 | Cuenta A coincide exacto y cuenta B coincide desde el final | **P roja** "más de una coincidencia" | ✅ F1.2 + F1.6 |
| B3 | USPS: A con 420+ZIP y B con el tracking de 22 | **P roja** | ✅ F1.6 |
| B4 | La misma cuenta pre-alertó 2 veces el mismo tracking | P verde (un solo dueño) | ✅ |
| B5 | A con pre-alerta de 120 días y B vigente | P verde de B (la vieja no cuenta) | ✅ |
| B6 | A vigente y un documento viejo sin dueño | P verde de A | ✅ |
| B7 | El mismo tracking aparece **2 veces en el manifiesto** | **P roja** "tracking repetido en el manifiesto" en ambas filas, sin asignar (también la forma larga y la corta del mismo número) | ✅ F1.6 (Nova real: antes 4 filas en verde asignadas dos veces; ahora rojas sin asignar) |

### C. Validez de la pre-alerta

| # | Caso | Esperado | Hoy |
|---|---|---|---|
| C1 | Más de 90 días de creada | sin P | ✅ (N5) |
| C2 | Sin fecha de creación | sin P | ✅ (N5) |
| C3 | Cancelada / `active:false` | sin P | ✅ |
| C4 | `needsReview` | sin P | ✅ (N6) |
| C5 | Paquete ya entregado (pre-alerta cerrada por SP2) | sin P | ✅ (N13, con el cierre corrido) |
| C6 | Usada en **otro** manifiesto | sin P | ✅ (N4) |
| C7 | Usada en **este** manifiesto (se reabre) | P verde en **todos** los caminos | ✅ F1.2 (el tiempo real sabe en qué manifiesto está) |
| C8 | Sin `slCode` (legacy) o `slCode` inválido | sin P | ✅ (N1) |
| C9 | Ya facturada | sin P | ✅ |

### D. Dueño y nombre

| # | Caso | Esperado | Hoy |
|---|---|---|---|
| D1 | El nombre del manifiesto no se parece al del dueño | P ámbar "revisa el nombre" | ✅ (N10) |
| D2 | El `slCode` no existe como cliente en SP1 | P ámbar "cliente no existe", sin asignar | 🔍 hoy se omite al corregir; revisar el badge |
| D3 | El admin asignó la fila a mano | Nunca se sobrescribe | ✅ (N11) |
| D4 | La pre-alerta asignó la fila → no se "aprende" nombre → cliente | No se aprende | ✅ (N15) |

### E. Tiempo real

| # | Caso | Esperado | Hoy |
|---|---|---|---|
| E1 | El cliente pre-alerta con la tabla abierta | Solo esa fila se actualiza | ✅ F1.3 (solo se procesan los trackings cuya pre-alerta cambió; Nova real con `LATE_PREALERT`) |
| E2 | El cliente cancela con la tabla abierta | La P desaparece y un aviso pide revisar la fila; el cliente no se revierte solo | ✅ F1.2 + F1.3 (Nova real con `CANCEL_PREALERT`: aviso "Pre-alerta ya no vigente", sin P, fila sin cambios) |
| E3 | La pre-alerta cambia de cuenta con la tabla abierta | Se actualiza si el admin no tocó la fila | ✅ F1.3 (el cambio de dueño cuenta como cambio; las filas del admin se respetan) |
| E4 | Carga inicial en pedazos (grupos de 10) | Se actúa solo con la información **completa** | ✅ F1.3 |
| E5 | Manifiesto reabierto desde la base | No se reasigna solo | ✅ (política de origen de datos) |
| E6 | SP2 no responde o la consulta falla | Sin P + aviso visible "no se pudo verificar pre-alertas" | ✅ F1.3 (tiempo real y botón) |
| E7 | Manifiesto grande (más de 30 trackings) | Todos resueltos | ✅ prueba con 120 trackings (carga y tiempo real iguales) |

### F. Después de guardar

| # | Caso | Esperado | Hoy |
|---|---|---|---|
| F1 | El admin guarda y deja la tabla abierta; llega o cambia una pre-alerta | Nada cambia solo. El tiempo real se detiene | ✅ F1.5 (probado en Nova real: antes la fila recibía la P, ahora no cambia) |
| F2 | Después de guardar: reasignación por nombre, ruta aprendida, ruta del perfil del cliente | Nada automático | ✅ F1.5 (política `saved`). La ruta por defecto sigue siendo la del cliente de la fila: no es un proceso, no cambia datos si el admin no vuelve a guardar |
| F3 | El admin edita a mano después de guardar y vuelve a guardar | Permitido; se guarda lo que el admin hizo | ✅ |
| F4 | Manifiesto reabierto desde la base | Nada automático (modo congelado); la P muestra lo guardado | ✅ F1.5: ya no abre el tiempo real (antes cambiaba la P en vivo) |
| F6 | El admin guarda y **reabre** el manifiesto desde Firestore | La P confirmada se ve igual que al guardar, sin volver a validar | ✅ (antes: al reabrir se perdía la P; el cargador no copiaba la pre-alerta guardada en el registro del manifiesto) |
| F7 | Reabrir un manifiesto con **P roja** | La P roja se ve igual que al guardar (varias cuentas y repetido) | ✅ se guarda `{found:false, ambiguousSlCodes}` y la marca `repeatedInManifest`. Nota: un tracking idéntico repetido queda como **un** paquete al guardar (comportamiento previo); esa fila conserva su P roja |
| F5 | "Corregir por Pre-Alertas" después de guardar | Disponible: es manual, para cuando el admin tenga dudas (decisión 2026-09-25) | ✅ |

Nota: el aviso `NovaFrozenBanner` ("Datos guardados — sin auto-validación") existe pero hoy no se
muestra en ninguna pantalla. No se agregó (sería un cambio visual no pedido).

## Fase 2 — la pre-alerta viaja por ID hasta SP2 (sin búsqueda por tracking)

| Paso | Qué | Dónde |
|---|---|---|
| F2.1 | Al guardar, el paquete de SP1 lleva `preAlertId` + `preAlertSlCode` solo si la pre-alerta está confirmada y es del cliente de la fila (nunca con P roja ni si el admin asignó otro cliente); se borra si deja de aplicar | SP1 62a6864f |
| F2.2 | La sincronización automática de la factura (disparador) envía `preAlertLinks` | SP1 9c0afddd |
| F2.2b | La sincronización **manual** desde Facturas envía lo mismo (el flujo del admin no cambia) | SP1 a68ced56 |
| F2.3 | SP2 lee la pre-alerta por ID, verifica el cliente y liga pre-alerta ↔ paquete: su paquete ligado, o el del tracking exacto, o uno nuevo; nunca un paquete terminado con el mismo número. Sin ID, lo de antes (exacto → búsqueda desde el final → crear) para que nada quede suelto. Sin fusiones | SP2 3303c71 |

Prueba entre sistemas: `scripts/qa-emulator/e2e/sp1-invoice-prealert-link.cjs` (después de `nova-upload.cjs` con `SAVE=1`).
Nota del emulador: después de reiniciarlo, correr `seed.sh` **dos veces** (la primera vez las funciones están frías y los clientes no llegan a SP1).

## Fase 3 — la pre-alerta ya no crea el paquete gemelo (SP2)

| Paso | Qué | Commit |
|---|---|---|
| F3.1 / F3.2 | El registro (formulario y panel) y el disparador \`slPreAlertCreated\` crean solo la pre-alerta; se liga a un paquete solo si el del cliente ya existe. Los gemelos existentes no se tocan | SP2 b99fcba |
| F3.3 | Volver a pre-alertar un número que el **cliente** canceló reactiva la misma pre-alerta (no una segunda) | SP2 58e08c8 |
| F3.4 | Copia de pre-alertas en SP1: **fuera de este proceso** (decisión 2026-09-25: es solo para uso de SP1; Nova lee \`pre_alerts\` de SP2 directamente). No se toca | — |

Pruebas en el emulador: \`sp2-prealert-no-twin.cjs\` (formulario público real, 5/5) y el ciclo completo
formulario → Nova (P verde) → guardar → factura → SP2 crea el paquete ligado por ID.

**Nota (solo SP1, no se toca):** "Reasignar pre-alerta" (página Pre-Alertas de SP1 → \`slReassignPreAlert\`) busca en la copia
de SP1 con el ID de la pre-alerta de SP2, pero la copia usa el ID del paquete gemelo; y al reasignar cambia la copia
y el gemelo, nunca la pre-alerta de SP2 (la que usa Nova).
