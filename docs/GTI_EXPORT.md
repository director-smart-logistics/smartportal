# Archivo GTI (tiquetes) — Gestión de Rutas y GTI Manifiestos

**Referencia (2026-09-28):** el archivo que el cliente sube con éxito a GTI ("GTI que si sirve 28-09 -1.xlsx"): una hoja
`Facturas`, **58 columnas**, una fila por factura, dos líneas por fila. El generador único es
`client/lib/services/gti-export.ts`; `client/lib/services/__tests__/gti-export.spec.ts` compara encabezados y una fila celda por
celda (valor y tipo) contra esa referencia, y los montos de 7 filas reales. Regenerar el archivo completo de referencia
(127 filas, 7 424 celdas) dio 0 diferencias.

## Reglas
| Punto | Regla |
|---|---|
| Columnas | Las 58 de `GTI_HEADERS`, en ese orden (la plantilla vieja de 52 corría todo desde la columna H). |
| Constantes | Cuenta 224916 · actividad 5229.0 · tipo doc 4 (tiquete) · condición 1 · medio de pago 6 · moneda 1. |
| Línea 01 | Cantidad 1 · código 01 · CABYS 6531100000000 · unidad 24 · **Flete Internacional** · impuesto 1 / 0 / tarifa 1. |
| Línea 02 | Cantidad 1 · código 02 · CABYS 6791000000000 · unidad 24 · **Logistica de Importación** · impuesto 1 / 13 / tarifa 8. |
| MONTO | Los colones de la factura tal como se facturó (`amountCRC`). Solo si falta: USD × TC de la factura. |
| FLETE | TRUNC(MONTO × 0.8, 2) — exento. |
| LOGÍSTICA | TRUNC((MONTO − FLETE) / 1.13, 2) — **sin IVA**: GTI lo agrega (sumarlo aquí cobraría doble). |
| Factura electrónica | (2026-10-05, dueño) **Se escriben**, igual que antes del 28/09 (git 0e75668d → c139153d): "Tipo de documento" = **1**, "Cedula" = cédula del cliente y "Telefono" = teléfono del cliente, tal como están guardados; todo lo demás igual al tiquete ("Tipo de cedula" y "Correo" vacíos, mismos CABYS, líneas y montos). Solo cambian de lugar: van bajo las columnas del mismo nombre de la plantilla de 58 (la vieja de 52 las corría). Del 28/09 al 05/10 se dejaban fuera del archivo. |
| Sin monto | No se escribe y se reporta. |
| Solo facturas vigentes | (2026-10-05) Una factura **eliminada**, cancelada o anulada nunca reemplaza a la vigente aunque liste los mismos trackings (`isLiveInvoice`). Caso real: SL1954 en SL-MEGA-MAN-29-09-2026 tenía una copia eliminada y la pagada; según el orden de Firestore salía o no en el archivo. Aplica al cruce tracking → factura de Gestión de Rutas (tabla y GTI), al contador "GTI ↓" y al estado de factura por tracking. |
| Marcado | Solo las facturas escritas en el archivo (factura electrónica incluida) suman `gtiDownloadCount`. |
| GTI Manifiestos | Cada descarga **se suma** al registro del manifiesto (misma factura = se reemplaza, nunca se duplica). Editar filas o TC usa la misma fórmula; no hay TC por defecto. |

## Pruebas
- Unitarias: `gti-export.spec.ts` (14: plantilla, montos, `isLiveInvoice`, fila de factura electrónica = tiquete salvo tipo/cédula/teléfono).
- E2E emulador: `scripts/qa-emulator/e2e/sp1-gti-download.cjs` (10; 3/3b factura electrónica en el archivo; 7/7b cliente con factura eliminada + vigente) — descarga real desde Gestión de Rutas y desde la página GTI, archivo leído y comparado.
