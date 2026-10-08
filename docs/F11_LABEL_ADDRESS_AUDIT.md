# F11: auditoría de etiquetas de envío, manifiesto y salida de encomiendas (integridad de la dirección del cliente)

2026-09-25. La regla (F8): cada cliente tiene UNA dirección, la principal. SP2 es su fuente de verdad y SP1 la recibe al instante (F8.1). La estructura de datos se normaliza en F12 (`docs/F12_ADDRESS_STRUCTURE_PLAN.md`).

## Dónde arma SP1 la dirección de una etiqueta o manifiesto

| # | Pantalla | Función | Cómo elige la dirección |
|---|---|---|---|
| A | Etiquetas de envío (`pages/shipping/ShippingLabels.tsx`) | `buildFullAddressString`, `buildCourierServiceString` | override → `defaultAddress` (aunque esté inactiva) → `isDefault` o `addresses[0]` → `location` → `direccionExacta` |
| B | Nova, etiqueta (`components/nova/NovaShippingLabelModal.tsx`) | l.522 | el admin elige "Cliente (SmartWeb)" o "Admin (Portal)" (el override). La del cliente: `defaultAddress` → default+activa → `addresses[0]` |
| C | Nova, etiquetas masivas de encomienda (`EncomiendaBulkLabelModal.tsx`) | `resolveDeliveryAndCourier` l.45 | override → igual que B |
| D | Salida y manifiesto de encomiendas (`encomiendas/components/useEncomiendaDispatchData.ts`) | `getCustomerAddress`, `getEncomiendaServiceName`, `getCustomerNotes` | override → `defaultAddress` → default+activa → default → activa → `[0]` |

## Hallazgos (producción, solo lectura)

| # | Hallazgo | Efecto |
|---|---|---|
| L1 | **Cinco reglas distintas** de "cuál dirección". Se usa `defaultAddress` aunque esté inactiva, y algunas caen en `addresses[0]` aunque esté inactiva. | Dos pantallas pueden imprimir direcciones distintas para el mismo cliente. |
| L2 | **La dirección escrita a mano (`adminAddressOverride`) gana PARA SIEMPRE en A, C y D.** No tiene fecha. Si el cliente cambia su dirección en SP2, esas etiquetas siguen imprimiendo la escrita a mano. Nunca llega a SP2. | Dirección vieja en la etiqueta. **53 clientes** tienen una. 44 son la misma dirección que ese cliente ya tiene en SP2 (el admin la volvió a escribir), **9 son distintas** (incluido 1 cliente sin dirección en SP2). |
| L3 | **Editar la dirección en SP1 ("Editar cliente") no llega a las etiquetas ni a SP2.** El modal guarda campos sueltos (`address`, `deliveryAddress1..3`, `location`). Las etiquetas leen primero `defaultAddress` (que viene de SP2), así que ignoran la edición. `onCustomerWritten` solo sincroniza ruta y consolidación a SP2. | Por eso el admin termina escribiendo la dirección a mano en la etiqueta (L2). |
| L4 | **El servicio de encomienda en D** toma la primera dirección con cualquier encomienda (no la principal) e ignora lo que el cliente propuso (F8.2). Las etiquetas usan `resolveCustomerEncomiendaService`. | El manifiesto y la etiqueta pueden decir servicios distintos. |
| L5 | **El texto de la dirección en D** usa `province \|\| canton` y `city \|\| district`, y pierde el cantón y el distrito. Las etiquetas imprimen distrito, cantón y provincia. | El manifiesto muestra menos datos que la etiqueta. |
| L6 | **La casilla de la etiqueta de Nova** dice "Guardar cambios como dirección de administración preferida (no altera el perfil del cliente en SmartWeb)". Solo guarda en SP1 y no ofrece actualizar SP2. | El admin no tiene cómo corregir la dirección del cliente desde la etiqueta. |

## Plan (va junto con F12, que normaliza la estructura)

1. **F11.1: una regla, una función pura.** `client/lib/customers/label-address.ts` la usan A, B, C y D:
   - la principal (la misma regla que F12: activa, la marcada, y si no la más antigua);
   - el servicio sale de `resolveCustomerEncomiendaService`.

   Cada pantalla conserva su formato. D imprime distrito/cantón/provincia igual que las etiquetas (L5).
2. **F11.2: los ajustes del admin.** La casilla de la etiqueta de Nova (y "Editar cliente") ofrece:
   - **"Solo en SP1"**: queda como dirección de administración, con fecha;
   - **"Actualizar también en SmartWeb (SP2)"**: se escribe la dirección principal del cliente en SP2 (su doc de `users`, F12). Vuelve a SP1 y todas las etiquetas la usan. No hay que volver a escribirla.
