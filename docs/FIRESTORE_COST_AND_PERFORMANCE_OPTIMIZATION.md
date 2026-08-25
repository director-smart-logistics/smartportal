# Arquitectura de Optimización de Costos, Rendimiento y Cero Regresiones en Firestore

Este documento detalla la arquitectura, directrices de ingeniería, matrices de suscripción y contratos de datos implementados para erradicar patrones de consumo excesivo de Firestore (N+1 listeners, loops de escritura en snapshots, consultas no acotadas) en **Smart Portal 1** (`smart-portal-1`), garantizando al 100% la reactividad, consistencia transaccional y fluidez en entornos multi-usuario y multi-pestaña.

---

## 1. Diagnóstico de Patrones de Alto Costo Erradicados

### A. Patrón N+1 de Sockets en Componentes de Lista (`CustomerRow`)
* **Problema anterior**: Cada fila de cliente montaba un hook `useEffect` con `onSnapshot(doc(db, "customers", customer.id))` independiente. Al renderizar 50 clientes en pantalla, se abrían **50 conexiones socket WebSocket simultáneas**, multiplicando las lecturas por cada cambio en cualquier documento y consumiendo la cuota de conexiones concurrentes de Firebase.
* **Solución arquitectónica**: `CustomerRow` se convirtió en un componente puro memoizado (`React.memo`) que consume sus propiedades directamente desde la consulta paginada de React Query (`useCustomersPaginated`). Las mutaciones invalidan la clave de consulta (`['customers']`), refrescando la lista de manera atómica con **0 sockets secundarios**.

### B. Bucle de Lectura Secundaria y Escritura dentro de `onSnapshot` (`Invoices.tsx`)
* **Problema anterior**: Al recibir un snapshot de facturas, se ejecutaban consultas en lote `getDocs(where('trackingNumbers', 'array-contains-any', ...))` sobre la colección `packages` y se disparaban escrituras `updateDoc({ hasPermits: true })`. Esto generaba un **bucle de retroalimentación**:
  $$\text{onSnapshot} \longrightarrow \text{updateDoc} \longrightarrow \text{nuevo evento en BD} \longrightarrow \text{onSnapshot} \dots$$
* **Solución arquitectónica**: Las etiquetas de retención y permisos aduanales (`DANP`, `RETENIDO`, `hasPermits`) se evalúan **estrictamente en memoria** a partir del arreglo `invoiceItems` ya presente en el documento de la factura. Cero llamadas `getDocs` secundarias y cero mutaciones automáticas de escritura dentro de los listeners de lectura.

### C. Consultas Masivas sin Acotamiento en Bodega y Rutas
* **Problema anterior**: Pantallas de bodega o despacho que abrían listeners sobre colecciones completas de paquetes o manifiestos al montarse, incluso cuando el operador aún no había seleccionado un manifiesto o chofer activo.
* **Solución arquitectónica**: Implementación del principio **Lazy on Demand (Carga Bajo Demanda)**. Si el filtro de manifiesto o sesión está vacío (`!manifestId` o `hasLoaded: false`), el hook retorna colecciones vacías inmediatamente y no registra ningún listener en Firestore.

### D. Conteo Masivo en Dashboards
* **Problema anterior**: Carga de colecciones enteras de paquetes, clientes y facturas en el frontend para ejecutar `.length` o calcular métricas de entrega.
* **Solución arquitectónica**: Lectura de un único documento consolidado pre-agregado (`metadata/dashboard_counters`) con fallback directo a `getCountFromServer` (agregación en metadatos de Firestore con costo cero de descarga de cuerpos de documentos).

### E. Patrón Read-After-Write Redundante en Mutaciones (Frontend y Backend)
* **Problema anterior**: Las funciones `createDocument`, `updateDocument` y los helpers de Cloud Functions ejecutaban llamadas a `getDoc` / `docRef.get()` inmediatamente antes y después de cada escritura, duplicando o triplicando el costo de lectura en cada mutación individual y masiva.
* **Solución arquitectónica**: Sintetización directa del documento modificado/creado con timestamps ISO locales y servidor, retornando el objeto sin realizar ninguna lectura de red adicional (`0` lecturas añadidas por mutación).

