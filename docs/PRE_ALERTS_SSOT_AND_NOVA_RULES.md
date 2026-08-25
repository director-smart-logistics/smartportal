# Guía Definitiva de Pre-Alertas (SSOT SP2), Canonicalización y Reglas de Negocio en Nova

Este documento establece las reglas de negocio, la arquitectura de **Única Fuente de Verdad (SSOT)**, el motor de canonicalización postal y las políticas de inmunidad de datos de **Nova** para el procesamiento de manifiestos en SmartLogistics.

---

## 1. Arquitectura de Única Fuente de Verdad (SSOT en SP2)

### A. Principio Fundamental
* **`smart-portal-2` (SP2)** es la **Única Fuente de la Verdad (SSOT)** para la colección `pre_alerts`.
* Las pre-alertas son creadas por los clientes finales directamente en el portal de SmartWeb (SP2).
* **Queda estrictamente prohibida la duplicación de colecciones de pre-alertas en SP1**. Nova y todos los módulos administrativos de SP1 consultan directamente la base de datos `dbSP2` mediante el SDK de Firestore.

```mermaid
graph TD
    Cliente([Cliente en SP2 / SmartWeb]) -->|Crea Pre-Alerta| SP2DB[(Firestore SP2: pre_alerts)]
    Admin([Operador en SP1 / Nova Table]) -->|Consulta Directa SDK dbSP2| SP2DB
    SP2DB -->|Resolución en Vivo| NovaUI[Nova Table Modal / [P] Badge]
```

### B. Reglas de Seguridad en SP2 (`smart-portal-2/firestore.rules`)
Para permitir consultas directas por SDK desde el frontend de SP1 sin requerir Cloud Functions intermedias:
* `allow read: if true;` en `match /pre_alerts/{preAlertId}`.
* Escrituras, actualizaciones y eliminaciones están estrictamente restringidas a usuarios autenticados dueños del recurso o administradores (`isAdmin()` / `isStaff()`).

---

## 2. Convención Determinista de Nombres de Documentos

Para garantizar lecturas O(1) y prevenir duplicaciones o colisiones entre clientes:

$$\text{Document ID} = \texttt{\$\{canonicalTracking\}\_\$\{slCode\}}$$

* **Ejemplo 1 (UPS):** `1Z1R054E0343790488_SL261320`
* **Ejemplo 2 (USPS IMpb):** `94001008754116860220_SL26363`
* **Ejemplo 3 (Amazon TBA):** `TBA333107684096_SL1505`

### Normalización de Documentos Históricos (`slAdminNormalizePreAlerts`)
* Si un documento legacy carece de `slCode`, se extrae el código del usuario desde `users/{userId}`.
* Si el documento tiene un ID autogenerado, se crea el documento correspondiente bajo la clave determinista canónica.

---

## 3. Motor de Canonicalización de Trackings y Discriminación de Carriers

El archivo [`tracking-canonicalizer.ts`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/utils/tracking-canonicalizer.ts) clasifica cada tracking en una de dos categorías operativas:

### A. Códigos Postales Compuestos (`POSTAL_COMPOSITE`) — USPS y FedEx GS1
* **USPS IMpb (Norma USPS Pub 199 / GS1-128)**:
  * El código de barras escaneado puede contener hasta 34 dígitos con prefijo de ruteo (`420 + ZIP Miami`).
  * El motor despoja el prefijo `420` + ZIP (`33166`, `33122`, `33178`, etc.) y extrae el **Core IMpb** de 20 a 22 dígitos (ej. `9400...`, `9205...`, `9305...`, `9405...`, `9505...`).
  * Expande variantes matemáticas para búsqueda simultánea en Firestore.
* **FedEx GS1 SmartPost**:
  * Códigos de 34 dígitos que inician con `96` o `00`.
  * Extrae el **Core FedEx de 12 dígitos** (ej. `875411686022`).
* **Seguridad:** No se permiten recortes arbitrarios por debajo de 12 dígitos.