3. **F11.3: la dirección escrita a mano** solo aplica mientras sea más nueva que la dirección del cliente (`savedAt`). Cuando el cliente cambia su dirección, gana SP2. Para los 53 existentes: las 44 iguales se pueden quitar sin cambiar la etiqueta, y las 9 distintas van a revisión. Script con dry-run.
4. **e2e en el emulador:**
   - la misma dirección en A, B, C y D;
   - el admin la corrige en SP1 → SP2 la tiene → la etiqueta la usa;
   - el cliente la cambia en SP2 → la etiqueta usa la nueva, aunque exista una escrita a mano vieja.

## F11.2 aplicado: la etiqueta de Nova puede actualizar la dirección del cliente en SmartWeb

La etiqueta de Nova tiene ahora dos casillas:

| Casilla | Qué hace |
|---|---|
| "Guardar cambios como dirección de administración preferida" (marcada por defecto, como antes) | Solo SP1 (`adminAddressOverride`, con `savedAt`). |
| **"Actualizar también la dirección principal del cliente en SmartWeb (SP2)"** (**marcada por defecto** desde el 2026-09-26; solo actúa si el admin escribió en el campo de dirección de esa etiqueta, nunca en lote ni con el texto cargado sin tocar) | La función `slUpdateSp2AddressFromLabel` escribe la dirección principal en SP2. SP2 la devuelve a SP1 de inmediato (0,5 s en el emulador), y todas las etiquetas y el manifiesto la imprimen. |

**Cómo se lee el texto de la etiqueta** (el inverso de cómo el modal lo arma):
- la primera línea es `streetAddress`;
- las líneas del medio son `details`;
- la línea "Instrucciones: …" es `deliveryInstructions`.

Provincia, cantón, distrito, destinatario y encomienda **no se tocan**. Si la etiqueta imprimiría lo mismo, no se escribe nada.

**No se borra nada (decisión del 2026-09-26).** Un campo solo se reemplaza con un valor que no esté vacío:
- si el texto no trae la línea de detalles, se conservan las otras señas del cliente;
- si no trae instrucciones, o trae "Instrucciones:" vacío, se conservan las notas del cliente (el modal omite esa línea cuando repite los detalles).

El valor anterior queda en el registro (`before`).

**Protecciones:**
- Solo personal: los roles de `isAgent()` en las reglas de SP1. Repartidores y clientes no pueden.
- Exactamente una cuenta en SP2 con ese SL.
- El cliente ya debe tener dirección principal en SP2. No se inventa provincia, cantón ni distrito.
- Si tiene dos direcciones marcadas como principal, se rechaza y no se cambia nada.
- La escritura es la misma que la del almacén de SP2 (F12), en un solo lote: `users.defaultAddress`, `addresses: [misma]`, `addressModel: 'single-v1'` y la copia de transición.
- No se marca `sp1LastPushAt`, para que SP2 empuje a SP1.
- El antes y el después quedan en SP1, en `sp2_address_admin_edits`, para revisarlos o restaurarlos.

**Corrección adicional:** desmarcar "Guardar cambios…" no tenía efecto, porque el callback usaba el valor inicial de la casilla. Ya se respeta.

**Código y pruebas:**
- `functions/src/customers/label-address-sp2.ts`: la regla pura. Es la misma regla de F12, y `functions/test/label-address-sp2.spec.ts` verifica que siga igual a `scripts/audit/address-principal.cjs` (13/13).
- `functions/src/customers/label-address-sp2-callable.ts`: la función.
- `client/components/nova/__tests__/NovaShippingLabelModal.sp2-address.spec.tsx`: las casillas.
- e2e `scripts/qa-emulator/e2e/sp1-label-address-sp2.cjs`: antes 0/5, después 6/6 (el caso 6 comprueba que no se borra nada). En la mutación (quitar el rol y marcar `sp1LastPushAt`), las verificaciones fallan.

**Pendiente (L3):** "Editar cliente" en SP1 (campos planos) todavía no llega a SP2. Se puede reutilizar esta misma función en un paso aparte.

## F11.3: sincronizar las direcciones escritas a mano con SP2 (nada se borra, regla por contenido)

Script: `scripts/audit/cleanup-admin-overrides.cjs`.
- Corre en dry-run salvo que se pase `--apply`.
- En producción, `--apply` exige `--sl` o `--limit`.
- Escribir en SP2 exige además `--sp2`, que va **solo después de desplegar SP1 y SP2**.
- `--rollback <runId>` deshace una corrida.