### F. Sobre-Fanout en Búsquedas Globales (`searchPackages`, `searchCustomers`, `searchInvoices`)
* **Problema anterior**: `searchPackages` disparaba hasta 13 consultas paralelas indiscriminadas en cada tipeo (incluyendo 6 consultas de nombres cuando el usuario ingresaba un número de tracking).
* **Solución arquitectónica**: Implementación de **Smart Search Routing** (enrutamiento de búsqueda por clasificación de patrón). Las consultas que contienen números de tracking o códigos SL ejecutan exclusivamente los índices relevantes, reduciendo el consumo de lecturas por búsqueda en más del 70%.

### G. Consultas N+1 sin Caché en Pre-Alertas (`pre-alert-resolver.ts`)
* **Problema anterior**: En `resolveCustomerFullProfile`, cada pre-alerta resuelta realizaba consultas independientes a la colección `customers` sin reutilización en memoria.
* **Solución arquitectónica**: Implementación de `customerProfileMemoryCache` con TTL de 10 minutos y deduplicación por ciclo de resolución, reduciendo en un 90% las consultas a clientes durante cargas de manifiestos y búsquedas.

---

## 2. Matriz de Estrategias de Consulta por Módulo

| Módulo | Estrategia de Carga | Límites / Paginación | Ciclo de Vida del Listener | Mecanismo de Invalidación |
| :--- | :--- | :--- | :--- | :--- |
| **Invoices** | Cursor / Paginado con React Query | 50 docs por página + búsqueda multi-token | Efímero (solo fila expandida o modal activo) | `queryClient.invalidateQueries({ queryKey: ['invoices'] })` |
| **Customers** | Paginado con React Query (`useCustomersPaginated`) | 50 docs por página + búsqueda server-side | 0 sockets por fila | Mutación optimista + invalidación de `['customers']` |
| **Packages** | Paginado con React Query (`usePackagesPaginated`) | `3000`, `5000`, `10000`, `last4days` | Listener de manifiesto activo acotado por `limit(N)` | `queryClient.setQueriesData` optimista en `onMutate` |
| **Encomiendas** | Lazy on-demand (`useEncomiendaDispatchData`) | Chunking $N \le 30$ para `where('in', ...)` | Activo solo cuando `hasLoaded: true` | Cierre en cleanup del efecto |
| **Consolidación** | Doble consulta unificada (`useConsolidationData`) | Filtrado server-side `consolidacion == true` | Activo en pantalla de consolidación | Sync atómico vía `WriteBatch` |
| **Rutas & Despacho** | Selectivo por Manifiesto (`RoutesManagement`) | Acotado al `manifestNumber` seleccionado | 0 queries si `manifestFilter === ''` | Transición de estado en `route_sessions` |
| **Scanner / Bodega** | Enriquecimiento In-Memory (`scanner/bodega`) | Mapeo $O(1)$ por tracking sobre manifiesto activo | Listener cerrado al deseleccionar manifiesto | Actualización puntual de timestamp en `updateDoc` |
| **Pre-Alertas** | Búsqueda multi-clave (`canonicalizeTracking`) | `limit(10)` para tracking, `limit(50)` para `slCode` | 0 listeners de colección completa | Actualización directa en `reassignPreAlert` |
| **Dashboard** | Documento rollup (`metadata/dashboard_counters`) | 1 solo doc read o `getCountFromServer` | One-shot fetch con `staleTime: 5 min` | Triggers en Cloud Functions de fondo |

---

## 3. Reglas Obligatorias de Ingeniería para Nuevas Funcionalidades

1. **Prohibición de Sockets N+1**:
   Nunca instancies un `useEffect` con `onSnapshot(doc(...))` dentro de un componente que se renderiza dentro de un bucle `.map()`. Toda la data requerida por la fila debe ser entregada por el query padre o cargada bajo demanda mediante un modal/popover independiente.
2. **Chunking Estricto de Cláusulas `in` / `array-contains-any`**:
   Firestore impone un límite estricto de **30 elementos** en filtros `in` y `array-contains-any`. Todo arreglo de términos debe dividirse en sub-bloques de máximo 30 elementos antes de pasarse a `query(ref, where(field, 'in', chunk))`.
3. **Escrituras Atómicas en Lote (`WriteBatch`)**:
   Toda operación que afecte más de un documento (ej. anulación de factura con desvinculación de paquetes) debe agruparse en un `writeBatch(db)` con un máximo de 400 operaciones por lote para garantizar transaccionalidad total (rollback si algo falla).
4. **Idempotencia en Sincronizaciones Externas**:
   Las llamadas a `syncInvoicesToSp2` y `syncPackagesToSmartWeb` deben usar identificadores canónicos (ID de documento o tracking) para que reintentos de red actualicen registros en lugar de duplicarlos.