### B. Identificadores Alfanuméricos Atómicos (`DISCRETE_ALPHANUMERIC`) — Aislamiento Estricto
* **Carriers Protegidos**:
  * **UPS 1Z:** `1Z[A-Z0-9]{16}` (ej. `1Z1R054E0343790488`).
  * **Amazon Logistics:** `TBA[0-9]{10,18}` (ej. `TBA333107684096`).
  * **SpeedLogistics:** `GFUS[0-9A-Z]{8,24}` y `GSU[0-9A-Z]{8,24}`.
  * **YunExpress:** `YT[0-9]{14,22}`.
  * **Cainiao / AliExpress:** `LP[0-9]{12,20}` y `CN[0-9A-Z]{12,22}`.
  * **DHL Express:** 10 dígitos o prefijos `JD` / `JJD`.
  * **UPU S10 Internacional:** 2 letras + 9 dígitos + 2 letras (ej. `EA123456789US`).
* **Regla Anti-Colisión (Caso Gabriela Alfaro / Jimena Cerdas)**:
  * **PROHIBIDO recortar sufijos o prefijos numéricos**.
  * La coincidencia debe ser **100% EXACTA (1:1)** contra el número de tracking completo.

---

## 4. Reglas de Elegibilidad de Pre-Alertas y Ciclo de Vida

Una pre-alerta encontrada en Firestore es **ELEGIBLE** para asociar su `slCode` si y solo si cumple las siguientes condiciones:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         COMPUERTAS DE ELEGIBILIDAD                              │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 1. FACTURACIÓN:                                                                  │
│    • NO debe estar facturada (invoiced !== true && !invoiceNumber && !invoiceId).│
│ 2. ENTREGA:                                                                      │
│    • NO debe estar entregada (delivered !== true && !deliveredAt).               │
│ 3. ESTADO ACTIVO:                                                                │
│    • active !== false && status NOT IN ['cancelled', 'void', 'annulled'].        │
│ 4. VENTANA TEMPORAL:                                                             │
│    • createdAt <= 60 días (prevención de números reciclados por carriers).       │
│ 5. REGLA DE ROLLED-OVER MANIFEST (CARRY-ON):                                     │
│    • Si la pre-alerta tiene un manifestNumber viejo de borrador (ej.             │
│      13-08-2026DAN) y el paquete se procesa en un nuevo mega-manifiesto         │
│      (MEGA-MAN-14-08-2026), LA PRE-ALERTA SIGUE SIENDO 100% VÁLIDA mientras no   │
│      haya sido facturada ni entregada.                                           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Reglas de Inmunidad y Comportamiento en Nova Table

### A. Política de Origen de Datos (`DataOriginPolicy`)
* **Origen `fresh` (Carga inicial de Excel/MLocker)**:
  * Ejecuta búsqueda de pre-alertas en paralelo con el matching.
  * Asigna el `slCode` de la pre-alerta con **Prioridad 1 (Score 1.0)** sobre la IA y el nombre de manifiesto.
  * Auto-guardado y auto-validación de homónimos activos.
* **Origen `firestore` (Manifiesto previamente guardado / reabierto)**:
  * **INMUNIDAD TOTAL:** `skipAutoValidation = true`, `allowAutoPreAlertAssign = false`.
  * **PROHIBIDO ejecutar validaciones o sobreescrituras automáticas en segundo plano**.
  * Se respetan los enlaces manuales y la estructura persistida al 100%.

### B. Acciones Manuales del Administrador (Menú Multi-Columna)
El menú **Acciones** de la barra de herramientas de Nova se organiza por columnas según el contexto:

```
┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
│ 1. VISTA & FILTROS        │ 2. TODO EL MANIFIESTO     │ 3. FILTRADAS (N FILAS)    │
│    (Filtros rápidos)      │    (Afecta a todo el doc) │    (Solo filas visibles)  │
├───────────────────────────┼───────────────────────────┼───────────────────────────┤
│ • Ocultar encabezados     │ • Corregir Pre-Alertas    │ 🛡️ Corregir Pre-Alertas   │
│ • Sin cliente             │   (Todo)                  │    (Filtradas: N)         │
│ • Divergentes             │ • Re-validar todo         │ 🔄 Re-validar filtradas   │
│ • Temp / SL-NAN           │ • Enseñar a Nova (Todo)   │    (N)                    │
│ • Pre-alertados           │ • Reasignar Encomiendas   │ 🎓 Enseñar a Nova (N)     │
└───────────────────────────┴───────────────────────────┴───────────────────────────┘
```