**Por qué por contenido y no por fechas.** La fecha de la dirección del cliente también cambia cuando el admin guarda el servicio de encomienda (SP2 vuelve a enviar la dirección a SP1). En producción, 15 casos parecían "el cliente cambió después" con 0 días de diferencia y las mismas palabras. Comparar fechas no es preciso.

Se compara **cada palabra y cada número** de dirección, otras señas e instrucciones:
- no importan tildes, mayúsculas ni saltos de línea;
- los números siempre cuentan;
- la provincia, el cantón y el distrito del cliente no cuentan como información nueva.

| Clase | Regla | Qué hace con `--apply` |
|---|---|---|
| **IGUAL** | Mismo contenido; solo cambia el formato | Le agrega la fecha (`savedAt`). La escrita a mano queda igual. |
| **A_SP2** | El admin **agregó** información y no le falta nada de la del cliente | Con `--sp2`, se escribe en SP2 con la función de F11.2, sin vaciar ningún campo; SP1 la recibe al instante. **Verificación:** la dirección resultante debe contener cada palabra y número de las dos versiones. Si falta uno solo, se restaura SP2 y la corrida se detiene (exit 2). |
| **REVISAR** | A la escrita a mano le falta información del cliente, las dos tienen información propia, el servicio de encomienda es otro, o el cliente no tiene dirección | Nada. La etiqueta sigue igual que hoy. El reporte muestra las palabras que tiene cada lado. |

- **No se borra nada:** en SP1 solo se agregan `savedAt` y `savedAtSource`.
- **Registro:** `admin_override_cleanup_log` (SP1) y `sp2_address_admin_edits` (antes y después en SP2).
- **Rollback:** quita solo lo que se agregó y restaura SP2, salvo que el cliente la haya cambiado después.

**Producción (dry-run, solo lectura, 2026-09-26):** 53 escritas a mano.

| Clase | Cantidad | Detalle |
|---|---|---|
| IGUAL | 35 | Mismo contenido. |
| A_SP2 | 2 | El admin agregó información. |
| REVISAR | 16 | 7 donde **la del cliente trae información que hoy la etiqueta no imprime**, 6 donde las dos tienen información propia, 2 con otro servicio de encomienda y 1 sin dirección del cliente. |

El reporte con las palabras de cada lado está en `audit-output/f11-overrides-*.md` (no se sube al repositorio).

**Pruebas:**
- Unitarias: `scripts/audit/__tests__/cleanup-admin-overrides.spec.ts` (7/7).
- e2e: `scripts/qa-emulator/e2e/sp1-override-cleanup.cjs` (7/7; incluye la parada por precisión, `--apply` sin `--sp2`, el sync real SP2 → SP1 y el rollback). Está en el runner.

### Revisión manual (2026-09-26)

Las 18 direcciones que no son IGUAL (2 A_SP2 y 16 REVISAR) **no se actualizan automáticamente**. Cada una tiene una propuesta **solo de formato**: mayúsculas, tildes, puntuación y ortografía evidente, con las mismas palabras. Lo que agregó el admin va al final del mismo campo, y nada se reescribe ni se reordena.

Una verificación estricta comprueba cada propuesta: no puede faltar ninguna palabra ni número del original (admin + cliente) ni aparecer ninguna palabra nueva. Las correcciones de ortografía se listan una por una. Probé que el verificador detecta una pérdida y un agregado.

La lista está en `audit-output/F11_REVISION_MANUAL_DIRECCIONES.md` (local, no se sube al repositorio). Se aprueban una por una, y solo después del despliegue único se aplican las aprobadas.


## 2026-10-07 — el modal "Generar etiqueta" muestra las dos direcciones
Caso SL5808: una dirección escrita a mano por un admin antes de F11 (sin fecha) ganaba a la del cliente y el admin solo
veía una. Ahora, cuando existe dirección escrita por admin, el modal muestra **las dos** (Cliente (SmartWeb) y Escrita por
admin (Portal)) con su fecha y servicio, marca **"Más reciente"** y avisa si la del admin no tiene fecha o si el cliente
cambió su dirección después. La elección por defecto NO cambia (`activeAdminOverride`); tocar una tarjeta usa esa dirección.
`compareLabelAddresses()` en `client/lib/customers/label-address.ts`; e2e `scripts/qa-emulator/e2e/sp1-label-modal-both-addresses.cjs`.
