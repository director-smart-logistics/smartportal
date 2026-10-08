# F10: "Día 1" en los manifiestos de consolidación

Regla única: `client/lib/consolidation/day-one.ts`. La usan:
- la línea de cada paquete (badge "Día 1");
- el contador del cliente ("Consolida desde", período de gracia, "Más de 90 días");
- el diagnóstico "En período de gracia".

## Regla (definida por el usuario)

- **Cada paquete** tiene como "Día 1" la fecha de la **última factura a la que perteneció**.
  - Los paquetes de la factura #1 conservan la fecha de la #1; los de la #2 y la #3, la de su factura.
  - Si un paquete se reasigna a un manifiesto y se **re-factura**, toma la fecha de la factura nueva.
  - Si nunca se facturó, es el día en que entró a consolidación.
- **El contador del cliente** se rige por el "Día 1" **más viejo** entre sus paquetes, es decir, por la factura más vieja.
- **Cada línea de paquete muestra de dónde sale su fecha:**
  - `Día 1: 18/09/2026 · anulada SL…-C`: la factura en que fue anulado;
  - `· factura SL…-C`: la factura en que está ahora;
  - `· sin factura`: nunca se facturó.

## Flujos encontrados

En el código y en `audit_logs` de producción, facturas de consolidación, de mayo a septiembre de 2026:

| Flujo | Veces | Qué deja en el paquete |
|---|---|---|
| Anulada → consolidación transitoria | 198 | `annulledInvoiceNumber`, `annulledInvoiceDate` e `invoicedAt` (fecha de esa factura) y la nota "Factura X anulada" |
| Anulada → otro bloque (DAN o MEGA-MAN) | 71 | Lo mismo |
| Eliminada | 140 | Lo mismo; a veces sin nota |
| Eliminada permanentemente | 6 | Lo mismo; a veces sin nota |
| Des-anulada → borrador | 14 | El paquete vuelve a la factura |
| Anulada → pagada | 26 | La factura revive |
| Pagada → anulada | 6 | Como anulada |
| Movido entre bloques o manifiestos sin factura | 21 | No cambia el "Día 1" |

## Qué se corrigió

1. **Contador del cliente.** Usaba el "Día 1" **más reciente** (cambio del 2026-09-23). Ahora usa el **más viejo**.
2. **Paquete.** Si la nota del historial traía una factura vieja y los campos del paquete la última, ganaba la vieja. Ahora gana la más nueva de todas las fuentes. La prueba lo reproducía antes del cambio: dio 02/07 en lugar de 18/09.
3. **"En período de gracia".** Usaba `firstConsolidatedAt`, que guarda la fecha más vieja a propósito. Ahora usa el mismo "Día 1" que el badge.
4. **Cada línea** muestra la factura de la que sale su "Día 1".

## Validación con producción (solo lectura, 2026-09-26)

Se revisaron 160 paquetes en bodega, de 44 clientes. En 141 de ellos hay facturas reales que los contienen (`invoices.trackingNumbers`); en esos, la regla coincide con la fecha de la última factura en **133**.

Los **8** restantes son de 3 clientes (SL8150, SL3581, SL5349). Tienen **facturas en borrador de junio y julio que contienen el paquete sin estar ligadas a él** (el paquete no tiene `invoiceId`). La regla da la fecha de la factura en que fue anulado, que es lo correcto; esos borradores huérfanos deben revisarse a mano.

## Pruebas

- `client/lib/consolidation/__tests__/day-one.spec.ts`: 18 casos, uno por escenario, más tu ejemplo #1/#2/#3 tal cual.
- `ConsolidationCustomerCard.spec.tsx`: cada línea muestra la fecha y la factura.
- Suites de consolidación y servicios: 1219 en verde.

## Anular una factura es atómico (2026-09-26)

**Problema, reproducido en el emulador.** Al anular una factura, la app escribía primero la factura como anulada y **después** buscaba y movía sus paquetes a consolidación. La anulación dispara el trigger de SP1 `enforcePackageLinksForInvoice`, que quita el vínculo de los paquetes de esa factura. Si el trigger llegaba antes, la app ya no encontraba el paquete, y el paquete quedaba **fuera de consolidación, sin factura y sin el rastro de la anulada**: desaparecía de la vista. Pasaba de forma intermitente. En producción no se encontró en facturas de consolidación, pero la prueba de SL3506 muestra que este tipo de huérfano ya ocurrió.

**Corrección.** En los cuatro lugares que anulan y mueven paquetes, la app ahora localiza los paquetes, luego escribe **en un solo commit** la factura anulada y todos sus paquetes movidos, y después hace lo demás (SP2, bitácora, UI):

| Lugar | Función |
|---|---|
| Paquetes: mover factura a transitoria | `moveInvoiceToTransitoria` (el flujo más usado: 198 veces) |
| Nova: anular antes de re-crear | `annulInvoicesByTrackingsAndManifest` |
| Pantalla de Facturas | `handleAnnulInvoice` |
| Tabla de Paquetes (modal de facturas) | `handleAnnulInvoiceFromModal` |

La tarjeta del cliente y la fila de factura en consolidación ya lo hacían en un solo batch.

- El trigger ahora ve los paquetes ya en transitoria y no los toca.
- No hay estado intermedio en la vista, y el paquete se queda en consolidación hasta que el admin lo mueva.
- **No se cambió ningún campo que se escribe ni ningún dato existente.** Solo cambió el orden, que ahora es una única operación.

**Pruebas:**
- `invoice-service.spec.ts`: el primer commit ya lleva la factura anulada **y** el paquete. La mutación que vuelve a separar las escrituras falla.
- Suites de facturas, consolidación, servicios y paquetes: 1258 en verde.

## Emulación de punta a punta

`scripts/qa-emulator/e2e/sp1-consolidation-day-one.cjs` (en el runner), 10/10, estable en corridas repetidas. Usa el Nova real y los flujos reales de anulación de la app:

| Paquete | Escenario | Resultado |
|---|---|---|
| P0 | Nunca facturado, enviado a transitoria | "sin factura" |
| P1 | Factura #1 anulada | Fecha de la #1 |
| P2 | #1 y #2 anuladas | Fecha de la #2 |
| P3 | #1, #2 y #3 anuladas | Fecha de la #3 |
| P6 | Anulado por el otro flujo de anulación | Fecha de su factura |
| P4 | En una factura activa | No aparece como línea sin facturar |
| P5 | Sacado a otro bloque | Sale de la vista (la vista solo muestra transitoria, igual que antes) |

- El contador del cliente toma la factura más vieja.
- **Sin regresión funcional:** la tarjeta completa con el código anterior es idéntica línea por línea (79 líneas), salvo el "Día 1", su factura y el contador.
