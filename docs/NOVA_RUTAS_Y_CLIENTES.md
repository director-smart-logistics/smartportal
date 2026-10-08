# Nova: clientes y rutas (comportamiento vigente y decisiones)

Actualizado el 2026-09-26. Probado de punta a punta en el emulador QA con el Nova real (`scripts/qa-emulator/e2e/sp1-nova-route-assign.cjs`).

## Cómo trata Nova a los clientes del manifiesto

| Caso | Qué muestra Nova | Qué guarda |
|---|---|---|
| El nombre del manifiesto **no coincide** con ningún cliente de `customers` | El **nombre tal como viene en el manifiesto**, con "sin ruta" | Si el admin le asigna una ruta, Nova aprende "este nombre → esta ruta" (`unmatched_route_learning`) |
| El nombre coincide o el admin **elige** un cliente, y ese cliente **no tiene ruta** | El cliente, con "sin ruta" | — |
| El admin **asigna una ruta** a un cliente | La ruta en la fila y en su grupo | Se guarda al instante en `customers/{SL}.ruta` de SP1 (con `rutaSetByAdminAt`, `rutaLastUpdatedBy` y bitácora `customer_ruta_changed`). También se actualiza lo que Nova aprendió de ese cliente (`match_feedback.ruta`). |

## Decisión: la ruta asignada en Nova NO se envía a SP2 (se ratificó el 2026-09-26)

La ruta que el admin asigna **en Nova** se queda en SP1 (`customers`). **No** se escribe en el `users` de SP2.

- Es el mandato ya vigente en el código: `functions/src/customers/triggers.ts`, "SP1 MANDATE". El trigger de `customers` solo envía la ruta a SP2 cuando la escritura trae `syncRutaToSp2 === true`.
- El 2026-09-26 se evaluó cambiarlo (gap "R1"), y el usuario decidió **no aplicarlo**.
- La prueba e2e lo **protege**: verifica que, después de asignar la ruta en Nova, el `users` de SP2 **no** cambie. Si alguien lo cambia sin querer, la prueba falla.

### Quién escribe la ruta y a dónde llega

| Pantalla / camino | Llamada | SP1 `customers` | SP2 `users` |
|---|---|---|---|
| Nova: menú de ruta del grupo o de la fila (`NovaTableModal`) | `updateCustomerRuta(…, false, 'nova_route_picker')` | ✅ | ❌ (por decisión) |
| Nova: selector de ruta (`NovaRoutePickerModal`) | `updateCustomerRuta(…, false, 'nova_route_picker')` | ✅ | ❌ |
| Nova: asignación de cliente (`use-nova-customer-assignment`) | `updateCustomerRuta(…, false, 'nova_assignment')` | ✅ | ❌ |
| Nova: chat (`use-nova-chat`) | `updateCustomerRuta(…, false, 'nova_chat')` | ✅ | ❌ |
| Nova Learning (`NovaLearning`) | `updateCustomerRuta(…, false, 'nova_learning')` | ✅ | ❌ |
| Hoja USA marítimo (`SpreadsheetRow`) | `updateCustomerRuta(…, false, 'spreadsheet')` | ✅ | ❌ |
| **SP1 → "Editar cliente"** (`EditCustomerModal`), cuando cambia la ruta | `updateCustomerRuta(…, true, 'edit_customer_modal')` + `syncRutaToSp2` | ✅ | ✅ **único camino explícito a SP2** |

Para que la ruta llegue al cliente en SP2, el admin la cambia en **"Editar cliente"** de SP1.

## R2 corregido: el auto-guardado escribe solo lo que el admin cambió (effdfad1)

Antes, al guardar la ruta B, Nova volvía a escribir los paquetes de la ruta A y podía pisar cambios hechos fuera de la
pestaña. Ahora el auto-guardado compara con cómo estaba cada fila al abrir o al último guardado y escribe **solo** las
filas y campos que el admin cambió (`sp1-nova-save-scope.cjs`, en el runner, incluida la variante EXTERNAL).

## Regla: en Nova regenerar factura NO manda paquetes a consolidación (2026-09-26)

En NovaTable no existe "anular" como acción suelta; Nova anula solo como parte de **regenerar**:
"Actualizar BD → Anular y re-crear", tracking reasignado a otro cliente, Acciones → "Re-generar factura",
Acciones → "Revalidar cálculos" y mover paquetes a otro manifiesto.

- En todos esos casos Nova **solo anula la factura vieja** y desliga sus paquetes (un solo commit atómico).
  Los paquetes **se quedan en su manifiesto con su estado** y la factura regenerada los liga de nuevo.
- Mandar paquetes a consolidación se hace **solo desde Facturas** (y la tarjeta de consolidación / Paquetes).
- Código: `annulInvoicesByTrackingsAndManifest(..., { keepPackagesInManifest: true })` en las 6 llamadas de Nova.
  Sin esa opción (devoluciones en DriverRouteWizard, `manifest-consolidation-service`) se mantiene el traslado.
- Antes de este cambio (desde f9666f15, 2026-07-27) esas llamadas movían los paquetes a `consolidacion_transitoria`
  con estado "consolidated": la factura nueva quedaba sin paquetes y el auto-guardado posterior no los escribía
  aunque el pie decía "Guardado" (hallazgo F2). Pendiente: medir en prod (solo lectura) si hay paquetes atrapados así.
- Prueba: `sp1-nova-invoice-scope.cjs` pasos 6 y 7.

## Pruebas

| Prueba | Qué cubre | Estado |
|---|---|---|
| `sp1-nova-route-assign.cjs` | Nombre sin coincidencia, cliente sin ruta, ruta asignada → SP1 al instante, SP2 **sin cambios** (decisión), `match_feedback` actualizado | En el runner |
| `sp1-nova-invoice-scope.cjs` | "Guardar y facturar" por ruta; "Anular y re-crear" solo del bloque; paquetes se quedan en el manifiesto; edición tras regenerar llega a la BD; etiqueta de factura | En el runner |
| `sp1-nova-save-scope.cjs` | "Solo guardar" por ruta: R2 corregido | En el runner |
