# F12: una sola dirección por cliente, dentro de su doc de `users` (se depreca la colección `addresses`)

2026-09-25. **ALTO RIESGO. NADA SE APLICA SIN APROBACIÓN, paso por paso.**

Una dirección equivocada significa un paquete entregado en el lugar equivocado. Es un daño irreversible para el cliente y para la empresa, y un riesgo legal. Este plan existe para que la migración, por sí misma, **no cambie la dirección de ningún cliente**.

## Estado en producción (solo lectura, 2026-09-25)

### Esquema de `users` en SP2

- **El esquema del código no declara `addresses` ni `defaultAddress`.** `UserProfileSchema` (`src/infrastructure/schemas/user-schemas.ts`) solo tiene `location`. Los docs sí los traen, pero nada valida su forma.
- **2.888 usuarios:**
  - `addresses[]` en 1.591;
  - `defaultAddress` en 784;
  - `location` en 2.882.
- **Tipos mezclados:** `createdAt` es Timestamp en 1.298 docs y texto en 1.584. `updatedAt` es texto en 42 y `{}` en 1 (bug viejo). Cualquier lector debe tolerar ambos.
- **La forma de la dirección es la misma** en la colección, en `addresses[]` y en `defaultAddress`: id, alias, type, streetAddress, details, province, canton, district, city, country, postalCode, coordinates, recipientName/Phone, deliveryInstructions, requiresEncomienda, encomienda, encomiendaPendingReview/SubmittedName, isDefault/isPrimary, isActive, status, userId, createdAt, updatedAt, updatedBy.

### Dónde vive la dirección de cada cliente, frente a lo que SP1 imprime en las etiquetas (`customers/{sl}.defaultAddress`)

Auditoría `scripts/audit/audit-customer-addresses.cjs --prod`, 2026-09-26. La regla de "cuál es la principal" es una sola y la comparten la auditoría y la migración (`scripts/audit/address-principal.cjs`).

| Clientes | Caso | Migración |
|---:|---|---|
| **2.511** | La principal en SP2 **= lo que SP1 imprime hoy** | **Automática, con verificación.** La etiqueta no cambia. |
| 29 (dentro de los 2.511) | Tienen más de una dirección marcada como principal | **Revisión.** SP1 podría quedarse con otra. |
| 3 | **SP1 imprime una dirección DISTINTA** a la principal de SP2 | **Revisión humana.** Nunca automática. |
| 1 | Tiene dirección en SP2 y ninguna en SP1 | Revisión |
| 9 (de 53) | La dirección escrita a mano (override) es distinta a la de SP2 | Revisión (F11) |
| 367 | Sin dirección en ningún lado | Nada que migrar. La registran en el portal. |
| 121 | Docs de dirección cuyo usuario ya no existe | No se migran. Solo informativo. |
| 115 | Clientes SP1 sin usuario en SP2 | Solo informativo |

La lista detallada, cliente por cliente, se genera en `audit-output/customer-addresses-prod-<fecha>.md`. Tiene datos personales: **no va a git**.

## Verificado: dónde se crean hoy las direcciones nuevas

Se revisó la premisa "los usuarios nuevos ya crean la dirección en su doc de `users`". **Hoy no es así.**

- **Últimos 30 días:** 137 usuarios nuevos. **121 tienen la dirección en la colección `addresses`** y además una copia en `users`. **0 la tienen solo en `users`**, y 16 no tienen dirección. La última dirección creada en la colección fue el 25-09-2026 a las 22:31 UTC.
- **Causa:** `api.user.addresses.create` (SP2 `src/infrastructure/api/api-service.ts`) escribe en `COLLECTIONS.ADDRESSES`. La copia en `users` la ponen después `slAddressDenormalizer` (functions de SP2) y `userService.syncLocationFromAddresses` (cliente).
- **Consecuencia para el orden:** el código que escribe la dirección en `users` (paso 2 de abajo) se despliega ANTES de migrar datos. Si no, cada dirección nueva volvería a quedar solo en la colección.

## Correos y envíos a SP1 al escribir en `users` (revisado)

- **Correo a gerencia:** "Dirección modificada" no se envía si `profileLastUpdatedBy` es `'system_migration'` (`user-triggers.ts`). La migración escribe con ese valor.
- **Envío a SP1:** sí ocurre (`onUserProfileWritten`, `slUserProfileUpdated`). Para clientes con una sola principal, SP1 queda con la misma dirección que tiene hoy. La migración lo verifica cliente por cliente: el texto de la etiqueta antes tiene que ser igual al de después.

## Mecanismos de seguridad (todos obligatorios)

1. **Línea base primero.** Antes de escribir nada, una foto congelada (JSON + huella por cliente) de tres cosas:
   - la dirección de la colección;
   - la copia en `users`;
   - lo que imprime SP1.
2. **No se borra nada.** Los docs de la colección `addresses` quedan intactos como respaldo e historial; solo dejan de usarse. Un rollback es restaurar `users.defaultAddress` desde la foto.
3. **Idempotente y determinista.** La misma entrada da siempre el mismo resultado. Correrlo dos veces no cambia nada.
4. **Un cliente = una escritura atómica.** Es una transacción que:
   - vuelve a leer los docs del cliente;
   - se cancela si algo cambió desde la foto (el cliente editó mientras tanto);
   - escribe `defaultAddress` + `addresses: [la misma]`.
5. **Verificación después de cada escritura:**
   - releer `users` y comparar campo por campo contra el origen;
   - esperar a que SP1 la reciba y confirmar que **el texto que imprime es exactamente el mismo que antes**;
   - ante cualquier diferencia: **se detiene toda la migración** y ese cliente se restaura desde la foto.
6. **Gradual:**
   - dry-run (reporte completo, sin escribir);
   - solo SL25001 (cuenta QA);
   - 10 clientes, con reporte para que lo revises;
   - lotes de 100 con verificación;
   - se detiene ante la primera anomalía.
7. **Registro completo.** Un registro por cliente en `address_migration_log`: antes, después, huellas, resultado y quién lo corrió.
8. **Los casos de revisión** (29 + 3 + 1 + 9) van en el reporte para el admin, con las dos direcciones lado a lado. Solo se migran con una decisión explícita, cliente por cliente.

## Cambios de código (en ramas, con e2e en el emulador antes de tocar datos)

1. **Transición, doble lectura.** Todos los lectores (cliente SP2, functions SP2, sync SP1 de F8.1) leen primero `users.defaultAddress` y, si el cliente aún no está migrado, la colección.
2. **Transición, doble escritura.** Los servicios de SP2 (`api.user.addresses.*`, `adminService.addresses.*`) mantienen las mismas firmas, así que la pantalla no cambia. Escriben `users.defaultAddress` + `addresses: [la misma]`, y mientras dure la migración también mantienen actualizado el doc de la colección.
3. **SP1 → SP2** (F11.2, casilla en la etiqueta de Nova): "Solo en SP1" / "Actualizar también en SmartWeb". La segunda opción escribe la dirección principal del cliente en SP2, por el mismo camino del paso 2.
4. **Corte** (solo con el 100% migrado y verificado): se deja de escribir en la colección y se retiran sus triggers.
5. **El esquema declara `defaultAddress` / `addresses`** con `AddressSchema`, para que nadie vuelva a escribir una forma incorrecta.

Cada paso lleva su commit, pruebas unitarias, e2e en el emulador (incluida la prueba "mismo texto en la etiqueta antes y después") y tu aprobación antes de producción.