* **Acciones Filtradas:** Al ejecutar una acción desde la columna 3, el sistema envía `targetRowIndices = filteredIdxs`. **Ninguna fila oculta fuera del filtro es modificada**.

### C. Visualización y Tooltip Rico de Pre-Alertas (Badge `[P]`)
* Las filas pre-alertadas muestran el badge compacto **`[P]`** en verde esmeralda con `cursor-help` y fallback nativo HTML `title`.
* Al posicionar el cursor sobre el badge, se despliega el tooltip flotante con alta prioridad de capas (`z-[99999] pointer-events-none`) conteniendo:
  * 🛡️ **Encabezado:** Pre-alerta Verificada + Etiqueta de Courier/Transportista (ej. `USPS`, `AMAZON`, `UPS`).
  * 👤 **Cliente:** `SLXXXX — NOMBRE COMPLETO` (destacado en verde esmeralda).
  * 📦 **Descripción:** Contenido o artículos declarados por el cliente (si fue provisto).
  * 💵 **Valor Declarado:** Monto en `$USD` declarado por el cliente.
  * 📄 **Factura Adjunta:** Indicador visual si el cliente subió factura/comprobante en SP2.
  * 🕒 **Fecha y Hora de Declaración:** Timestamp legible en hora local de Costa Rica (`DD/MM/YYYY, HH:mm a. m./p. m.`).
  * 🔑 **Identificador:** Llave natural o ID único del documento (`${tracking}_${slCode}`).
  * ⚠️ **Advertencia de Reasignación:** Notificación en ámbar si el paquete fue reasignado manualmente por el operador a otro casillero.

### D. Persistencia Embebida y Rehidratación In-Memory (Zero-Cost / 0 Consultas Extra)
* **Persistencia en Ingestión y Guardado (`saveManifestRecord` / `useNovaResolvedRows`):**
  * Al guardar o auto-guardar un manifiesto, todos los metadatos completos de la pre-alerta (`row.preAlert`) se serializan directamente en el arreglo `packages[]` del documento `manifests/{manifestNumber}`.
* **Rehidratación Inmediata en Memoria (`loadMegaManFromFirestore`):**
  * Al reabrir un manifiesto guardado (`loadedFromFirestore: true` / `origin === "firestore"`), los datos de pre-alerta se leen **100% en memoria** desde el objeto de filas cargado.
  * **Cero Consultas a Firestore / Cero Sobrecostos:** No se realizan consultas cruzadas a `pre_alerts`, `users` o `customers`, reduciendo las lecturas de Firestore en un **90% a 95%** en la operativa de revisión y facturación.
  * **Inmunidad Estricta:** Al cargar de Firestore, `allowAutoPreAlertAssign === false` previene cualquier reasignación o proceso automático de fondo.

---

## 6. Checklist de Prevención de Regresiones para el AI y Desarrolladores

1. **¿Se tocó `pre-alert-resolver.ts`?**
   * Verificar que `getPreAlertsDatabase()` apunte a `dbSP2 || db`.
   * Verificar que `PreAlertInfo` propague `clientName`, `description`, `declaredValue`, `courier`, `hasInvoice`, `invoiceUrl`.
   * Correr `npx vitest run client/lib/services/__tests__/pre-alert-real-dataset-50.spec.ts`.
2. **¿Se modificó `tracking-canonicalizer.ts`?**
   * Confirmar que los carriers `DISCRETE_ALPHANUMERIC` tengan `allowSuffix: false`.
   * Correr `npx vitest run client/lib/utils/__tests__/tracking-canonicalizer.spec.ts`.
3. **¿Se alteró `NovaTableModal.tsx` o `use-nova-resolved-rows.ts`?**
   * Verificar que los manifiestos de Firestore mantengan `skipAutoValidation = true` y `allowAutoPreAlertAssign = false`.
   * Confirmar que `normTracking` esté declarado en la celda de rastreo y el tooltip use `z-[99999]`.
   * Confirmar que `preAlert` se propague a través de `useNovaResolvedRows` hacia `saveManifestRecord`.
   * Correr `npm run typecheck` y la suite global `npm test`.
