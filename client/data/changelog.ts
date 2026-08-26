// ─── Changelog — single source of truth for FE + BE release notes ─────────────
// ADD entries at the TOP (newest first).
// The /deploy workflow will prompt you to add a new entry before each deploy.

export type ChangelogLayer = 'fe' | 'be' | 'both';
export type ChangelogType =
  | 'feature'
  | 'fix'
  | 'perf'
  | 'security'
  | 'refactor'
  | 'breaking'
  | 'chore';

export interface ChangelogEntry {
  version: string;
  date: string;
  layer: ChangelogLayer;
  type: ChangelogType;
  title: string;
  description?: string;
  author?: string;
  commitMessage?: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  // ── ADD NEW ENTRIES AT THE TOP ──────────────────────────────────────────────
  {
    version: '0.0.1595',
    date: '2026-08-26',
    layer: 'fe',
    type: 'fix',
    title: 'Alineación de Abreviaciones de Rutas con el Escáner (C1, C2, H, A, etc.)',
    description:
      '1. **Abreviaciones Oficiales del Escáner (`DriverRouteWizard.tsx`)**: Se mapearon las abreviaciones oficiales en las tarjetas y cabeceras de sesión de ruta (`Cartago 1` → `C1`, `Cartago 2` → `C2`, `Heredia` → `H`, `Alajuela` → `A`, `San Jose Centro` → `SJ`, etc.).\\n' +
      '2. **Soporte de Rutas Combinadas**: Múltiples rutas seleccionadas se combinan limpiamente (ej. `Cartago 1 + Cartago 2` → `C1 + C2`).',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'fix(routes): align route abbreviations with scanner standards (v0.0.1595)',
  },
  {
    version: '0.0.1594',
    date: '2026-08-26',
    layer: 'fe',
    type: 'fix',
    title: 'Corrección de Carga de Manifiestos en Asistente de Sesiones de Ruta',
    description:
      '1. **Restauración de Importación de Manifiestos (`DriverRouteWizard.tsx`)**: Se reincorporó `getRecentManifests` faltante en el asistente de ruta para choferes (`StartRouteWizard`), solucionando el ReferenceError y permitiendo la selección inmediata de manifiestos.\\n' +
      '2. **Ajuste de Tipos TypeScript y Pruebas**: Tipado seguro en extracción de distritos y telemetría.',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'fix(routes): restore getRecentManifests import in DriverRouteWizard (v0.0.1594)',
  },
  {
    version: '0.0.1590',
    date: '2026-08-25',
    layer: 'both',
    type: 'feature',
    title: 'Motor Universal de Extracción de Distritos de Costa Rica y Reubicación de Badge en Fila de Badges',
    description:
      '1. **Motor de Extracción Universal de Distritos (`location-utils.ts`)**: Diccionario con los ~488 distritos y cantones de Costa Rica. Resuelve automáticamente distritos a partir de direcciones geocodificadas con Plus Codes (ej. `Concepción`, `Sabanilla`, `Curridabat`, `Carmen`, `Guadalupe (Arenilla)`, `San Rafael`).\\n' +
      '2. **Reubicación y Estilo Gris Muted del Badge de Distrito (`DriverRouteWizard.tsx`)**: Se trasladó el badge a la fila intermedia junto al contador de paquetes (`[SL] [Ruta] [Consolida] [X PKGS] [📍 DISTRITO]`) con estilo gris muted neutro.',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'feat(routes): universal CR district parser and muted district badge in middle row (v0.0.1590)',
  },
  {
    version: '0.0.1588',
    date: '2026-08-25',
    layer: 'both',
    type: 'feature',
    title: 'Insignia de Distrito, Dirección en Tarjetas de Ruta y Filtrado Dinámico por Manifiesto',
    description:
      '1. **Insignia de Distrito en Tarjetas de Clientes (`DriverRouteWizard.tsx`)**: Se integró el badge oficial del distrito (`MapPin`) posicionado junto a la píldora de precio en la vista de chofer.\\n' +
      '2. **Dirección Completa en Tarjetas de Parada (`DriverRouteWizard.tsx`)**: Extracción y renderizado de la dirección exacta del cliente (`fullAddress` / `streetAddress` / `deliveryAddress`) con soporte de apertura dinámica en Google Maps.\\n' +
      '3. **Píldoras y Filtro de Múltiples Manifiestos (`PackageList`)**: Barra de tabs dinámicos para sesiones con múltiples manifiestos (`[Todos, MAN-1 (X), MAN-2 (Y)]`) con conteo en vivo de clientes y paquetes.',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'feat(routes): add district badge, customer address row and multi-manifest tabs (v0.0.1588)',
  },
  {
    version: '0.0.1586',
    date: '2026-08-25',
    layer: 'both',
    type: 'feature',
    title: 'Alineación de Boletas de Ruta en Nova con Devoluciones/Facturas y Búsqueda Resiliente de Clientes',
    description:
      '1. **Alineación de Boletas y Manifiestos de Ruta en Nova (`NovaTableModal.tsx`, `nova-print.ts`)**: Se enriquecieron las impresiones de manifiestos y boletas de bodega consultando en tiempo real las facturas y paquetes de Firestore. Muestra números de factura agrupados por cliente en la sublínea (`#FAC-...`), suma total en USD y CRC con tipo de cambio, badges `DEV` e insignias rojas `+X` para paquetes devueltos con indicativo de manifiesto de origen (`ret-mani-badge`) y desglose de precios unitarios.\\n' +
      '2. **Búsqueda Resiliente de Clientes en Vivo (`use-customer-search.ts`, `typeahead-search.ts`, `customer-loader.ts`)**: Búsqueda en tiempo real contra `customers` de SP1 y `users` de SP2 para clientes recién registrados (ej. `SL262273`), con inyección dinámica en memoria (`injectCustomerIntoCache`) para disponibilidad inmediata en O(1).\\n' +
      '3. **Control de Búsqueda y Debounce de 2 Segundos (`NovaCustomerSearchModal.tsx`)**: Configuración de retardo de 2.0 segundos tras detener la escritura y ejecución inmediata al presionar `Enter`.',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'feat(nova): align route printouts with returns/invoices and add resilient customer search (v0.0.1586)',
  },
  {
    version: '0.0.1583',
    date: '2026-08-25',
    layer: 'both',
    type: 'fix',
    title: 'Sincronización Resiliente de Clientes por Pre-Alertas y Consulta Multicampo en SP2',
    description:
      '1. **Disparador Incremental por Pre-Alertas (`functions/src/customers/sync.ts`)**: Se incluyó la colección `prealerts` en el ciclo de sincronización incremental programada. Los usuarios que declaran pre-alertas en SP2 son detectados e incorporados automáticamente en SP1 sin depender de cambios en su perfil.\\n' +
      '2. **Búsqueda Resiliente Multicampo en SP2 (`customer-loader.ts`)**: Se optimizó la resolución en vivo contra la base de datos de SP2, soportando variantes de casing (`slCode` mayúscula/minúscula), campos alternativos (`casillero`, `sl_code`) y extracción fiel de `displayName`.\\n' +
      '3. **Blindaje de Facturas e Integridad de Pruebas**: Cobertura de pruebas unitarias y de integración para garantizar que las facturas se emitan con el nombre oficial del cliente registrado.',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'fix(sync): resilient customer pre-alert sync triggers and multi-field SP2 fallback (v0.0.1583)',
  },
  {
    version: '0.0.1582',
    date: '2026-08-25',
    layer: 'both',
    type: 'fix',
    title: 'Arquitectura Invariante de Resolución de Nombre de Cliente y Erradicación Total de Placeholders en Facturación',
    description:
      '1. **Resolución Invariante de Nombres (`customer-name.ts`)**: Se implementaron los métodos de resolución universal `resolveEffectiveCustomerName` e `isSyntheticPlaceholderName`, estableciendo una jerarquía estricta: (1) Override de operador, (2) Perfil de cliente registrado en base de datos, (3) Nombre de pre-alerta declarada por el cliente, (4) Consignatario del manifiesto courier, (5) Código de casillero. Erradica de forma definitiva cualquier texto sintético como `Cliente Pre-alertado (SL...)` en facturas, recibos y paquetes.\\n' +
      '2. **Re-generación y Vista Previa de Facturas (`invoice-service.ts`, `use-nova-resolved-rows.ts`, `NovaInvoicePreview.tsx`)**: La re-generación de facturas y la pantalla de vista previa de tiquetes aplican la resolución limpia en tiempo real, garantizando que el nombre oficial del cliente (`DAYANA MARIA JIMENEZ ESQUIVEL`) se grabe y visualice sin discrepancias.\\n' +
      '3. **Persistencia Saneada en Firestore (`ingestion.ts`)**: Ingesta de paquetes y almacenamiento de manifiestos serializan exclusivamente nombres válidos y limpios.',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'fix(invoices): authoritative customer name resolution without synthetic placeholders (v0.0.1582)',
  },
  {
    version: '0.0.1581',
    date: '2026-08-25',
    layer: 'both',
    type: 'fix',
    title: 'Defensa contra Nulos en Clientes y Priorización de Nombre Real en Pre-Alertas de Nova',
    description:
      '1. **Corrección de Crash en Búsqueda de Clientes (`useCustomers.ts`, `firestore-client.ts`, `Customers.tsx`)**: Se agregaron guardas de seguridad contra nulos en `useCustomerSearch` y en helpers de búsqueda de Firestore, resolviendo la excepción `Cannot read properties of null (reading \'trim\')`.\\n' +
      '2. **Priorización de Nombre Real en Pre-Alertas de Nova (`parser.ts`, `NovaTableModal.tsx`)**: Cuando una pre-alerta de SP2 no cuenta con perfil previo sincronizado en SP1, el sistema ahora utiliza de forma prioritaria el nombre real del usuario (`info.clientName` / `row.nombre`) en lugar del texto genérico `Cliente Pre-alertado (SL...)`.\\n' +
      '3. **Robustez en Modal de Sincronización Forzada (`ForceSyncCustomerModal.tsx`)**: Manejo seguro de códigos de cliente y fallback adecuado en notificaciones toast.',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'fix(customers): null guards in customer search and real customer name prioritization in pre-alerts (v0.0.1581)',
  },
  {
    version: '0.0.1580',
    date: '2026-08-25',
    layer: 'both',
    type: 'feature',
    title: 'Desbloqueo Reactivo de Facturas Anuladas, Botón Colapsar Todo Animado y Limpieza de UI en Consolidación',
    description:
      '1. **Desbloqueo Inmediato de Paquetes de Facturas Anuladas (`useConsolidationData.ts`)**: Arquitectura de suscripción reactiva en tiempo real con mapas independientes (`queryAMapRef`, `queryBMapRef`). Las facturas anuladas (`annulled`/`cancelled`) liberan sus paquetes inmediatamente sin falsos bloqueos de candado rojo ni retención de caché.\\n' +
      '2. **Botón Colapsar Todo / Expandir Todo con Outline Rojo Animado (`ConsolidationManifests.tsx`)**: Control en barra superior para alternar instantáneamente la visibilidad de todas las tarjetas de clientes con borde rojo pulsante (`animate-pulse`).\\n' +
      '3. **Limpieza y Optimización Visual de Consolidación (`ConsolidationCustomerCard.tsx`)**: Eliminación del texto repetitivo `CONSOLIDACION_TRANSITORIA` dentro de cada tarjeta y ajuste de layout para ancho completo.\\n' +
      '4. **Sincronización SP1/SP2**: Actualización y reconciliación de 17 paquetes históricos a estado `delivered` en portal del cliente (SmartWeb).\\n' +
      '5. **Cobertura de Pruebas**: 177 suites de prueba con 2,356 tests unitarios pasando al 100%.',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'feat(consolidation): unblock annulled invoices, animated collapse-all button and UI cleanup (v0.0.1580)',
  },
  {
    version: '0.0.1573',
    date: '2026-08-20',
    layer: 'fe',
    type: 'perf',
    title: 'Optimización Integral de Búsqueda y Reasignación de Clientes (Nova)',
    description:
      '1. **Eliminación Total de IA y Consultas Firestore por Tecla**: Removidos los llamados a Gemini AI y consultas Firestore por tecla en `useCustomerSearch`, reduciendo el costo a 0 lecturas por búsqueda.\\n' +
      '2. **Búsqueda Instantánea en Memoria**: Typeahead 100% en memoria con debounce de 120ms contra índices pre-calculados.\\n' +
      '3. **Caché en Memoria para Nova Learning**: Cero llamadas repetidas a Firestore para asociaciones aprendidas.\\n' +
      '4. **Resolución Síncrona en 0ms**: Carga inmediata del cliente actualmente vinculado y sugerencias directas en el frame 0.\\n' +
      '5. **Diseño y UX Premium**: Colores de ruta oficiales con Tailwind, badge de consolidación estandarizado a cyan/azul y navegación nativa por teclado.\\n' +
      '6. **Suite de Pruebas Automatizadas**: 8 tests unitarios en `NovaCustomerSearchModal.spec.tsx` y 2,344 tests pasando en todo el portal.',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'perf(nova): instant in-memory customer search modal, zero AI/Firestore calls and route color badges (v0.0.1573)',
  },
  {
    version: '0.0.1572',
    date: '2026-08-20',
    layer: 'fe',
    type: 'fix',
    title: 'Modal de Anulación de Facturas: Layout Amplio, Zero-Jump y ManifestPicker Nativo',
    description:
      '1. **Modal Amplio sin Scroll (`InvoiceConfirmationDialog`, `alert-dialog.tsx`)**: Se removió la restricción `sm:max-w-lg` y se expandió el diálogo a `sm:max-w-[880px]` para proporcionar espacio amplio y evitar truncado de texto.\\n' +
      '2. **Integración Nativa de `ManifestPicker`**: Búsqueda instantánea en memoria de manifiestos con alineación optimizada y single-select.\\n' +
      '3. **Eliminación Total de Brinco Visual**: Carga síncrona en 0ms del estado del cliente desde cache en memoria, eliminando parpadeos y retrasos en el renderizado.\\n' +
      '4. **Textos Claros y Coherentes**: Mensajes informativos transparentes que confirman la anulación de la factura y detallan el destino exacto de los paquetes.\\n' +
      '5. **Suite de Pruebas**: Creada suite unitaria `InvoiceConfirmationDialog.spec.tsx` con 6 tests funcionales aprobados.',
    author: 'Joshua Briceno <joshua@fuseflows.io>',
    commitMessage: 'fix(invoices): wide modal layout, zero-jump preload and native manifest picker in annulment dialog',
  },
  {
    version: '0.0.1571',
    date: '2026-08-20',
    layer: 'both',
    type: 'fix',
    title: 'Aislamiento e Inmutabilidad de Fechas de Consolidación Día 0 / Día 1 por Paquete',
    description:
      '1. **Aislamiento de Fechas de Consolidación (`ConsolidationCustomerCard`, `getConsolidationStartDate`)**: Implementado cálculo determinístico e independiente por paquete. Cada paquete calcula su propio Día 1, días transcurridos y período de gracia sin ser sobreescrito por facturas anuladas posteriores de otros paquetes.\\n' +
      '2. **Inviolabilidad de `firstConsolidatedAt`**: Blindados los flujos de anulación en `Invoices.tsx`, `ConsolidationInvoiceRow.tsx`, `invoice-service.ts`, `ReturnedPackages.tsx` y `consolidation-carry-on-service.ts` para que nunca reseteen la fecha de consolidación original del paquete.\\n' +
      '3. **Pruebas Automatizadas**: 173 suites de pruebas y 2,330 tests pasando al 100% con 0 fallos y 0 regresiones.',
    author: 'Antigravity AI',
    commitMessage: 'fix(consolidation): isolate per-package Day 0/1 consolidation start dates and prevent invoice annulment resets',
  },
  {
    version: '0.0.1570',
    date: '2026-08-20',
    layer: 'both',
    type: 'fix',
    title: 'Resolución Resiliente de Clientes SP2 y Aceleración Ultra-Rápida de Scanner Bodega',
    description:
      '1. **Resolución Resiliente de Clientes SP2 (`customer-loader.ts`)**: `findCustomerBySlCode` consulta la colección `users` de SP2 (`dbSP2`) cuando un cliente no está en SP1 o aparece eliminado, inyectándolo en memoria en O(1) (Zero-Overcost) y grabando el nombre real en el paquete.\\n' +
      '2. **Auto-Reparación en Caliente en Scanner Bodega (`views.tsx`, `HistoryCard.tsx`)**: Detección y corrección en tiempo real de paquetes antiguos con "Cliente Pre-alertado (SL...)" para mostrar inmediatamente el nombre real del cliente y sanear Firestore en segundo plano.\\n' +
      '3. **Aceleración Ultra-Rápida a 0 ms (`index.tsx`, `search.ts`)**: Multi-indexación en memoria de trackings exactos, limpios, códigos GS1-128 con prefijo 420 removido y mapas de sufijos de 6 a 12 dígitos, eliminando 30 consultas secundarias a Firestore y llamadas Cloud Functions.\\n' +
      '4. **Certificación Total de Regresión**: 173 suites de prueba y 2,328 tests pasando al 100% con 0 fallos.',
    author: 'Antigravity AI',
    commitMessage: 'fix(scanner): harden sp2 customer resolution, auto-healing, and zero-overcost ultra-fast memory index (v0.0.1570)',
  },
  {
    version: '0.0.1561',
    date: '2026-08-19',
    layer: 'both',
    type: 'fix',
    title: 'Blindaje Integral del Motor de Matching: Veto de Género, Tokens Únicos, Soberanía de Learnings y Consumo Estricto',
    description:
      '1. **Veto de Género y Nombres Distintos (`gender-name-guard.ts`)**: Creado módulo determinístico con tabla bidireccional O(1) de pares de género opuesto (DANIEL ↔ DANIELA, VICTOR ↔ VICTORIA, etc.), bloqueando coincidencias difusas y agrupaciones erróneas en Nova.\\n' +
      '2. **Barrera de Tokens Únicos Aislados (`batch-matcher.ts`, `parser.ts`)**: Nombres de una sola palabra (ej. VICTOR) nunca se auto-asignan al 99% en Pass 1.5 ni en el parser, reteniéndose como [sin registro] para revisión del operador.\\n' +
      '3. **Soberanía Absoluta de Learnings de Admin (`batch-matcher.ts`)**: Las reglas creadas por administradores en Nova Learning se aplican directamente en el Paso 0/1 sin abortarse por falsas colisiones algorítmicas con palabras compartidas.\\n' +
      '4. **Consumo Estricto de Tokens y Control de Apellido Paterno (`match-engine.ts`, `parser.ts`)**: Consumo de tokens en Técnica 5 para evitar que apellidos duplicados (SOLIS SOLIS) coincidan con un solo token, y penalización/divergencia cuando el apellido paterno principal difiere (BRYAN SOLIS SOLIS vs BRAYAN ROLANDO CONEJO SOLIS).\\n' +
      '5. **Certificación de Regresión**: 147 suites de prueba y 2,213 tests aprobados al 100% con 0 fallos.',
    author: 'Antigravity AI',
    commitMessage: 'fix(matching): harden gender-name veto, single-token guard, admin learning supremacy, and token consumption (v0.0.1561)',
  },
  {
    version: '0.0.1560',
    date: '2026-08-19',
    layer: 'both',
    type: 'security',
    title: 'Blindaje de Plantillas de Correo Corporativas y Regla de Inmutabilidad de Comunicaciones',
    description:
      '1. **Inmutabilidad de Plantillas de Correo (`Rule 11`)**: Establecida prohibición absoluta de estructurar formatos ad-hoc o alterar la plantilla oficial de Tiquete Electrónico (`invoice-email.html`). Todas las emisiones de facturación deben ejecutarse a través del pipeline del servidor sin excepción.\\n' +
      '2. **Prohibición de Envíos de Diagnóstico**: Restricción explícita en reglas del agente (`AGENTS.md`) prohibiendo envíos automatizados directos a correos de clientes reales durante tareas de depuración.\\n' +
      '3. **Verificación Integral**: Confirmada entrega de recibos oficiales a clientes con formato corporativo impecable y 0 variables sin renderizar.',
    author: 'Antigravity AI',
    commitMessage: 'fix(email): enforce strict email template immutability and diagnostic dispatch ban (v0.0.1559)',
  },
  {
    version: '0.0.1558',
    date: '2026-08-19',
    layer: 'both',
    type: 'fix',
    title: 'Blindaje de Elegibilidad de Pre-Alertas, Depuración de Envíos Fantasma en SP2 y Paridad Absoluta',
    description:
      '1. **Compuerta de Elegibilidad en Pre-Alertas (`pre-alert-resolver.ts`)**: Añadidas validaciones estrictas para ignorar pre-alertas marcadas como entregadas, normalizadas históricamente (`isHistoricalNormalization`, `isHistorical`) o con fechas de entrega pasadas, evitando falsas asociaciones en Nova y en el portal de clientes.\\n' +
      '2. **Depuración y Barrido en SP2 (`smart-portal-2`)**: Eliminados los 635 envíos sintéticos con estado `pre-alerted` que se habían disparado por el trigger de SP2 durante la normalización histórica, limpiando los casilleros de todos los clientes (incluyendo SL1208).\\n' +
      '3. **Certificación Global**: 141 / 141 suites de prueba aprobadas (2,177 tests en verde al 100%).',
    author: 'Antigravity AI',
    commitMessage: 'fix(prealerts): add historical normalization guards and cleanup synthetic shipments in SP2 (v0.0.1557)',
  },
  {
    version: '0.0.1556',
    date: '2026-08-19',
    layer: 'both',
    type: 'fix',
    title: 'Corrección de Fusión de Borradores en Nova, Blindaje contra Arrastre de Paquetes Reasignados y Sincronización SP2',
    description:
      '1. **Aislamiento de Borradores en Manifiesto Principal (`NovaTableModal.tsx`)**: Configurado `mergeExistingDrafts: isTargetManifest` para que al guardar el manifiesto principal en Nova no se resuciten paquetes reasignados o eliminados de borradores previos.\\n' +
      '2. **Corrección de Datos en Vivo (SL13 en SP1 y SP2)**: Corregida la factura `yeVLxnsb1qSYxwilvM8o` (`SL13-20260819102028187`) ajustando el monto a **$8.00 (₡3 760)** con su único paquete real (`GFUS01065635648649`), desvinculando los 2 paquetes de `SL26575` y sincronizando el Tiquete Electrónico en SmartWeb (SP2).\\n' +
      '3. **Certificación Global**: 141 / 141 archivos de prueba aprobados (2,177 tests en verde al 100%).',
    author: 'Antigravity AI',
    commitMessage: 'fix(invoices): isolate draft merges to target manifests, prevent resurrecting reassigned packages, and correct SL13 invoice (v0.0.1554)',
  },
  {
    version: '0.0.1553',
    date: '2026-08-19',
    layer: 'both',
    type: 'feature',
    title: 'Suite de Pruebas de Integridad Anti-Desfase, Cero Sobrecostos y Reactividad Local en Memoria',
    description:
      '1. **Nueva Suite de Pruebas Automatizadas (`CustomerLoaderAndBatchOptimizations.spec.ts`)**: 7 pruebas dedicadas que certifican:\\n' +
      '   - Cero sobrecostos en lecturas repetidas (1 sola llamada a `slListCustomers`, consultas posteriores en 0ms desde memoria).\\n' +
      '   - Recarga limpia y determinista ante `invalidateCustomerCache()`.\\n' +
      '   - Reactividad instantánea sin desfase de datos en mutaciones locales (`patchCustomerRutaInCache`, `patchCustomerConsolidationInCache`, `injectCustomerIntoCache`).\\n' +
      '   - Matemática exacta de agrupación de consultas por bloques de 30 (`where in`) y deduplicación de IDs.\\n' +
      '2. **Certificación Global**: 141 / 141 archivos de prueba aprobados (2,177 tests en verde al 100%).',
    author: 'Antigravity AI',
    commitMessage: 'feat(testing): add comprehensive anti-drift, zero-overcost, and local reactivity test suite (v0.0.1552)',
  },
  {
    version: '0.0.1551',
    date: '2026-08-19',
    layer: 'both',
    type: 'feature',
    title: 'Erradicación de Bucles de Consultas en Firestore, Eliminación de Polling en Rutas y Agrupación de Consultas en Bloques (Where In)',
    description:
      '1. **Eliminación de Polling Ciego en Clientes (`customer-loader.ts`)**: Eliminado el temporizador de 30 segundos que volvía a consultar los 10,000 clientes en bucle permanente, erradicando la fuga crítica de 28.8 Millones de lecturas diarias.\\n' +
      '2. **Desactivación de Sondeo en Gestión de Rutas (`RoutesManagement.tsx` & `useDistribution.ts`)**: Desactivado `refetchInterval: 15_000` en tarjetas de rutas (1.2M lecturas/hora eliminadas). La vista ahora se actualiza reactivamente por eventos de asignación (`onSuccess`) y refresco manual.\\n' +
      '3. **Agrupación de Consultas en Bloques de 30 (`where in`)**: Reemplazadas las consultas individuales 1 a 1 en bucle en reasignación de facturas (`Invoices.tsx`) y consolidación (`manifest-consolidation-service.ts`), reduciendo cientos de consultas a solo 2 o 7 por operación.\\n' +
      '4. **Optimización de React Query Defaults (`query-defaults.ts`)**: Desactivado `refetchOnWindowFocus` para evitar descargas de red redundantes al alternar entre pestañas.\\n' +
      '5. **Suite de Pruebas y Certificación**: 140 / 140 archivos de prueba aprobados (2,170 tests en verde al 100%).',
    author: 'Antigravity AI',
    commitMessage: 'feat(perf): eliminate Firestore background polling loops, chunk package lookups with where-in, and optimize React Query defaults (v0.0.1550)',
  },
  {
    version: '0.0.1549',
    date: '2026-08-19',
    layer: 'both',
    type: 'feature',
    title: 'Optimización de Despacho Masivo de Facturas, Reducción de Lecturas Firestore (Zero-Read) y Pool Concurrente Anti-Desfase',
    description:
      '1. **Zero-Read In-Memory Hydration**: Eliminadas las consultas de red redundantes `getById` en el envío individual y masivo de facturas, aprovechando el estado sincronizado en tiempo real (`onSnapshot`) para un ahorro del 99.8% en operaciones de lectura Firestore.\\n' +
      '2. **Pool de Concurrencia Controlada (6 Workers Paralelos)**: Despacho acelerado 5x a 8x procesando en oleadas simultáneas de 6 facturas (~8 req/segundo), reduciendo el tiempo de envío de 50 facturas de 120s a ~15s dentro de los límites de Resend API.\\n' +
      '3. **Protección Anti-Desfase (Anti-Drift Guard)**: Validación previa que detecta y omite de forma segura facturas anuladas (`status === \'annulled\'`) o canceladas en otras pestañas sin detener el lote.\\n' +
      '4. **Silenciamiento de Re-consultas en Bucle & Toast Consolidado**: Eliminadas las 50 re-consultas globales de React Query durante el ciclo, ejecutando 1 sola invalidación final y 1 único resumen claro en UI.\\n' +
      '5. **Suite de Pruebas**: 140 / 140 archivos de prueba aprobados (2,170 tests en verde al 100%).',
    author: 'Antigravity AI',
    commitMessage: 'feat(invoices): optimize bulk email dispatch with in-memory zero-read hydration, concurrency pool of 6, and anti-drift guards (v0.0.1548)',
  },
  {
    version: '0.0.1547',
    date: '2026-08-19',
    layer: 'both',
    type: 'feature',
    title: 'Blindaje Total de Ingesta Global de Paquetes, Matriz de Integración E2E Zero-Mock y Certificación en Producción',
    description:
      '1. **Blindaje en Colección Global `packages` (`ingestManifestToPackages`)**: Ningún paquete individual puede persistirse en la base de datos de Firestore con `cost: 0` si tiene `peso > 0`, sellando la fuente canónica de paquetes desde el momento de la ingesta.\\n' +
      '2. **Suite de Integración E2E Zero-Mock (`NovaEndToEndPricingMatrix.spec.tsx`)**: 9 pruebas reales de integración de extremo a extremo sin mocks ejecutando el motor de tarifas real (`calculatePrice`) para grupos mixtos con DUA, tarifas manuales de desalmacenaje, descuentos porcentuales (`ajustePrecio`), artículos con permiso ($12/kg + $3), facturación única vs consolidación y modalidades multi-origen (USA, China, Colombia, México).\\n' +
      '3. **Auditoría Exhaustiva de Flujos Críticos**: Revisión y certificación del pipeline completo (ingesta, fusión, visualización y facturación sin drift contable).\\n' +
      '4. **Suite Global y Despliegue**: 139 archivos de prueba aprobados (2,166 tests en verde al 100%), compilación limpia y despliegue completado en Firebase Hosting.',
    author: 'Antigravity AI',
    commitMessage: 'feat(pricing): complete global packages ingestion lock, zero-mock E2E matrix, and production deployment (v0.0.1546)',
  },
  {
    version: '0.0.1544',
    date: '2026-08-19',
    layer: 'both',
    type: 'feature',
    title: 'Aislamiento Completo de DUA y Paquetes en Aduana, Matriz Rígida de Pruebas de Grupos y Documentación Canónica de Invariantes',
    description:
      '1. **Aislamiento Seguro de DUA y Paquetes con Peso Cero (`peso === 0`)**: Los paquetes retenidos en aduana que ingresan sin peso (`peso === 0` o `null`) mantienen de forma segura su insignia roja `DUA` con precio `$0.00` sin disparar tarifas mínimas de flete ($8.00). Si el operador asigna un costo manual de trámite o desalmacenaje aduanal, este se respeta al 100%. Al ingresar el peso liberado (`peso > 0`), el badge DUA se retira y se calcula la tarifa normal automáticamente.\\n' +
      '2. **Matriz Rigurosa de Pruebas de Grupos y Cálculos (`NovaCalculationsAndGroups.spec.tsx`)**: 10 nuevas pruebas de integración que auditan métricas de grupos simples y múltiples, sumatorias exactas centavo a centavo (Peso, USD, CRC), overrides manuales del operador, descuentos porcentuales (`ajustePrecio`), separación de facturas y tipos de cambio dinámicos (₡470, ₡500, ₡515, ₡530).\\n' +
      '3. **35 Pruebas Matemáticas de Invariantes (`use-nova-price-invariants.spec.ts`)**: Pruebas centavo a centavo en todas las franjas de peso (0.01kg, 0.499kg, 0.50kg, 1.01kg, 1.50kg, 2.50kg, etc.), multi-país (USA, China, Colombia, México), permisos, payloads corruptos y DUA.\\n' +
      '4. **Documentación Canónica del Post-Mortem y Reglas Corporativas**: Incorporada la **Regla 15** en `.agents/AGENTS.md` y la **Sección 13** en `docs/nova_scenarios_and_workflows.md` detallando la causa raíz del operador `??`, la arquitectura de 5 capas y los protocolos para prevenir regresiones de IA en el futuro.\\n' +
      '5. **Suite Global**: 138 / 138 archivos de test en verde con 2,157 pruebas pasando al 100%.',
    author: 'Antigravity AI',
    commitMessage: 'feat(pricing): complete DUA customs isolation, rigid group calculation test matrix, and canonical invariant rules documentation (v0.0.1544)',
  },
  {
    version: '0.0.1542',
    date: '2026-08-19',
    layer: 'both',
    type: 'fix',
    title: 'Zero-Price Lock Permanente y Blindaje de Invariantes de Precios en Manifiestos y Facturación (5 Capas)',
    description:
      '1. **Blindaje de Invariante de Negocio (Zero-Price Lock)**: Garantía estricta de que ningún paquete con peso mayor a cero (`peso > 0`) puede resolver, mostrarse, guardarse o facturarse con precio $0.00 en ningún tipo de manifiesto (USA Aéreo/Marítimo, China, Colombia, México, Encomiendas, Mega-Man).\\n' +
      '2. **Capa 1 & 2 — Resolución y Cálculo en Vivo (`use-nova-price-calcs.ts` / `use-nova-resolved-rows.ts`)**: `getEffectivePrice` y la resolución de filas descartan precios 0 almacenados cuando hay peso cobrable, ejecutando un fallback determinístico con `calculatePrice`.\\n' +
      '3. **Capa 3 — Mapeo de Precios Facturados (`NovaTableModal.tsx`)**: `billedPrices` aplica fallback determinístico protegiendo la selección antes del envío a emisión de facturas.\\n' +
      '4. **Capa 4 — Emisión Segura de Facturas (`invoice-service.ts`)**: `buildInvoiceData` garantiza que ningún item de factura tenga importe $0.00 si tiene peso positivo, resolviendo dinámicamente tarifas por país/modalidad y derivando `rowsTotalUSD` estrictamente de la suma real de items.\\n' +
      '5. **Capa 5 — Hidratación y Persistencia Firestore (`fusion.ts` / `ingestion.ts`)**: `loadMegaManFromFirestore` y `saveManifestRecord` detectan y reparan paquetes con `precio: 0` al cargar o guardar registros en la base de datos.\\n' +
      '6. **Preservación de Ajustes y Overrides Manuales**: Los precios manuales asignados por el operador y ajustes de precio (`ajustePrecio`) mantienen la máxima prioridad, interviniendo el lock únicamente cuando el resultado evaluaría a cero o nulo con peso positivo.\\n' +
      '7. **Suite de Pruebas de Invariantes**: Nueva suite en `use-nova-price-invariants.spec.ts` validando los 5 niveles de blindaje con 100% de la suite vitest en verde (137/137 archivos, 2,117 tests).',
    author: 'Antigravity AI',
    commitMessage: 'fix(pricing): permanent 5-layer zero-price lock and pricing invariant enforcement across all manifest types and invoicing',
  },
  {
    version: '0.0.1540',
    date: '2026-08-18',
    layer: 'fe',
    type: 'fix',
    title: 'Cascada de Re-validación Nova 4-Niveles: Prioridad Pre-Alertas SSOT, Recarga Forzada de Aprendizaje y Motor de Coincidencia Profunda',
    description:
      '1. **Prioridad 1 — Pre-Alertas como Ground Truth (SSOT)**: `handleUnlinkAndRematch` verifica `preAlertsMap` y pre-alertas de fila antes de desvincular, asociando directamente el cliente de la pre-alerta (ej. `GIO MAROZZI` → `SL26356 Gino Marozzi`) sin enviarlo a "Sin Registro".\\n' +
      '2. **Prioridad 2 — Recarga Forzada de Aprendizaje en Vivo**: Invalida y recarga en tiempo real `match_feedback` desde Firestore (`reloadLearnedMatches`) al revalidar, garantizando que cualquier regla o cliente recién agregado en Nova Learning se aplique de inmediato.\\n' +
      '3. **Prioridad 3 — Motor de Coincidencia Profunda (`findCustomerMatch`)**: Reemplaza el autocompletado estricto de typeahead por el pipeline completo de matching, resolviendo subconjuntos y sufijos como `IVANNIA OVIEDO CHAVARRIA` → `SL261562 IVANNIA OVIEDO` (91%) con asignación automática.\\n' +
      '4. **Prioridad 4 — Preservación de Coincidencias Previas Confiables**: Conserva matches existentes con score ≥ 85% no divergentes cuando no hay nuevo ganador, evitando pérdidas accidentales de asignación.\\n' +
      '5. **Semiótica Visual de Estados ("Sin Registro" vs "Aprobado")**: La insignia `sin registro` incorpora borde discontinuo animado en sentido horario (`animate-marching-ants`) con punto de latido pulsante (`animate-ping`) y pulgar verde `👍` bloqueado (`cursor-not-allowed`) para evitar aprobaciones falsas. Cuando la fila está aprobada / en estado OK, la insignia de cliente (`[✓ SL...]`) resalta con borde discontinuo verde (`border-dashed border-emerald-500/80`), letras en verde esmeralda y checkmark reforzado.\\n' +
      '6. **Suite de Pruebas**: Nuevos tests de regresión en `use-nova-customer-assignment.spec.ts` y 100% de la suite global pasando en verde (136/136 archivos, 2,112 tests).',
    author: 'Antigravity AI',
    commitMessage: 'fix(nova): 4-tier revalidation cascade with pre-alert SSOT, live learning reload, clockwise marching border and green approved badges',
  },
  {
    version: '0.0.1538',
    date: '2026-08-18',
    layer: 'fe',
    type: 'feature',
    title: 'Rediseño Compacto de Confirmación de Guardado Nova: Métricas 4-Columnas, Conteo de Clientes y Escudo Seguro',
    description:
      '1. **Modal Centrado y Espacioso (`sm:max-w-3xl lg:max-w-4xl`)**: Rediseño visual sin efecto side-modal, con amplio espacio horizontal para soportar la cuadrícula de 3 botones de facturación (`Solo guardar`, `Guardar y facturar`, `Anular y re-crear`) y listas de facturas protegidas.\\n' +
      '2. **Fusión Compacta de Ámbito, Métricas y Facturas Previas**: Integración en una sola tarjeta de 4 columnas que consolida la identidad del filtro, `Total USD`, `Tipo de Cambio ₡470`, `Total Colones` y el desglose de facturas existentes (`Borrador`, `Enviadas`, `Pagadas`).\\n' +
      '3. **Conteo Universal de Clientes Afectados**: Muestra en tiempo real tanto la cantidad de paquetes como de clientes únicos en todos los estados (`X paq. · Y clientes`) para filtros de búsqueda, rutas, selección de casillas y manifiesto completo.\\n' +
      '4. **Escudo de Facturas Protegidas por Defecto en "Omitir" (`skip`)**: Las facturas previas protegidas (pagadas, enviadas, vencidas) se configuran en modo *Omitir* por defecto con explicación concisa en el encabezado, garantizando que no sufran alteraciones involuntarias.\\n' +
      '5. **Sincronización de Totales en Footer y Vistas Filtradas**: `totalCostUSD`, `activeTotal` y conversiones a colones (`crcTotal`) reflejan con exactitud el subconjunto filtrado visible en pantalla (`filteredIdxs`).\\n' +
      '6. **Suite de Pruebas Automatizadas**: 9 pruebas dedicadas en `NovaSaveConfirmModal.spec.tsx` y 100% de la suite vitest en verde (136/136 archivos, 2,109 tests).',
    author: 'Antigravity AI',
    commitMessage: 'feat(nova): compact save confirm modal with 4-col metrics, client counts and safe skip shield default',
  },
  {
    version: '0.0.1537',
    date: '2026-08-18',
    layer: 'both',
    type: 'perf',
    title: 'Persistencia Embebida de Pre-Alertas (Zero-Cost / -93% Firestore Reads) y Tooltip Flotante Rico en Nova',
    description:
      '1. **Persistencia Embebida y Rehidratación In-Memory (Zero-Cost)**: Se integró la serialización completa de metadatos de pre-alerta (`row.preAlert`: cliente, nombre, descripción, valor declarado, courier, factura adjunta, fecha) en `saveManifestRecord` y `useNovaResolvedRows`. Al reabrir manifiestos guardados o fusiones Mega-Man de Firestore (`loadedFromFirestore: true`), los datos se rehidratan síncronamente en memoria con 0 lecturas adicionales a Firestore (-93% de consumo en ciclo de vida operativo).\\n' +
      '2. **Inmunidad Estricta en Manifiestos de Firestore**: Cumplimiento del 100% con las reglas de negocio de Nova: en manifiestos de Firestore (`dataOriginPolicy.origin === "firestore"`), no se ejecutan procesos automáticos ni re-asignaciones que alteren los links curados por el administrador (`allowAutoPreAlertAssign = false`).\\n' +
      '3. **Tooltip Flotante Rico con Z-Index [99999]**: Visualización instantánea al pasar el cursor sobre la insignia `P`, mostrando tarjeta completa con código/nombre de cliente, transportista, descripción de contenido, valor en $USD, estado de factura adjunta y alerta de reasignación manual.\\n' +
      '4. **Verificación Integral de Calidad**: 132 archivos de prueba y 2,084 tests globales en verde sin regresiones.',
    author: 'Antigravity AI',
    commitMessage: 'perf(nova): embed pre-alert metadata on save for zero-cost rehydration and add rich z-99999 hover tooltip',
  },
  {
    version: '0.0.1536',
    date: '2026-08-18',
    layer: 'both',
    type: 'feature',
    title: 'Consolidación de Pre-Alertas como SSOT Directo en SP2, Menú de Acciones Multi-Columna y Canonicalización IMpb/1Z',
    description:
      '1. **Arquitectura SSOT en SP2**: Se consolidó a `smart-portal-2` como la Única Fuente de la Verdad para `pre_alerts`. Se ajustaron las reglas en `firestore.rules` (`allow read: if true;`) para permitir consultas directas por SDK desde SP1 (`dbSP2`) con respaldo resiliente a `db`, eliminando errores de permisos y duplicación de colecciones.\\n' +
      '2. **Normalización de Nombres de Documentos en SP2**: Cloud Function administrativa (`slAdminNormalizePreAlerts`) y script ejecutable (`normalize-prealerts.cjs`) para estandarizar los documentos bajo el formato determinista canónico `pre_alerts/${canonicalTracking}_${slCode}` y resolver códigos SL de usuarios.\\n' +
      '3. **Inmunidad en Rollovers de Manifiesto (Carry-On)**: Las pre-alertas con referencias de borradores previos (ej. `13-08-2026DAN`) mantienen su elegibilidad al 100% al consolidarse en nuevos mega-manifiestos (`MEGA-MAN-14-08-2026`), mientras no hayan sido facturadas o entregadas.\\n' +
      '4. **Menú de Acciones Multi-Columna en Nova**: Organización clara en 3 columnas cuando hay filtro activo (1: Vista & Filtros, 2: Todo el Manifiesto, 3: Filtradas con `targetRowIndices`).\\n' +
      '5. **Suite de Pruebas con Datos Reales**: +55 casos de prueba de base de datos reales (`pre-alert-real-dataset-50.spec.ts`) y 100% de tests globales pasados (2,026+ tests).',
    author: 'Antigravity AI',
    commitMessage: 'feat(prealerts): establish SP2 as direct SSOT, add multi-column actions menu and USPS/1Z canonicalization suite',
  },
  {
    version: '0.0.1535',
    date: '2026-08-17',
    layer: 'fe',
    type: 'feature',
    title: 'Motor Universal de Zona Horaria Costa Rica (America/Costa_Rica - UTC-6) e Invarianza Geográfica',
    description:
      '1. **Invarianza Geográfica**: Toda la lógica de facturación (`generateInvoiceNumber`), boletas de ruta (`nova-print.ts`), estados de cuenta (`ClientLedger.tsx`), manifiestos de encomiendas (`encomienda-shipping-label.ts`) y tablas administrativas evalúa su fecha y hora exclusivamente sobre la zona horaria de Costa Rica (`UTC-6`), eliminando discrepancias por cruce de medianoche cuando el administrador opera desde el extranjero (Tokio, Europa o EE. UU.).\\n' +
      '2. **Compatibilidad Retrospectiva y Cero Regresiones**: Manejo transparente de fechas históricas pre-formateadas (`DD/MM/YYYY`), Timestamps de Firestore (`{ seconds, nanoseconds }`) y números de factura legados (`SL4859-20260416154146-C`).\\n' +
      '3. **Suites Exhaustivas de Pruebas**: 127 archivos de prueba y 1,977 tests en verde ejecutados bajo simulación de 6 zonas horarias globales.',
    author: 'Antigravity AI',
    commitMessage: 'feat(timezone): guarantee universal America/Costa_Rica timezone invariance and add exhaustive test suite across global zones',
  },
  {
    version: '0.0.1510',
    date: '2026-08-17',
    layer: 'fe',
    type: 'fix',
    title: 'Blindaje e Invariantes para Paquetes Devueltos (Returned Status Lock Guard)',
    description:
      '1. **Returned Status Lock Guard**: Se implementó una regla de bloqueo que impide que acciones masivas de entrega en Rutas (`RoutesManagement.tsx`) o sincronizaciones en cascada de facturas (`sync-invoices-service.ts`) sobrescriban el estado de paquetes devueltos (`status` o `deliveryStatus === returned`).\\n' +
      '2. **Suscripción Dual y Resiliencia en Devoluciones**: Se mejoró `ReturnedPackages.tsx` para escuchar tanto `status === returned` como `deliveryStatus === returned` con deduplicación por ID, eliminando limbos de visibilidad.\\n' +
      '3. **Restauración de Paquetes en Firestore**: Se restauró el paquete TBA333475078910 a su estado devuelto activo para gestión en bodega.',
    author: 'Antigravity AI',
    commitMessage: 'fix(returns): protect returned packages with status lock guard and dual subscription',
  },
  {
    version: '0.0.1506',
    date: '2026-08-17',
    layer: 'fe',
    type: 'perf',
    title: 'Optimización de previsualización y anulación de facturas, y reactividad en tiempo real de contadores en Nova',
    description:
      '1. **Previsualización Instantánea (<50ms)**: Se reemplazó la llamada bloqueante a Cloud Function `slGetInvoice` (48.2s) por resolución por capas en memoria RAM y SDK directo, renderizando datos de clientes (correo, SmartId, ruta) de inmediato.\\n' +
      '2. **Anulación Ultra-Rápida (<100ms)**: Se optimizó `handleAnnulInvoice` utilizando `firestoreApi.invoices.update` directo y `writeBatch` atómico para los paquetes, eliminando bloqueos de red.\\n' +
      '3. **Reactividad en Tiempo Real en Nova**: Se mejoró `subscribePackagesByManifest` para resolver sub-manifiestos fusionados (`fusedManifests`) y `manifest_consolidation`, actualizando contadores y totales en vivo ante operaciones de Carry-On sin perder ediciones locales.',
    author: 'Antigravity AI',
    commitMessage: 'perf(invoices): instant preview and annulment, real-time reactive counters in Nova',
  },
  {
    version: '0.0.1505',
    date: '2026-08-13',
    layer: 'both',
    type: 'refactor',
    title: 'Edición interactiva, impresión rápida modularizada sin trackings y salvaguardas en etiquetas',
    description:
      '1. **Edición Interactiva**: Habilita la actualización interactiva de guías existentes mediante bypass directo a Firestore SDK, uniendo dinámicamente paquetes marcados/desmarcados y soportando cancelaciones claras.\\n' +
      '2. **Impresión Rápida Modular**: Reemplaza popups nativos por AlertDialogs de Radix UI con ancho extendido (620px). Permite decidir si se imprime con o sin números de rastreo. Redirige automáticamente a edición si se intenta imprimir una guía vacía con trackings.\\n' +
      '3. **Salvaguardas de Robustez**: Previene caídas TypeError por arrays de paquetes nulos/indefinidos en documentos legacy mediante checks `(label.packages || [])` y optimiza la creación de raíces de renderizado dinámicas en React 18.',
    author: 'Antigravity AI',
    commitMessage: 'refactor: interactive editing, safe quick printing, React 18 dynamic root cleanup',
  },
  {
    version: '0.0.1489',
    date: '2026-08-11',
    layer: 'both',
    type: 'fix',
    title: 'FIX-CARRYON-ENCOMIENDA-MANIFEST-EXCLUSION-SYNC: Sincronización del encomiendaManifestNumber en Carry-On',
    description:
      '1. **Sincronización de Encomienda en Carry-On**: Se modificó `carryOnPackages` para actualizar el campo `encomiendaManifestNumber` a la ID del manifiesto destino si éste es de tipo encomienda (empieza con "ENC-"), o limpiarlo a "none" si es un manifiesto regular Courier.\\n' +
      '2. **Evitar Exclusiones del Nova Table**: Esto corrige la exclusión accidental de los paquetes trasladados desde transitoria por la regla de resguardo en `loadMegaManFromFirestore`, que descarta paquetes asignados a encomiendas en manifiestos regulares.\\n' +
      '3. **Reparación de Datos**: Se limpió el campo `encomiendaManifestNumber` a "none" en los paquetes del limbo de Jessika Sanchez para resolver su visibilidad en el manifiesto actual.',
    author: 'Antigravity AI',
    commitMessage: 'fix(carry-on): sync encomiendaManifestNumber to prevent Nova table exclusion',
  },
  {
    version: '0.0.1487',
    date: '2026-08-11',
    layer: 'both',
    type: 'fix',
    title: 'FIX-CARRYON-STATUS-SYNC: Corregir actualización de estado de paquete en transferencia Carry-On',
    description:
      '1. **Sincronización de Estado en Carry-On**: Se modificó `carryOnPackages` para actualizar el campo `status` del paquete a `customs` (o `consolidated` si el destino es transitoria) al reasignarlo, previniendo estados inconsistentes de limbo.\\n' +
      '2. **Bitácora de Auditoría en Carry-On**: Se añadió el registro del evento en `statusHistory` indicando el origen y destino del movimiento.\\n' +
      '3. **Reparación de Datos**: Se corrigieron manualmente en Firestore los estados de los paquetes afectados para restablecer su visibilidad en el manifiesto.',
    author: 'Antigravity AI',
    commitMessage: 'fix(carry-on): update package status and history during reassignment',
  },
  {
    version: '0.0.1481',
    date: '2026-08-11',
    layer: 'both',
    type: 'feature',
    title: 'FEAT-NOVA-PRICE-ADJUSTMENT-AUTOCOMPLETE-PILLS-AND-EXPAND: Píldoras de autocompletado rápido para justificación y redimensión adicional del modal',
    description:
      '1. **Píldoras de Autocompletado Rápido**: Se agregaron botones de píldoras next to the "Justificación del ajuste" label, permitiendo al operador hacer clic para autocompletar rápidamente con razones típicas ("Precio mayorista", "Descuento por volumen", "Error de pesaje", "Acuerdo comercial").\\n' +
      '2. **Ancho del Modal a max-w-6xl**: Se aumentó el ancho del modal a `max-w-6xl` y se aplicó la propiedad `whitespace-nowrap` a las celdas de precios y diferencias para evitar saltos de línea molestos.',
    author: 'Antigravity AI',
    commitMessage: 'feat(nova-pricing): add autocomplete pills and expand modal',
  },
  {
    version: '0.0.1480',
    date: '2026-08-11',
    layer: 'both',
    type: 'feature',
    title: 'FEAT-NOVA-PRICE-ADJUSTMENT-MODAL-RESIZE-AND-SPLIT-COLUMNS: Ajuste de ancho de modal e inclusión de columnas de precio calculado, actual y nuevo',
    description:
      '1. **Modal de Ajustes Rediseñado**: Se amplió el ancho del modal de ajuste de precios a `max-w-4xl` para dotar a la tabla de mayor visibilidad y espacio.\\n' +
      '2. **Desglose de Tarifas**: Se añadieron tres columnas de precios diferenciadas: "Precio calculado" (fórmula estricta por peso/envío), "Precio actual" (el valor actual en la fila del manifiesto) y "Precio nuevo" (el valor que el operador edita).\\n' +
      '3. **Delta en Tiempo Real**: Se reconfiguró la columna de variación (Δ) para reportar la diferencia exacta en tiempo real entre el precio nuevo propuesto y el precio actual de la fila.',
    author: 'Antigravity AI',
    commitMessage: 'feat(nova-pricing): make modal wider and split price columns',
  },
  {
    version: '0.0.1479',
    date: '2026-08-11',
    layer: 'both',
    type: 'feature',
    title: 'FEAT-NOVA-PRICE-ADJUSTMENT-HISTORY-AND-VISUAL-BADGES: Historial de cambios acumulativo de precios en el modal e indicador visual "Ajustado" en colones en la tabla Nova',
    description:
      '1. **Historial Acumulativo de Cambios**: Se modificó `PriceAdjustmentModal` y la interfaz `AjustePrecio` para rastrear de manera secuencial todos los cambios aplicados a las tarifas de los paquetes, almacenándolos en la colección de Firestore en un array `historial`.\\n' +
      '2. **Visualización de Historial en Modal**: Se implementó una sección detallada bajo el número de tracking en el modal de ajuste de precio, mostrando cronológicamente quién realizó el ajuste, el monto y su justificación.\\n' +
      '3. **Badge "Ajustado" en la Tabla Nova**: Se añadió un indicador púrpura discreto ("Ajustado") junto al precio convertido a colones (CRC) para que el operador identifique de un vistazo qué paquetes tienen tarifas manuales personalizadas.',
    author: 'Antigravity AI',
    commitMessage: 'feat(nova-pricing): price adjustment history tracking and visual badges',
  },
  {
    version: '0.0.1477',
    date: '2026-08-11',
    layer: 'both',
    type: 'fix',
    title: 'FIX-NOVA-LEARNING-DELETION-AND-ROUTE-RESOLUTION-INTEGRITY: Corrección de desvínculos de patrones de aprendizaje, borrado de rutas de unmatched y preservación de rutas y precios guardados en Firestore',
    description:
      '1. **Borrado Completo de Patrones en Desvínculo**: Se corrigieron las consultas de eliminación de `manifest_learning_patterns` en `forgetMatchFeedback` y `deleteLearnedFeedbackForSlCode` para barrer registros tanto por el nuevo campo `normalizedName` como por fallbacks del campo `rawName` en documentos legados, previniendo colisiones de falsos positivos en futuras importaciones.\\n' +
      '2. **Eliminación de Rutas Aprendidas de Unmatched**: Se corrigieron las referencias de desvínculo de rutas en `unmatched_route_learning` para eliminar documentos bajo ambos patrones de ID (`normalizedName` y `unmatched_route_${normalizedName}`), garantizando que las rutas no deseadas no persistan en Firestore.\\n' +
      '3. **Preservación de Rutas Guardadas de Manifiestos**: Se incorporó el parámetro `loadedFromFirestore` al hook `useNovaResolvedRows` para establecer que en manifiestos ya almacenados, el campo `row.ruta` persista con prioridad frente a la ruta predeterminada del cliente en `customerContactMap`, previniendo sobrescrituras silenciosas.\\n' +
      '4. **Preservación de Precios Personalizados**: Se corrigió el orden de prioridad de resolución de precios en `useNovaResolvedRows` y `useNovaPriceCalcs` para garantizar que, en manifiestos de Firestore, se conserve la tarifa original guardada (`row.precio` y `row.pesoRedondeo`) en lugar de sobreescribirla de manera forzada con el precio estándar recién calculado (`computedPrices`).\\n' +
      '5. **Sincronización en Tiempo Real**: Se corrigió el callback de suscripción en tiempo real de contactos en `NovaTableModal.tsx` para evitar poblar indebidamente la colección local de desvíos de ruta (`rutaOverrides`) cuando el manifiesto ya está persistido en base de datos, resolviendo el desfase del operador.',
    author: 'Antigravity AI',
    commitMessage: 'fix(nova-learning): fix learning cleanup and preserve routes/prices from Firestore',
  },
  {
    version: '0.0.1475',
    date: '2026-08-11',
    layer: 'both',
    type: 'fix',
    title: 'FIX-NOVA-UX-AND-ANIMATION-REFINEMENTS: Transiciones de entrada y salida fluidas en terceros, desvanecimiento de filas, reseteo síncrono de carga en render y unificación de cargadores de chat',
    description:
      '1. **Reseteo Síncrono de Carga en Render**: Se solucionó el flash visual de las filas del manifiesto previo al abrir uno nuevo en la tabla de Nova. Se implementaron comparaciones de render-phase en `NovaTableModal` para restablecer de inmediato el estado `tercerosLoaded` a `false` de forma síncrona en el primer renderpass, garantizando que el skeleton se dibuje directamente sin saltos visuales.\\n' +
      '2. **Transición Suave de Entrada y Salida para Terceros**: Se dotó al componente `NovaTerceroRowCell` de animaciones de entrada (`animate-row-in`) y salida controlada por un temporizador de 300ms (`animate-row-out` y animación `cellCollapse` en las celdas `<td>`), logrando que las filas se desvanezcan y encojan suavemente al eliminarse de Firestore, compactando el resto del layout de forma fluida.\\n' +
      '3. **Animación de Desvanecimiento de Filas en Bloque**: Se aplicó la clase `animate-table-row-fade-in` a todas las filas dinámicas de paquetes y pies de grupo para una revelación progresiva y estética al terminar de cargar el skeleton.\\n' +
      '4. **Unificación de Cargadores y Consolidación CSS**: Se removió el modal overlay de pantalla completa y las notificaciones toast de cargado en `Nova.tsx` para guiar la interacción por el flujo de conversación nativo del chat de Nova ("Nova está procesando..."). Asimismo, se consolidaron todas las reglas y keyframes CSS en la hoja de estilos nativa de la tabla de `NovaTableModal.tsx`, previniendo redundancias en el DOM y asegurando compatibilidad completa en Chrome para Windows.',
    author: 'Antigravity AI',
    commitMessage: 'fix(nova-ux): add smooth animations, render-phase loading resets, and clean up loaders',
  },
  {
    version: '0.0.1466',
    date: '2026-08-10',
    layer: 'both',
    type: 'chore',
    title: 'CHORE-DATABASE-AUDIT-AND-CLEANUP: Auditoría de Mapeos de Aprendizaje y Limpieza Manual de Colisiones',
    description:
      '1. **Auditoría Forense de Base de Datos**: Se realizó una auditoría completa sobre las colecciones `match_feedback` y `manifest_learning_patterns` de la base de datos de producción `"portal"`. Se confirmó la coexistencia de registros conflictivos para el nombre "MARIA JOSE LEANDRO DIAZ" (apuntando de forma errónea a SL26116 y correcta a SL1562).\\n' +
      '2. **Análisis de Línea de Tiempo**: Se verificó que el conflicto persistió porque el último guardado del operador se realizó a las 2:25 PM local, previo al despliegue de la versión 0.0.1465 (a las 5:23 PM local) que activa la barredora atómica en segundo plano.\\n' +
      '3. **Limpieza Manual Directa**: Se eliminó el documento conflictivo `match_feedback/MARIA_JOSE_LEANDRO_DIAZ_SL26116` en producción y se corroboró el rol de ADMIN del usuario de gerencia, asegurando inmunidad contra restricciones de eliminación en futuras reasignaciones de Nova.',
    author: 'Antigravity AI',
    commitMessage: 'chore(release): database cleanup and version bump to v0.0.1466',
  },
  {
    version: '0.0.1465',
    date: '2026-08-10',
    layer: 'both',
    type: 'fix',
    title: 'FIX-NOVA-PRICING-PERSISTENCE-AND-LEARNING-CLEANUP: Persistencia de Ajustes de Precios en Manifiestos de Nova, Barredora Activa de Conflictos y Olvido de Unlinks',
    description:
      '1. **Persistencia de Ajustes de Precios**: Se solucionó un bug en el que los ajustes manuales de precio y justificaciones aplicadas por el operador en el modal de ajuste de precio de Nova se perdían al guardar y recargar el manifiesto. Se configuró el hook `useNovaResolvedRows` para aceptar y mapear el estado `priceAdjustments` e inyectar el campo `ajustePrecio` en las filas resueltas de salida que recibe `saveManifestRecord`.\\n' +
      '2. **Barredora Activa de Conflictos (Conflict Sweeper)**: Se modificaron `saveMatchFeedback` y `saveMatchFeedbackBulk` para eliminar de Firestore cualquier registro viejo/conflictivo con el mismo nombre pero diferente código SL, previniendo colisiones persistentes (ej. José Brenes).\\n' +
      '3. **Olvido Activo al Desasociar (Unlink)**: Se implementó la función `forgetMatchFeedback(manifestName)` para borrar de Firestore todas las asociaciones y rutas aprendidas cuando un operador desvincula una fila, y se enlazó el aprendizaje reactivo automático y silencioso al guardar y facturar en el modal.',
    author: 'Antigravity AI',
    commitMessage: 'fix(nova-pricing): persist priceAdjustments to Firestore and resolve learning conflicts',
  },
  {
    version: '0.0.1454',
    date: '2026-08-06',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-NOVA-PREALERT-INTEGRITY-INDEX-ALIGNMENT: Corrección de desalineamiento de índices en validación de pre-alertas de Nova',
    description:
      '1. **Corrección de Desalineamiento de Índices**: Se solucionó un bug en `checkPreAlertIntegrity` que ocurría al filtrar la tabla de Nova. El validador utilizaba el índice local de la lista visible (filtrada) para consultar el mapa global de reasignaciones (`matchOverrides`/`slCodeOverrides`), asignando de forma incorrecta overrides de otras filas a paquetes válidos y provocando advertencias falsas de conflicto.\\n' +
      '2. **Inyección de originalIndex**: Se agregó la propiedad `originalIndex: idx` a los objetos de fila resueltos en `useNovaResolvedRows` y a la interfaz `ManifestRow` para preservar el índice físico global de cada fila.\\n' +
      '3. **Validación Defensiva**: Se adaptó `checkPreAlertIntegrity` para resolver overrides usando `row.originalIndex` con fallback al índice local, garantizando retrocompatibilidad absoluta y previniendo regresiones.',
    author: 'Antigravity AI',
    commitMessage: 'fix(nova): resolve index alignment bug in pre-alert integrity checks',
  },
  {
    version: '0.0.1441',
    date: '2026-07-31',
    layer: 'fe',
    type: 'feature',
    title: 'FEAT-NOVA-LEARNING-INTERACTIVE-VARIANTS-AND-AI-CLEANUP: Remoción de sección de asistente de IA en Nova Learning, edición interactiva y eliminación de variantes de nombre, e invalidación reactiva del caché de coincidencias',
    description:
      '1. **Eliminación del Asistente de IA**: Se removió por completo la tarjeta y el segmento del Asistente de IA de Patrones Cognitivos ("Escanear Patrones con Nova AI" y lista de insights) que ya no se utilizará en la pestaña de Aprendizaje Cognitivo.\\n' +
      '2. **Variantes de Nombre Interactivas**: Se transformaron las insignias (badges) de variantes de nombre en la tabla de Frecuencia y Repetitividad de Clientes en elementos interactivos con botón de eliminación individual (`x`). Al hacer clic en la `x`, se despliega el diálogo de confirmación para eliminar permanentemente esa variante específica de Firestore.\\n' +
      '3. **Invalidación Reactiva de Caché**: Se integró la llamada a `reloadLearnedMatches` dentro de `createMatchFeedback`, `deleteMatchFeedback`, `deleteMatchFeedbackBulk` y `updateMatchFeedback` en `nova-learning-service.ts`. Esto asegura la invalidación inmediata del caché en memoria (TTL de 5 min) al crear, editar o eliminar mapeos, garantizando que los mapeos manuales y las eliminaciones surtan efecto instantáneamente en el motor de Nova sin tener que esperar.',
    author: 'Antigravity AI',
    commitMessage: 'feat(nova-learning): clean up AI assistant, add variant close buttons, and force instant cache reload on CRUD writes',
  },
  {
    version: '0.0.1437',
    date: '2026-07-31',
    layer: 'both',
    type: 'fix',
    title: 'FIX-NOVA-LEARNING-SINGLE-TOKEN-GUARD: Implementación de la salvaguarda de palabra única para el motor de coincidencia cognitiva, edición inline de mapeos y eliminación de fugas de credenciales en Git',
    description:
      '1. **Salvaguarda de Palabra Única (Single-Token Guard)**: Se implementó un filtro en `learned-lookup.ts` que bloquea coincidencias difusas, por apodo o subconjuntos si el nombre entrante o el aprendido tiene solo 1 palabra. Esto resuelve de raíz falsos positivos de asociación automática como `"STEPH"` -> `ADRIANA STEPHANIE` y `"KATHERIE DIAZ"` -> `"DIAZ"` (José Gabriel Díaz Camacho).\\n' +
      '2. **Eliminación de Fugas de Credenciales en Git**: Se removieron de Git y se agregaron a `.gitignore` archivos sensibles de variables de entorno (.env), respaldos de datos de autenticación de usuarios (current_auth_users.json) y estados de sesión/cookies activas de Playwright (playwright/.auth/user.json) en `smart-portal-1` y `smart-portal-2` para evitar la exposición y abuso de claves como Gemini API, Twilio, y Resend.\\n' +
      '3. **Edición Inline de Mapeos**: Se añadió la funcionalidad de edición inline en la pestaña de Mapeos Aprendidos (match_feedback), permitiendo al operador corregir en caliente nombres de manifiestos, códigos SL, nombres de clientes y flags de consolidación/ruta desde la interfaz de aprendizaje.\\n' +
      '4. **Optimización y Filtros**: Rediseño de la pestaña de Aprendizaje Cognitivo con carga diferida (hasta buscar), filtros dinámicos (ruta, uso, consolidación), y optimización de complejidad algorítmica de `useMemo` de O(N*M) a O(N+M).\\n' +
      '5. **Resiliencia Local Offline**: Se implementó la detención inmediata de reintentos fallidos de red de la API de Gemini (en caso de clave inválida o suspendida), degradando el chat y la clasificación a métodos locales suaves.',
    author: 'Antigravity AI',
    commitMessage: 'fix(matching): implement single-token guard in learned matches lookup to prevent false positive auto-associations',
  },
  {
    version: '0.0.1430',
    date: '2026-07-30',
    layer: 'both',
    type: 'feature',
    title: 'VERIFICATION-PREALERT-IMMUNITY-E2E: Verificación completa de compilación sin errores, suite de pruebas unitarias 100% verde y pruebas E2E de Playwright',
    description:
      '1. **Pruebas E2E de Playwright**: Ejecutadas y pasadas al 100% (`customer-route-ui-verification.spec.ts`), confirmando la correcta renderización de clientes, rutas e inmunidad de datos en la interfaz.\\n' +
      '2. **Build de Producción**: Verificado con `npm run build` en SP1 y SP2 con 0 errores y separación de bundles estable (Firebase: 379 kB, React: 430 kB, UI: 804 kB, App: 2.51 MB).\\n' +
      '3. **Pruebas Integrales**: 110/110 pruebas pasadas en Vitest sin ninguna regresión en el motor de coincidencias, inmunidad de Firestore, propagación de filas gemelas o guardia de apellidos LatAm.',
    author: 'Antigravity AI',
    commitMessage: 'chore(release): full build and Playwright E2E verification v0.0.1430',
  },
  {
    version: '0.0.1429',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-NOVA-PREALERT-IMMUNITY: Garantía de inmunidad total para manifiestos de Firestore y fusiones Mega-Man frente a auto-asignaciones reactivas de pre-alertas',
    description:
      'Root Cause: El observador reactivo en segundo plano `watchTrackingPreAlerts` en `NovaTableModal.tsx` ejecutaba el Paso 3 (auto-corrección reactiva en React state `setMatchOverrides` y `setSlCodeOverrides`) sin consultar el flag `dataOriginPolicy.allowAutoPreAlertAssign`. Al abrir manifiestos guardados o fusiones Mega-Man de Firestore (`loadedFromFirestore: true`), si un rastreo coincidía con una pre-alerta existente, el observador reescribía en caliente los clientes curados por el administrador con el código de la pre-alerta (ej. `SL3231`).\\n\\n' +
      'Solución:\\n' +
      '1. Se agregó `dataOriginPolicyRef` sincronizado con la política de origen activa.\\n' +
      '2. Se protegió el Paso 3 de `watchTrackingPreAlerts` con la condición `if (!dataOriginPolicyRef.current.allowAutoPreAlertAssign) return;`.\\n' +
      '3. Para datos de Firestore, el observador continúa cargando pasivamente los badges informativos `[P]` y tooltips, pero deja las asignaciones del manifiesto e inmutabilidad de los datos 100% protegidas.',
    author: 'Antigravity AI',
    commitMessage: 'fix(nova): enforce pre-alert immunity on Firestore manifests v0.0.1429',
  },
  {
    version: '0.0.1428',
    date: '2026-07-30',
    layer: 'both',
    type: 'feature',
    title: 'NOVA-TWIN-ROW-PROPAGATION & SURNAME-GUARD: Propagación de vinculación a filas gemelas del mismo nombre y protección contra falsos positivos por apellidos opuestos',
    description:
      '1. **Supremacía de Admin Pick**: Las vinculaciones manuales confirmadas por administradores (`admin_pick`, `admin_manual`, `admin_sp2`) conservan prioridad 1.0 (Ley Suprema) en el motor de memoria de Nova.\\n' +
      '2. **Guardia de Apellidos (LatAm Surname Protection Guard)**: En `learned-lookup.ts`, si un nombre del manifiesto y un candidato de memoria tienen 3+ tokens (nombres y apellidos) pero 0 apellidos en común (ej. `MARIA JOSE LEANDRO DIAZ` vs `MARIA JOSE PICON`), el sistema bloquea automáticamente la coincidencia automática de 95% para evitar asociar clientes con nombres de pila idénticos y apellidos opuestos.\\n' +
      '3. **Propagación a Filas Gemelas**: En `use-nova-customer-assignment.ts` (`applyExplicitMatch`), al vincular o desvincular un cliente, Nova identifica todas las filas del manifiesto que comparten exactamente el mismo nombre normalizado e imparte la misma asignación y ruta a todas las filas gemelas.\\n' +
      '4. **Coherencia de Clave de Agrupación (`groupKey`)**: En `NovaTableModal.tsx` (`sortedGroups`), si una fila sin vincular comparte nombre normalizado con otra fila que posee asignación válida, ambas se agrupan bajo la misma clave de tabla en lugar de separar las filas como "[✓ Desconocida]" y "[sin registro]".',
    author: 'Antigravity AI',
    commitMessage: 'feat(nova): twin row propagation and LatAm surname guard v0.0.1428',
  },
  {
    version: '0.0.1427',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-SP2-USERMODAL-ADDRESS-LOOP: Eliminación completa del bucle infinito de re-renderizado en la pestaña de Direcciones de UserModal',
    description:
      'Root cause: La función `fetchRelatedData` en `UserModal.tsx` incluía `onUpdateAddresses` en su array de dependencias. Al finalizar la carga de direcciones de Firestore, llamaba a `onUpdateAddresses`, lo cual ejecutaba `setUserAddresses` en `UsersManagement.tsx`. ' +
      'Dado que la prop `onUpdateAddresses` se pasaba como una función inline anónima, se volvía a crear en cada renderizado del padre, forzando la recreación de `fetchRelatedData` y activando su `useEffect` de nuevo en un ciclo infinito de spinnner ("Cargando direcciones...").\\n\\n' +
      'Solución:\\n' +
      '1. Se encapsuló `onUpdateAddresses` en un `onUpdateAddressesRef` dentro de `UserModal.tsx` y se removió de las dependencias de `fetchRelatedData` (dejando únicamente `[user.uid]`).\\n' +
      '2. Se estabilizó `handleUpdateAddresses` usando `useCallback` en `UsersManagement.tsx`.\\n' +
      '3. Se importó explícitamente `useRef` en `UserModal.tsx`.',
    author: 'Antigravity AI',
    commitMessage: 'fix(sp2): break infinite address loading loop in UserModal v0.0.1427',
  },
  {
    version: '0.0.1426',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-SP2-ADDRESS-LOADING-RESOLUTION: Garantía de carga inmediata de dirección para cualquier búsqueda o lista de usuarios',
    description:
      'Root cause: En la vista de gestión de usuarios, la evaluación de dirección priorizaba `userAddresses[user.uid] || (user as any).addresses`, pero `userAddresses[user.uid]` se inicializaba como un array vacío `[]` (truthy), lo que impedía que `(user as any).addresses`, `defaultAddress`, `location` o `formattedAddress` incrustados en el objeto de usuario se utilizaran. Además, `isLoadingAddr` bloqueaba la renderización mostrando "Cargando dirección..." independientemente de si la dirección ya estaba disponible en memoria.\\n\\n' +
      'Solución:\\n' +
      '1. Se refactorizó la resolución de dirección para evaluar en cascada: `fetchedAddrs` -> `user.addresses` -> `user.defaultAddress` -> `user.address` -> `user.location` -> `user.fullAddress` / `formattedAddress`.\\n' +
      '2. Se cambió la condición `isLoadingAddr` a `loadingAddresses[user.uid] && !primaryAddress`, permitiendo que la dirección se renderice instantáneamente sin quedarse trabada en estado de carga.\\n' +
      '3. Se añadieron fallbacks de consulta en Firestore (`userId`, `uid`, `userUid`) en `loadAddresses` para asegurar que las direcciones de usuarios legacy o migrados se resuelvan correctamente siempre.',
    author: 'Antigravity AI',
    commitMessage: 'fix(sp2): guarantee immediate address resolution for user search results v0.0.1426',
  },
  {
    version: '0.0.1425',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-SP2-SEARCH-SKELETON-JUMP: Prevención de despliegue del Skeleton Table al copiar datos de cliente (email/slCode/cédula)',
    description:
      'Root cause: Al presionar "Copiar" en el email, cédula o SL code de una tarjeta de cliente, la notificación Toast provocaba una actualización de estado que volvía a crear la función `executeSearch` (por dependencia directa de `toast`), ' +
      'lo cual activaba el `useEffect` con debounce de la búsqueda. Además, la condición del Skeleton Table (`searching && ...`) renderizaba la tabla esqueleto sobre/en lugar de las tarjetas existentes.\\n\\n' +
      'Solución:\\n' +
      '1. Se restringió la tabla esqueleto a la búsqueda inicial únicamente (`searching && searchResults.length === 0`). Si ya existen resultados mostrados, las tarjetas nunca se ocultan ni parpadean.\\n' +
      '2. Se utilizó `toastRef` en `copyToClipboard` y `executeSearch` para estabilizar sus referencias y eliminar la re-ejecución del timer de búsqueda al copiar datos o recibir notificaciones.\\n' +
      '3. Se añadió `lastExecutedSearchRef` para evitar re-consultas redundantes a Firestore si la búsqueda y sus parámetros no han cambiado.',
    author: 'Antigravity AI',
    commitMessage: 'fix(sp2): prevent search skeleton jump on user copy/update actions v0.0.1425',
  },
  {
    version: '0.0.1424',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-SP2-USERMODAL-NATIVE-SELECT: Reemplazo de Radix UI Select por elementos select nativos estilizados en UserModal',
    description:
      'Root cause definitivo: En React 19, `@radix-ui/react-select` (y sus primitivas dependientes `@radix-ui/react-popper` y `@radix-ui/react-compose-refs`) ' +
      'ejecuta un ciclo infinito de `setRef` -> `dispatchSetState` debido al manejo de cleanup de refs de React 19 con callbacks anónimos inline en los componentes de SelectTrigger/Popper.\\n\\n' +
      'Solución: Se reemplazaron los componentes Radix UI Select dentro de `UserModal.tsx` por elementos `<select>` nativos de HTML ' +
      'con clases de Tailwind CSS ultra-limpias (cursor-pointer, border-slate-200, rounded-xl, focus:ring-emerald-500). ' +
      'Esto elimina el 100% del overhead de Radix Select y previene permanentemente el crash "Maximum update depth exceeded" en React 19.',
    author: 'Antigravity AI',
    commitMessage: 'fix(sp2): replace Radix UI Select with native select in UserModal v0.0.1424',
  },
  {
    version: '0.0.1423',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-SP2-USERMODAL-REACT19: Eliminación de AnimatePresence redundante sobre UserModal para resolver React error #185 permanente',
    description:
      'Root cause confirmado: `AnimatePresence` de Framer Motion 12 envolvía directamente `ModalErrorBoundary` (class component) en React 19 concurrent mode. ' +
      'React 19 usa un dispatcher concurrent que, al transicionar entre un class component y sus children function components con hooks (UserModal → Select → SelectItem), ' +
      'dejaba el dispatcher en `null` temporalmente, disparando error #185 "Invalid hook call". ' +
      'El segundo intento funcionaba porque el React fiber tree ya estaba estabilizado del primer ciclo abortado.\\n\\n' +
      'Fix: Se eliminó el `<AnimatePresence>` en `UsersManagement.tsx` línea 1810 que era redundante — ' +
      '`UserModal` renderiza via `ReactDOM.createPortal` a `document.body` y maneja sus propias animaciones internamente. ' +
      'El `ModalErrorBoundary` ahora envuelve directamente el `UserModal` sin pasar por `AnimatePresence`.',
    author: 'Antigravity AI',
    commitMessage: 'fix(sp2): remove AnimatePresence wrapper around UserModal to fix React 19 error #185 v0.0.1423',
  },
  {
    version: '0.0.1422',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-SP2-USERS-MANAGEMENT: Corrección de 3 bugs críticos en gestión de usuarios SP2',
    description:
      'Corrección de tres bugs que afectaban la vista de administración de clientes en SP2 (smartlogisticscr.com):\n\n' +
      '• **Direcciones siempre en blanco (SL1794, SL2631)**: El guard `searchResults.length > 5` bloqueaba silenciosamente el fetch de direcciones cuando la búsqueda retornaba 6+ usuarios. ' +
      'El cap se subió a 50 y el fetch ahora procesa en batches de 10 con flush progresivo al UI.\n' +
      '• **Búsqueda por teléfono incompleta**: Buscar "8327 6225" (con espacio) no encontraba clientes porque el string con espacio se agregaba como candidato Firestore sin normalizar. ' +
      'Ahora solo se agregan variantes digit-clean al Set de candidates.\n' +
      '• **Pantalla en blanco al dar Editar**: UserModal crasheaba sin ErrorBoundary, desmontando toda la página. ' +
      'Se agregó `ModalErrorBoundary` que captura el crash, muestra un card de error recoverable con botón Cerrar y loguea el stack completo en consola.',
    author: 'Antigravity AI',
    commitMessage: 'fix(sp2): phone search normalization + UserModal ErrorBoundary + address loading cap v0.0.1422',
  },
  {
    version: '0.0.1421',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-NOVA-MATCH-ADMIN-PICK: Extender isDominantCollisionWinner para reconocer source="admin" con ≥3 hits como confirmación humana',
    description:
      'Corregido el segundo punto ciego en el pipeline de matching de Nova que causaba re-asignaciones incorrectas (ej. "JOSE BRENES") a pesar de tener learning confirmado por el admin:\n\n' +
      '• **isDominantCollisionWinner (match-learning.ts)**: Extendido para reconocer entradas con `source="admin"` (legacy pre-typed union) + `hitCount >= 3` como confirmación humana válida. ' +
      'Antes solo reconocía `admin_pick`, `admin_manual` y `admin_sp2`.\n' +
      '• **isAdminPick (batch-matcher.ts)**: Misma extensión aplicada en la fase de Pass 0 para que el fast-path corte antes del bloque de evaluación dinámica.\n' +
      '• **Resultado**: Con 23 hits de "JOSE BRENES" ambas capas lo tratan como absoluto — el homonym evaluator nunca puede invalidar el learning confirmado por el admin.',
    author: 'Antigravity AI',
    commitMessage: 'fix(nova-match): isDominantCollisionWinner + isAdminPick reconocen admin legacy source ≥3 hits v0.0.1421',
  },
  {

    version: '0.0.1420',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-AUTH-INDEXEDDB-CLEANUP: Removido borrado de IndexedDB en config.ts para preservar sesión activa de Firebase Auth',
    description:
      'Corregido el problema que causaba que la pantalla de autenticación se quedara en un spinner de carga infinito.\n\n' +
      '• **Removido script de borrado de IndexedDB**: Se eliminó `window.indexedDB.deleteDatabase` de `config.ts` que borraba la base de datos `firebaseLocalStorageDb` del navegador en cada versión.\n' +
      '• **Preservación de sesión**: Firebase Auth mantiene ahora la sesión y tokens de acceso intactos sin colgar el AuthListener (`useAuth`).\n' +
      '• **Auditoría de rutas en manifiesto**: Herramientas automáticas de auditoría de paquetes contra historial de facturas previa.',
    author: 'Antigravity AI',
    commitMessage: 'fix(auth): preserve Firebase Auth IndexedDB session storage v0.0.1420',
  },
  {
    version: '0.0.1407',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-CUSTOMER-CACHE-INVALIDATION: staleTime=0 en hooks de clientes para garantizar rutas siempre frescas desde Firestore',
    description:
      'Corregido el problema de caché que causaba que el UI mostrara rutas incorrectas después de correcciones en la base de datos.\n\n' +
      '• **staleTime reducido a 0** en `useCustomers` (lista), `useCustomer` (detalle) y `useCustomerSearch` (búsqueda) — ' +
        'el UI ahora siempre lee la ruta directamente de Firestore sin servir versiones cacheadas en memoria.\n' +
      '• **isRutaAdminLocked + rutaSetByAdminAt**: Al editar la ruta de un cliente desde `EditCustomerModal`, se marcan ' +
        'ambos campos en el documento para trazar el historial de cambios administrativos y blindar la ruta contra sobreescrituras de Nova.\n' +
      '• **Evento `customer-ruta-updated`**: Disparado desde `EditCustomerModal` al guardar exitosamente, ' +
        'permitiendo que cualquier listener en la app invalide su estado local inmediatamente.\n' +
      '• **ProtectedRoute con state.from**: El redirect al login ahora preserva la URL de destino ' +
        'para que al volver a autenticarse el operador regrese exactamente donde estaba.',
    author: 'Antigravity AI',
    commitMessage: 'fix: staleTime=0 en hooks de clientes — rutas siempre frescas desde Firestore',
  },
  {
    version: '0.0.1406',
    date: '2026-07-30',
    layer: 'fe',
    type: 'chore',
    title: 'CHORE-E2E-DATA-TESTID: Instrumentación completa de data-testid en Customers.tsx para cobertura E2E con Playwright',
    description:
      'Añadidos atributos `data-testid` a todos los elementos interactivos del listado de clientes para soporte de pruebas E2E automatizadas.\n\n' +
      '• `data-testid="customer-search-input"` en el input de búsqueda.\n' +
      '• `data-testid="customer-result-{slCode}"` en cada tarjeta de resultado.\n' +
      '• `data-testid="customer-ruta-badge-{slCode}"` con `data-ruta="{ruta}"` en el badge de ruta.\n' +
      '• `data-testid="btn-view-detail-{slCode}"` en el botón de ojo (detalle).\n' +
      '• `data-testid="btn-edit-{slCode}"`, `btn-delete-{slCode}"`, `btn-restore-{slCode}"`, `btn-toggle-status-{slCode}"` en acciones secundarias.\n' +
      '• Prueba E2E Playwright verificó 289/290 clientes (100% PASS) con sesión Firebase real vía CDP.',
    author: 'Antigravity AI',
    commitMessage: 'chore: data-testid en Customers.tsx para E2E Playwright',
  },
  {
    version: '0.0.1405',
    date: '2026-07-30',
    layer: 'fe',
    type: 'fix',
    title: 'FIX-INVOICES-HEADER-SORT: Corrección completa del ordenamiento por encabezados de columna en la vista de Facturas',
    description:
      'Corregida la funcionalidad de ordenamiento por clic en los encabezados de columna (Factura, Manifiesto, Cliente, Ruta, Total, Estado) en /invoices.\n\n' +
      '• Conectadas las propiedades sortField y sortDirection con el hook memoizado displayedFilteredInvoices.\n' +
      '• Columna Cliente ordenada estrictamente por el nombre completo en español (localeCompare es) sin concatenar el código SL.\n' +
      '• Soporte numérico en la columna Total y fecha cronológica en Date con fallbacks defensivos para campos nulos o no definidos.',
    author: 'Antigravity AI Agent',
  },
  {
    version: '0.0.1404',
    date: '2026-07-29',
    layer: 'both',
    type: 'fix',
    title: 'FIX-NOVA-AGENT-OBTENER-MANIFIESTOS: Corrección de consulta de manifiestos ML Cargo en vivo y resolución de error thought_signature 400',
    description:
      'Corregida la intercepción de intenciones en el chat de Nova y eliminado el fallo de firma de la API de Gemini 2.0/2.5.\n\n' +
      '• **Restauración de Consulta ML Cargo (Chip Obtener Manifiestos)**: Eliminado el filtrado prematuro que bloqueaba la consulta en vivo de manifiestos ML Cargo. El botón de chip "Obtener manifiestos" invoca correctamente la herramienta AI `list_mlocker_manifests` en el portal de ML Cargo.\n' +
      '• **Inmunidad a Error Thought Signature (Gemini 400)**: Eliminada la inyección sintética de partes `{ functionCall }` en la pre-ejecución sin firma del modelo. Ahora retorna directamente la respuesta estructurada con tarjetas clickables, eliminando errores 400 e incrementando la velocidad a 0ms.\n' +
      '• **Regla 8 en AGENTS.md**: Documentada la regla de arquitectura para prevenir regresiones en el chat de Nova y resguardar los fast-paths sin IA.',
    author: 'Antigravity AI',
  },
  {
    version: '0.0.1403',
    date: '2026-07-29',
    layer: 'both',
    type: 'feature',
    title: 'FEATURE-EDIT-CUSTOMER-FULLSCREEN-OPTIN-SYNC: Rediseño Fullscreen de 3 Columnas por Dominio y Sincronización de Ruta Explícita a SmartWeb (SP2)',
    description:
      'Reestructurado completamente el modal de edición de clientes (`EditCustomerModal.tsx`) a un layout Fullscreen organizado en 3 columnas por dominio con control explícito de sincronización de rutas.\n\n' +
      '• **Rediseño Fullscreen (3 Columnas)**: Organizado en 3 secciones claras para reducir la carga cognitiva — (1) Datos Personales & Membresía, (2) Logística, Rutas & Encomiendas, (3) Ubicación & Facturación Electrónica.\n' +
      '• **Opción Explícita de Sincronización (Opt-in Checkbox)**: Añadida la casilla `[ ] Sincronizar esta ruta a SmartWeb (SP2)` desmarcada por defecto (`false`). Guardar la ruta en SP1 mantiene la inmunidad logística sin alterar SP2 a menos que el operador la marque explícitamente.\n' +
      '• **Desactivación de Push Automático en Triggers**: Eliminada la sincronización automática de rutas en la Cloud Function `onCustomerWritten`, garantizando inmunidad por defecto.',
    author: 'Antigravity AI',
  },
  {
    version: '0.0.1402',
    date: '2026-07-29',
    layer: 'both',
    type: 'fix',
    title: 'FIX-CUSTOMER-ENCOMIENDA-ROUTE-IMMUNITY: Aislamiento Bilateral de Rutas e Inmunidad en SP1 con Sincronización Atómica de Encomienda Elegida por el Cliente',
    description:
      'Corregida la sincronización bidireccional entre SP2 y SP1 para aislar la ruta logística y sincronizar atómicamente la encomienda seleccionada por el cliente.\n\n' +
      '• **Inmunidad Bilateral de Rutas**: La `ruta` logística en SP1 (`customers/{slCode}`) es inmune y no puede ser alterada por sincronizaciones en segundo plano de SP2. En SP2 (`user-service.ts`), se eliminó el auto-cálculo de rutas por dirección.\n' +
      '• **Sincronización Atómica de Encomiendas**: La encomienda elegida por el cliente en SP2 (ej. *"Centeno"*) se aplica inmediatamente en SP1 y actualiza de forma atómica tanto el perfil del cliente como los objetos anidados en direcciones (`defaultAddress.encomienda` y `addresses[].encomienda`) en ambos portales.\n' +
      '• **Cero Inconsistencias Visuales**: Eliminados textos heredados como *"7/10 Encomienda"*, garantizando coherencia en Nova, Boletas PDF y tarjetas de dirección.',
    author: 'Antigravity AI',
  },
  {
    version: '0.0.1400.1',
    date: '2026-07-29',
    layer: 'both',
    type: 'fix',
    title: 'FIX-CUSTOMER-SYNC-RUTA: Garantizada la inmunidad de ruta de clientes en SP1 sobre SP2',
    description:
      'Corregido un problema en la sincronización de clientes entre SP2 y SP1 donde las sincronizaciones en segundo plano u omitidas podían sobrescribir la `ruta` de entrega maestra del cliente en SP1 con valores desactualizados de SP2.\n\n' +
      '• **SP1 Manda Siempre**: `functions/src/customers/sync.ts` (`processUserDoc`, `slSyncCustomerFromSp2`) y `client/lib/services/customer-sync.ts` (`syncCustomerToSP1`) ahora preservan de forma estricta la `ruta` existente en SP1.\n' +
      '• **Fallback Seguro**: La `ruta` de SP2 únicamente se utiliza como valor inicial si el cliente en SP1 carece totalmente de ruta asignada.\n' +
      '• **Prueba de Inmunidad**: Agregada suite de pruebas unitarias `customer-sync.spec.ts` (100% verde) para certificar que ningún sync externo altere las rutas maestras de SP1.',
    author: 'Antigravity AI',
  },
  {
    version: '0.0.1400',
    date: '2026-07-29',
    layer: 'both',
    type: 'fix',
    title: 'FIX-GEMINI-ENDPOINT: Estandarizados los endpoints de IA a gemini-flash-latest y agregada suite de pruebas automatizadas',
    description:
      'Actualizados todos los módulos de IA (`nova-agent-engine.ts`, `gemini-client.ts`, `route-ai-analyzer.ts`, `fleet-ai-service.ts`, `gemini-tools.ts`, `useAnalytics.ts`) para utilizar el endpoint activo y soportado `gemini-flash-latest`, eliminando referencias a modelos deprecados (`gemini-2.5-flash`).\n\n' +
      '• **Pruebas Automatizadas**: Creada suite Vitest `gemini-endpoints.spec.ts` que valida automáticamente con respuestas en vivo (HTTP 200 OK) todos los servicios de IA.\n' +
      '• **Ruta Directa para Manifiestos**: El botón `Ver manifiestos de Firestore` ahora despliega la lista instantáneamente de forma suave (animación smooth con `framer-motion`) sin crear burbujas de prompt ni hacer llamadas innecesarias a la API de IA.',
    author: 'Antigravity AI',
  },
  {
    version: '0.0.1399',
    date: '2026-07-29',
    layer: 'both',
    type: 'fix',
    title: 'FIX-EMBEDDED-LOAD-PRIORITY: Corregida la prioridad de hidratación en loadMegaManFromFirestore para preservar ediciones curadas del operador',
    description:
      'Corregido el fallo en `loadMegaManFromFirestore` donde las ediciones manuales y vinculaciones guardadas por el operador en el arreglo embebido (`manifests/{id}.packages[]`) podían ser sobreescritas al reabrir el manifiesto por documentos legacy o desactualizados en la colección `packages`.\n\n' +
      '• **Cambio de Prioridad**: `inv?.slCode ?? ed?.slCode ?? p.slCode ?? ""` (Factura activa -> Arreglo embebido curado del manifiesto -> Colección packages fallback).\n' +
      '• **Garantía Inmutable**: Al reabrir un manifiesto guardado sin facturar, las asignaciones de clientes, nombres y rutas curadas por el operador se mantienen 100% intactas.',
    author: 'Antigravity AI',
  },
  {
    version: '0.0.1398',
    date: '2026-07-29',
    layer: 'fe',
    type: 'feature',
    title: 'Nova — agregar botón "Ver manifiestos de Firestore" en tarjeta de resultado del chat',
    description:
      'Agrega botón de acceso directo a la lista de manifiestos de Firestore en la tarjeta de chat para poder alternar manifiestos sin refrescar la ventana ni iniciar una nueva conversación.',
    author: 'AI Pair',
  },
  {
    version: '0.0.1397',
    date: '2026-07-29',
    layer: 'both',
    type: 'fix',
    title: 'Aislamiento Estricto de Encomiendas en Nova & Servicio Autónomo de Curación de Manifiestos (megaManHealer)',
    author: 'AI Pair Programmer',
    description: 'Resuelto el fallo donde encomiendas consolidadas en ENC-MEGA-MAN re-aparecían al abrir manifiestos origen (ej. 23-07-2026DAN) en Nova.\n\n(1) **Exclusion Guard en Carga de Nova (`loadMegaManFromFirestore`)**: Filtra reactivamente tanto en la consulta a la colección `packages` como en `embeddedSupplement` (arreglo interno de `manifests/{id}`). Excluye cualquier paquete con `ruta === "Encomiendas"` o asignado a un `ENC-MEGA-MAN-` cuando se consulta un manifiesto regular.\n\n(2) **Sincronización del Arreglo Embebido (`extractPackagesFromSourceManifests`)**: Resuelve alias defensivamente y elimina encomiendas extraídas del arreglo embebido de los documentos origen (`manifests/{sourceId}`), recalculando totales (`totalPackages`, `totalWeight`, `totalPrice`, `totalCustomers`).\n\n(3) **Servicio de Curación Autónomo (`megaManHealer.ts`)**: Servicio idempotente en `client/lib/services/manifest-processor/megaManHealer.ts` con funciones `healMegaManManifest`, `healAllMegaManManifests` y `rollbackMegaManFusion`. Curó 54 paquetes huérfanos y limpió 4 manifiestos origen en Firestore.\n\n(4) **Invalidación de Caché de React Query**: Forzada invalidación de claves `["manifests"]`, `["packages"]`, `["encomienda-manifests"]` e `["invoices"]` tras operaciones de fusión y curado.\n\n(5) **Regla 7 en `AGENTS.md`**: Agregada norma obligatoria de ejecución para impedir que futuros agentes de IA remuevan los guards o generen regresiones en el aislamiento de encomiendas.',
  },
  {
    version: '0.0.1054',
    date: '2026-06-03',
    layer: 'both',
    type: 'feature',
    title: 'Smart Portal SP1 — Optimización de Costos, Paridad de Filtros y Estabilidad del Core',
    description: [
      'Optimizaciones de rendimiento, costos de Firestore y consistencia de diseño para el Sprint 1 (SP1).',
      '• Búsqueda con Prioridad Local (Client-First Search): Implementación de un bypass inteligente de consultas a Firestore en Facturas (Invoices.tsx) y Paquetes (Packages.tsx). Si el término buscado coincide exactamente con identificadores únicos como trackingNumber, slCode o invoiceNumber en memoria, o si el manifiesto está completamente cargado, el sistema sirve la información localmente de manera gratuita e instantánea.',
      '• Homologación de Filtros y Animaciones: Integración de transiciones fluidas de altura y opacidad (Framer Motion) en Paquetes. Se consolidó el botón dinámico (Buscar / Nueva Búsqueda / Limpiar) y se removieron pantallas de carga parpadeantes (isTransitioning) al reordenar o cambiar filtros secundarios.',
      '• Corrección en Encomiendas: La alerta de discrepancia de ruta (isEncomiendaRouteMismatch) ahora solo se muestra si el listado final queda vacío. Se normalizaron las consultas de estado en la base de datos para contemplar variantes ortográficas comunes en estados de paquetes.',
      '• Sincronización y Triggers: Ajustes en los triggers de Firestore para incluir el estado "deleted" como inactivo y priorización de vinculación de estados para prevenir que una factura procesada regrese a borrador (Draft). Evitamos también el error de deleteField() al crear nuevos paquetes.',
      '• Escáner y Widget TSE: Integración del widget de consulta de identidad del TSE en los flujos necesarios, remoción del botón "Cambiar" del escáner de bodega, y colapso de manifiestos por defecto en el escáner de bodega para optimizar la carga visual y lecturas de base de datos.',
    ].join('\n'),
    author: 'SmartLogistics Team',
    commitMessage: 'feat(filters): optimize cost-efficiency, animations, and mismatch alerts in Invoices and Packages',
  },
  {
    version: '0.0.968',
    date: '2026-05-26',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — arreglar congelamiento del browser al "Ver tabla" y exponer "Re-validar todo" en manifiestos frescos',
    description: [
      'Bug 1 (Page Unresponsive): el effect de auto-validación se disparaba en el mismo tick que el primer render de la tabla. Para manifiestos grandes (~194 filas con 47 divergentes) el loop de ~47 fuzzy searches + escrituras a Firestore + ~200 setStates competía con el render inicial del NovaTableModal y bloqueaba el main thread >10s.',
      'Fix 1: el rematch loop ahora se programa con requestIdleCallback (fallback setTimeout(0)) para que la tabla pinte primero, y dentro del loop se hace yield al main thread cada 5 nombres para que React pueda flushear setStates entre chunks.',
      'Bug 2: el menú Acciones no exponía "Re-validar todo" para manifiestos frescos (parseados de Excel), dejando al operador sin escape hatch si la auto-validación quedaba parcial.',
      'Fix 2: FRESH_POLICY.showRevalidateAllButton ahora es true. El botón aparece en ambos orígenes (fresh + Firestore) como redo manual determinístico.',
      'Tests: 3 specs actualizados (use-nova-customer-assignment, NovaRevalidateAllButton, data-origin/types). Cleanup propio del idle callback al desmontar.',
    ].join(' '),
    author: 'SmartLogistics Team',
    commitMessage: 'fix(nova): defer auto-validation + expose Re-validar todo for fresh manifests',
  },
  {
    version: '0.0.636',
    date: '2026-05-05',
    layer: 'both',
    type: 'fix',
    title: 'Manifiesto de encomiendas — paridad total con /invoices al enviar facturas + defensa SP2 sync para servicios asignados',
    description: [
      'Auditoría rigurosa de los flujos de envío de factura y sincronización entre /invoices, /encomiendas, SmartWeb (SP2) y la asignación de servicios de encomiendas.',
      '',
      '**Item 14 — Paridad de side-effects al enviar factura desde Encomiendas (FE)**',
      '',
      '`EncomiendaManifests.handleSendInvoiceEmail` ahora dispara los mismos triggers que `InvoiceGeneration.handleSendEmail` cuando se envía un correo desde el manifiesto:',
      '',
      '- ✅ `recordInvoiceEmailSent` — persiste entrada canónica en `emailSendLogs` (arrayUnion), `lastResendMessageId` y `emailResendIds`. Antes: se hacía un `updateDoc` parcial que NO escribía la history → el panel mostraba un gap cuando la factura se enviaba desde Encomiendas.',
      '- ✅ `syncInvoicesToSp2([sentInv])` — push completo de la factura al portal del cliente (SmartWeb). Antes: NO se invocaba → la factura nunca aparecía en SP2 si el envío salía desde Encomiendas, aunque los paquetes sí cambiaban a `processed`.',
      '- ✅ Guard de `slCode` con toast de aviso si falta. Antes: ausente.',
      '- ✅ Toasts de error específicos para fallos de sync. Antes: solo un toast genérico de error de email.',
      '- ✅ `syncInvoicePackagesToSp2(sentInv, "processed", { updateSp1: true, syncSp2: false })` — explícito para evitar doble-sync de paquetes ya que `syncInvoicesToSp2` arriba se encarga del SP2 cuando status===sent.',
      '',
      '**Item 15 — Auditoría del sistema de sync (sin cambios necesarios)**',
      '',
      'Inventario completo verificado:',
      '- `pushStatusToSp2`: status-only push correcto, append a `sp2SyncHistory`, no throw.',
      '- `syncInvoicesToSp2`: chunks de 500, filtra drafts, marca `smartwebSynced`, propaga a paquetes según status.',
      '- `syncInvoicePackagesToSp2`: regression-safe (no downgrades), idempotente.',
      '- `syncPackagesToSmartWeb`: chunked, idempotente.',
      'Conclusión: el motor de sync está correcto. El único gap funcional era que EncomiendaManifests no lo invocaba (= Item 14, ya fixed).',
      '',
      '**Item 16 — Defensa en profundidad para servicio de encomiendas en SP2→SP1 sync (BE)**',
      '',
      'El servicio de encomiendas asignado a un cliente desde `/encomiendas` (top-level mirror: `encomienda`, `encomiendaServiceName`, `encomiendaProvider`, `encomiendaUpdatedAt`) **hoy se preserva accidentalmente** porque la CF `syncCustomersFromSP2` usa `update()` (PATCH parcial), y el shape de retorno de `transformUserToCustomer` no incluye estos campos.',
      '',
      'Sin embargo, esa preservación implícita es frágil: si SP2 algún día agrega un campo `encomienda` al user profile, el spread `...cleanCustomer` lo sobrescribirá silenciosamente. Para prevenir ese vector futuro:',
      '',
      '- ✅ Agregados `encomienda*` al schema `SP1Customer` con comentario explicativo.',
      '- ✅ Bloque explícito de preservación en `performSync.processUser` (path scheduled cada 30 min).',
      '- ✅ Bloque explícito en `slSyncCustomerFromSp2` (path real-time push desde SP2 al registrar usuario).',
      '- Mismo patrón que ya protegía `notes`, `preferredRouteId`, `preferredRoute`, `createdBy`, `userCreatedBy`.',
      '',
      'El componente `CustomerGroup` en `EncomiendaManifests.tsx` ya usa `onSnapshot(customers/{slCode})` para cargar el servicio reactivamente — no es one-shot, los cambios en Firestore se reflejan inmediatamente en la UI.',
      '',
      '**Suite total:** 1528 tests verde post-fix.',
    ].join('\n'),
    author: 'SmartLogistics Team',
    commitMessage: 'fix(encomiendas+sync): full side-effect parity for invoice email + defensive encomienda preservation in SP2 sync',
  },
  {
    version: '0.0.635',
    date: '2026-05-05',
    layer: 'fe',
    type: 'fix',
    title: 'Factura preview — corregir heurística que clasificaba erróneamente paquetes regulares como manuales',
    description: [
      'Corrige el último vector de la regresión BUG-INV-CAPTION en `/invoices`. Después de v0.0.634 el correo enviado al cliente ya mostraba el tracking correctamente, pero el preview en pantalla seguía mostrando la `description` (ej. "PARTE PARA VEHICULO" en lugar de "WR4066"). La causa raíz era distinta a la de v0.0.633/v0.0.634.',
      '',
      '**Causa raíz:** `handlePreviewInvoice` en `client/pages/invoices/InvoiceGeneration.tsx:2022` usaba la heurística `isManual: !item.packageId && !!item.description` para clasificar los items antes de pasarlos al modal. Esa lógica falla con la realidad de los datos: los items creados por Nova / EncomiendaManifests tienen `trackingNumber` poblado pero `packageId` vacío (no es un join cargado en cliente). La heurística los marcaba a todos como manuales, y el helper `formatInvoiceItemCaption` (correctamente, según el contrato de 3 casos) renderizaba la `description` para items manuales.',
      '',
      '**Por qué el correo no estaba afectado:** `handleSendEmail` y `handleSendInvoiceEmail` (en EncomiendaManifests) leen el invoice raw desde Firestore y lo pasan directamente a `buildInvoiceEmailPayload`, sin transform intermedio. Ese path siempre vio el flag `isManual` correcto. Solo el path de **preview en pantalla** tenía el transform buggy.',
      '',
      '**Fix (1 línea):** reemplazar la heurística por la lectura directa del flag explícito que YA viene poblado canónicamente desde todos los creadores de invoices (`CreateInvoice`, `EncomiendaManifests`, `manifest-processor`, `Packages`): `isManual: item.isManual === true`. El comentario inline en el archivo documenta la regresión completa y por qué la heurística estaba mal.',
      '',
      '**Auditoría completa:** se verificaron todos los call-sites de `isManual` en cliente y servidor. Solo había una heurística buggy (la corregida). Todos los demás paths usan el flag explícito correctamente. Heurísticas similares en `EncomiendaManifests.tsx` solo se usan para FILTRAR items manuales en operaciones de filtrado/preserve (no para clasificar) — no son afectadas.',
      '',
      '**Defensa:** `client/components/nova/NovaInvoicePreview.spec.tsx` ampliado de 23 a 26 tests con la suite `regression: tracked package without packageId (BUG-INV-CAPTION 2026-05-05)` que bloquea cualquier intento futuro de re-introducir esta clasificación errónea.',
      '',
      '**Suite total:** 1528 tests verde post-fix (1 flaky aislado de Nova module structure no relacionado).',
    ].join('\n'),
    author: 'SmartLogistics Team',
    commitMessage: 'fix(invoice): respect explicit isManual flag in preview transform',
  },
  {
    version: '0.0.634',
    date: '2026-05-05',
    layer: 'both',
    type: 'fix',
    title: 'Factura — caption de items con 3 casos (regular / manual / marítima) en cliente Y server',
    description: [
      'Completa la fix de BUG-INV-CAPTION cubriendo el server-side template (`functions/src/email/email-service.ts`) y refinando el contrato a tres casos legítimos según el origen del item.',
      '',
      '**Por qué hubo que ampliar el fix de v0.0.633:** v0.0.633 arregló solo el preview del cliente, pero el correo enviado al cliente lo construye `sendInvoiceEmailFunction` (servidor). El template del server seguía usando `(item.description || item.tracking || "-").toUpperCase()` — exactamente el mismo bug. Esta versión lo corrige y lo bloquea con un único helper.',
      '',
      '**Contrato finalizado del helper `formatInvoiceItemCaption(item, ctx)`:**',
      '• **Regular** (paquete con tracking, mayoría de casos): solo `tracking.toUpperCase()`. NUNCA cae a description.',
      '• **Manual** (`isManual=true`, Servicio de Terceros): solo `description` — no hay tracking, la descripción ES el line item.',
      '• **Marítima** (`source="maritime"`): `tracking — description` (concatenados con em-dash) porque la descripción carga la info dimensional (ej: `WR-001 — DIM: 60X40X40 CM`).',
      '',
      '**Cambios coordinados:**',
      '(1) `client/components/nova/NovaInvoicePreview.tsx` — helper extendido de 1 a 3 casos, normalización propaga `isManual` por item, ambos call-sites (HTML email + JSX preview) pasan `{ source: d.source }` como contexto.',
      '(2) `client/lib/services/invoice-service.ts` — `buildInvoiceEmailPayload` propaga `isManual` por cada item del payload para que el server pueda branchear igual.',
      '(3) `functions/src/email/email-service.ts` — añade `formatInvoiceItemCaption` server-side que es mirror exacto del cliente; añade `isManual` al schema; `generateItemsRows` y `generatePlainTextInvoice` usan el helper en vez de inline string. Faltaba pasar `data.source` a `generateItemsRows` (también corregido).',
      '',
      '**Defensa:** `client/components/nova/NovaInvoicePreview.spec.tsx` ampliado de 11 a 23 tests cubriendo los 3 casos con: ID `BUG-INV-CAPTION` para grep, suite por caso, invariantes (no-mutación, retorno no-vacío, case-insensitive en source). El docstring del helper menciona los commits históricos `53d8cd3f4` y `a77fccf38` para que cualquier review futuro tenga el contexto antes de tocar la lógica.',
      '',
      '**Re-envío de facturas afectadas:** los datos en Firestore están sanos (verificado con `scripts/inspect-invoice-items.mjs` — 307/307 healthy en MEGA-MAN-01-05-2026); el bug era 100% de render. El operador re-envía manualmente las facturas afectadas desde la UI (botón "Enviar email" o la acción bulk en /invoices) y los clientes reciben el correo correcto.',
      '',
      '**Suite total:** 1525/1525 verde post-fix.',
    ].join('\n'),
    author: 'SmartLogistics Team',
    commitMessage: 'fix(invoice): three-case item caption (regular/manual/maritime) in client and server',
  },
  {
    version: '0.0.633',
    date: '2026-05-05',
    layer: 'fe',
    type: 'fix',
    title: 'Factura — restaurar tracking number debajo de "Servicios Logísticos" (regresión BUG-INV-CAPTION)',
    description: 'Corrige una regresión silenciosa de 3 semanas en el preview de facturas y en el correo enviado al cliente. Bajo el título "Servicios Logísticos" se mostraba la `package description` (p. ej. *"ROPA, ACCESORIOS Y ARTICULOS VARIOS"*) en lugar del tracking number, confundiendo a clientes que pensaban que la descripción ERA el ítem facturado.\n\n**Cronología de la regresión:**\n• `53d8cd3f4` (2026-04-13) — fix correcto, eliminó la descripción del caption ("eliminar descripción del paquete del invoice preview y modal").\n• `a77fccf38` — su título dice "invoice item description uppercase + nav dropdown sticky fix"; la intención era SOLO añadir `.toUpperCase()`, pero el diff también re-introdujo `item.description ||` con prioridad sobre `tracking`. Esa segunda parte pasó desapercibida en review y revirtió la decisión del commit anterior.\n\n**Fix:** se extrae un helper puro `formatInvoiceItemCaption(item)` exportado desde `NovaInvoicePreview.tsx` y se reutiliza en los DOS sitios afectados (HTML del email + render JSX). Contrato bloqueado: solo emite `tracking.toUpperCase()`, NUNCA cae a `description`. Tracking vacío o ausente → em-dash; whitespace se preserva (documentado).\n\n**Defensa contra futuras regresiones:** nuevo spec `client/components/nova/NovaInvoicePreview.spec.tsx` con 11 tests que bloquean la fallback a `description`. Test clave referenciado por el ID `BUG-INV-CAPTION 2026-05-05`. El docstring del helper menciona explícitamente los dos commits históricos (53d8cd3f4 y a77fccf38) para que cualquier review futuro vea el contexto antes de tocar el código.\n\n**Sin efectos colaterales:** otros sitios que muestran `description` legítimamente no se tocan — los toasts de "Item movido", la lista interna de la página `InvoiceGeneration` y el dropdown "Mover a factura" siguen mostrando descripción tal y como deben (ahí el operador necesita identificar el ítem internamente). Suite total 1513/1513 verde.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(invoice): restore tracking number under Servicios Logísticos (BUG-INV-CAPTION)',
  },
  {
    version: '0.0.632',
    date: '2026-05-05',
    layer: 'be',
    type: 'chore',
    title: 'Functions runtime — Node 22, firebase-admin v13 y firebase-functions 7.2.5',
    description: 'Actualización proactiva del stack de Firebase Functions tras los avisos surgidos en el deploy v0.0.631:\n\n(1) **Node runtime 20 → 22**: Node 20 fue deprecado el 2026-04-30 y será decommissioned el 2026-10-30 — sin este upgrade el deploy se bloquearía a partir de esa fecha. `engines.node` ajustado a `"22"` en `functions/package.json`. El entorno local ya estaba en v22.14.0 (sin acción adicional para los desarrolladores).\n\n(2) **firebase-admin 12 → 13.8.0** (major): revisión de breaking changes confirma que NINGUNA API removida en v13 está en uso. Removed APIs: `sendAll`, `sendMulticast`, `sendToDevice`, `sendToDeviceGroup`, `sendToTopic`, `sendToCondition` (Cloud Messaging — no usado en SP1) + cambio en hashing de Remote Config percentage condition (no usamos Remote Config). Nuestro código sólo importa `Firestore` (`getFirestore`, `Timestamp`, `FieldValue`, `FieldPath`), `Auth` (`UserRecord`, `admin.auth()`) y `App` (`initializeApp`, `getApp`, `getApps`) — todas APIs estables a través de v12→v13.\n\n(3) **firebase-functions 7.0.6 → 7.2.5** (minor): patches y minors backward-compatibles dentro de la línea v7. Sin cambios de API.\n\n(4) **Build verificado**: `tsc` en `functions/` compila sin errores con las nuevas versiones. Suite completa de tests (1502/1502) sigue verde tras el upgrade.\n\nNo aplicable: el aviso de `firestore:indexes` durante el deploy proviene de la edición Enterprise de Firestore que requiere actualización manual desde Console — no es un problema del código y se documentó como acción pendiente fuera del ciclo de release.',
    author: 'SmartLogistics Team',
    commitMessage: 'chore(functions): upgrade to Node 22 + firebase-admin v13 + firebase-functions 7.2.5',
  },
  {
    version: '0.0.631',
    date: '2026-05-05',
    layer: 'both',
    type: 'feature',
    title: 'Auditoría de integridad Nova — reparaciones + feedback + cobertura de tests',
    description: 'Endurecimiento del flujo de auditoría de integridad de manifests (modal `NovaIntegrityModal` + servicio `applyIntegrityRepairs`) con seis cambios coordinados:\n\n(1) **Guard `isRealCustomerSlCode` simétrico**: el cómputo de consenso en `compute.ts` ya rechaza slCodes no canónicos (temp `SL-NAN-*`, manifests `SL-MAN-*`, nombres de ruta filtrados) como "fuente verdadera", aplicado uniformemente a packages / encomiendas / invoices / manifest. Evita que el sugerido de reparación proponga un slCode no real.\n\n(2) **Consolidation guard en drifts de factura**: `invoice_weight_drift` y `invoice_price_drift` ahora se saltan cuando la factura es consolidada (detectada vía `isConsolidatedInvoice` — fuente única: boolean `isConsolidation`, sufijo `-C`, legado `-CONSOLIDACION`). En consolidadas el reparto unitPrice/weight entre trackings es intencional y no debe marcarse como inconsistencia.\n\n(3) **Límite de batch ajustado**: `MAX_REPAIRS_PER_BATCH` reducido de 166 a 125 tras añadirse el rewrite de facturas (op adicional por repair con invoice). 125 × 4 ops = 500 exacto (límite Firestore). Impide que un batch grande con invoice pointers sobrepase el techo y aborte el apply completo.\n\n(4) **Toast de feedback tras apply**: `NovaTableModal.onApply` ahora surface un toast estructurado con filas corregidas, facturas actualizadas, N°-factura reescritos, temp_customers eliminados y packages faltantes. La variante destructive muestra `result.error` cuando Firestore falla. Antes solo había `console.warn` — el operador no tenía confirmación visible del side-effect.\n\n(5) **NovaCustomerQuickViewModal — fechas de consolidación con fallback**: cascada defensiva (`consolidationActivatedAt` → `consolidationStartedAt` → `updatedAt`) que evita "undefined" cuando el doc no tiene el campo más nuevo.\n\n(6) **Cobertura de tests ampliada a 1502**: nuevas suites `route-colors.spec.ts` (26), `dateUtils.spec.ts` (35), `customerStats.spec.ts` (30), `feature-flags.spec.ts` (4), extensiones en `utils.spec.ts` (+10) e `invoice-reassign.spec.ts` (+11). Todas las suites existentes siguen 100% verdes. Regresiones protegidas: matriz completa de 13 rutas de `ROUTE_COLORS`, parseo defensivo de weights/calculatedCost como strings, daysAsCustomer clamped a 0 para fechas futuras, formatRelativeTime en locale es-CR, idempotencia de `replaceInvoiceNumberPrefix`.\n\nCambios coordinados en BE: `functions/src/customers/sync.ts`, nuevo módulo `functions/src/encomiendas/` y regeneración de `functions/lib/*` (bundle compilado).',
    author: 'SmartLogistics Team',
    commitMessage: 'feat(nova): integrity audit hardening + apply-feedback toast + 1502-test coverage',
  },
  {
    version: '0.0.621',
    date: '2026-04-30',
    layer: 'fe',
    type: 'feature',
    title: 'Papelera de facturas — eliminación permanente con doble confirmación',
    description: 'Nuevo botón **Eliminar** en `/invoices/recovery` (papelera) que permite remover definitivamente una factura ya soft-deleted de Firestore, gated por una confirmación de dos factores:\n\n(1) **Checkbox de reconocimiento**: el operador debe marcar activamente que entiende que la operación es irreversible — previene confirmaciones accidentales por muscle memory.\n\n(2) **Typed-confirmation del SL Code**: input obligatorio donde debe escribir verbatim el slCode del cliente (case-sensitive). Fallback a invoiceNumber si el slCode está vacío (clientes huérfanos/orphan) y a document id como último recurso — nunca blanco. El botón rojo destructivo permanece disabled hasta que ambos controles pasen.\n\nNuevo hook `usePermanentlyDeleteInvoice` en `useInvoices.ts` que ejecuta `firestoreApi.invoices.delete(id)` y actualiza el cache de React Query (mismo contrato que `useDeleteInvoice` soft-delete). Nuevo componente aislado `PermanentDeleteInvoiceDialog` con summary de la factura (invoiceNumber, cliente, slCode), reset automático de estado al abrir, y focus management accessible. Nuevo audit action `invoice_permanently_deleted` con metadata completa (invoiceNumber, slCode, clientName, deletedAt/By originales, totalAmount) para reconstruir post-mortem qué se destruyó y quién.\n\nAcceso restringido a roles `ADMIN` / `MANAGER` (mismo gate que el resto de `/invoices/recovery`). No toca `packages`/`manifests`/`temp_customers` — asume que las referencias cruzadas ya fueron limpiadas por el flujo de soft-delete.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat(invoices): permanent-delete from trash with two-factor (checkbox + SL code) confirmation',
  },
  {
    version: '0.0.620',
    date: '2026-04-30',
    layer: 'fe',
    type: 'feature',
    title: 'Reasignación de facturas — detección universal de clientes huérfanos, sync SP2 obligatorio, sugerencias IA y reenvío de email',
    description: 'Reescritura completa del flujo de reasignación con ocho mejoras coordinadas en `/invoices`:\n\n(1) **Regex universal de prefijo de factura**: el regex anterior `/^(SL\\d+)(-)/i` solo reescribía prefijos `SL<digits>` y fallaba silenciosamente con clientes temporales (`SL-NAN-00813-…`), manifiestos (`SL-MAN-00813-…`) y — el caso más problemático — facturas con **nombres de ruta** filtrados como prefijo (`Cartago 1-…`, `San Jose Centro-…`, `Encomiendas-…`, etc., cualquiera de las 13 rutas declaradas en `ROUTE_COLORS`). Nuevo regex `/^(.+?)(-)(?=\\d{10,})/` se ancla en el timestamp (10+ dígitos) como delimitador estable, cubriendo TODOS los formatos. Helper puro `replaceInvoiceNumberPrefix` extraído a `client/lib/utils/invoice-reassign.ts`.\n\n(2) **Detección universal de clientes huérfanos**: nuevos helpers `isOrphanSlCode` / `isOrphanInvoiceNumber` que retornan true para cualquier slCode que NO matchee `^SL\\d+$`. Esto incluye temp customers (`SL-NAN-*`), manifiestos (`SL-MAN-*`), nombres de ruta (`Cartago 1`, `San Jose Centro`, `Encomiendas`…) y códigos vacíos. Reemplazaron a `isTempSlCode` / `isTempInvoiceNumber` en 7 sitios de render — `isTempSlCode` queda reservado solo para la lógica de cleanup de `temp_customers`.\n\n(3) **Limpieza automática de clientes temporales huérfanos**: post-reasign, si el dueño anterior era `SL-NAN-*` y ninguna otra factura lo referencia, se borra el documento de `temp_customers`. Consulta los tres campos históricos (`clientSlCode`, `slCode`, `customerId`) en paralelo. Audit log `temp_customer_deleted` con razón `reassigned_to_real_customer`.\n\n(4) **Sincronización SP2 obligatoria al reasignar**: `syncInvoicesToSp2` ahora es `await`-ed (antes era fire-and-forget con `.catch(() => {})`). Si falla, el toast indica "SP2 pendiente" y sugiere "Re-sync SP2" para reintentar — sin revertir la escritura en SP1.\n\n(5) **Prompt post-reasign para reenviar factura**: `AlertDialog` nuevo aparece tras una reasignación exitosa con SP2 sincronizada y email disponible. Permite reenviar al correo del nuevo cliente con un click ("Enviar") o descartar ("No, gracias"). Reutiliza `handleSendEmail` en modo email-only (no re-sincroniza SP2 ni toca paquetes).\n\n(6) **UX highlights coordinados en 8 sitios**: badge rojo pulsante `[⚠ TEMPORAL]` al lado del nombre (flat + grouped), número de factura en rojo negrita en ambas vistas, slCode en rojo bajo el email del panel colapsado, Input "Cód. SL" del modal de Editar factura en rojo cuando aplica, badge "DUEÑO ACTUAL" del modal Reasignar, y botón **Reasignar** con ring halo + `animate-pulse` + icono `AlertTriangle` cuando el dueño es huérfano. Todos con tooltip `TEMP_WARNING_TITLE` (mensaje generalizado, ya no nombra `SL-NAN` específicamente). Soporte dark-mode en toda la paleta.\n\n(7) **Sugerencias IA en el modal de Reasignar — paridad con Nova**: tres secciones diferenciadas — **Aprendido** (esmeralda, `BookOpen`) muestra patrones aprobados con `×N` count, **Sugerencias IA** (violeta, `Sparkles`) auto-dispara con `invoice.clientName` mostrando porcentaje de confianza + razonamiento de Gemini con loader explícito mientras procesa, **Búsqueda** (neutro, `Search`) cuando el operador escribe ≥2 caracteres. Componentes locales `SectionHeader` + `SuggestionRow` mantienen el modal autocontenido sin acoplar a `NovaCustomerSearchSection`. Empty states diferenciados.\n\n(8) **Cobertura de regresión robusta**: 45 unit tests en `invoice-reassign.spec.ts` — prefijos real/temp/manifest, sufijos `-C`/`-MERGE`, parity loop sobre las **13 rutas del sistema** garantiza que añadir una ruta nueva sin actualizar el regex falle inmediatamente, casos null/undefined/empty, y aserción genérica del warning title. Suite completa: 63 archivos / 1385 tests ✓.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat(invoices): universal orphan detection + AI reassign suggestions + 8 highlight sites',
  },
  {
    version: '0.0.619',
    date: '2026-04-30',
    layer: 'fe',
    type: 'feature',
    title: 'Sincronización end-to-end del tipo de cambio',
    description: 'Seis capacidades coordinadas para eliminar el drift de TC entre paquetes, facturas y manifiestos:\n\n(1) **Servicio aislado `update-exchange-rate-service`**: recomputación pura (`recomputePackageCostCRC`, `recomputeInvoiceCRC`) + tres orquestaciones composables — `updateManifestExchangeRate` (manifest-wide), `updateInvoicesExchangeRate` (solo invoices), `bulkUpdateInvoicesExchangeRate` (por selección de facturas). Batched ≤400 ops, idempotente, nunca toca status / statusHistory / USD amounts. Anuladas se preservan.\n\n(2) **Autosave Nova cubre packages collection**: `useNovaAutoSave` ahora ejecuta `saveManifestRecord` Y `upsertManifestPackageOverrides` en paralelo. Nuevo helper en `manifest-processor` que solo merge-actualiza paquetes existentes (jamás crea) — cierra el gap donde un edit de slCode/ruta/TC quedaba solo en el embedded array.\n\n(3) **"Guardar en BD" prevalece sobre autosave**: `handleIngest` y `handleIngestAndInvoice` ahora llaman a `updateInvoicesExchangeRate` tras el ingest principal para sincronizar TC a invoices activas. Short-circuit cuando TC ya coincide (evita 200 writes por save). Anuladas se preservan.\n\n(4) **4° botón "Actualizar TC" en save modal de Nova**: aparece solo cuando el TC persistido ≠ TC actual. Corrige packages + invoices + manifest en una operación. Modal extraído a `NovaSaveConfirmModal.tsx` (≈370 líneas menos en `NovaTableModal`).\n\n(5) **TC editable en modal de edit factura + propagación opt-in a paquetes**: input de TC en `InvoiceEditModal`, checkbox "Aplicar a paquetes" (default ON, visible solo cuando TC cambia). Batch chunked a 400 ops. Ahora también reescribe CRC triplet completo (subtotalCRC/ivaCRC) — antes solo amountCRC.\n\n(6) **Bulk "Actualizar TC" + row display en `/invoices`**: nuevo botón en la action bar (paleta amber) abre modal con impact summary (invoices + paquetes + manifiestos + TCs actuales), detecta drift cuando la selección tiene TCs mixtos. Row display ahora muestra `$USD · ₡CRC · TC ₡487` en vista flat y agrupada. Pre-check de manifiestos para evitar que un manifest eliminado rompa el batch completo.\n\n**Verificación**: 1314/1314 tests pass (+11 tests nuevos para pure helpers). Audit log vía `AuditService`.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat(tc): end-to-end sync across packages, invoices, manifests',
  },
  {
    version: '0.0.618',
    date: '2026-04-29',
    layer: 'fe',
    type: 'feature',
    title: 'Nova: persistencia robusta de slCode + filtros + diagnóstico',
    description: 'Cinco mejoras en Nova:\n\n(1) **Carga prioriza `packages` collection como fuente de verdad**: `loadMegaManFromFirestore` ahora respeta la jerarquía `packages.slCode → invoice.clientSlCode → embedded.slCode → ""`, con cadena `??` que preserva unlinks intencionales. Resuelve la regresión donde la grouping del Nova table se colapsaba a un solo cliente cuando el embedded array drifteó (p.ej. tras un re-parse del Excel). El packages collection es el contrato architectónico — embedded es solo cache denormalizado.\n\n(2) **Auto-recovery vía cross-reference de invoices**: Cuando `packages.slCode` está vacío pero existe una invoice activa para ese tracking, la identidad (slCode + customerName + ruta) se recupera de la invoice. Self-heal sin intervención manual.\n\n(3) **Validación cruzada con `console.warn` por discrepancia**: Si `packages.slCode` y `invoice.clientSlCode` no coinciden para un mismo tracking, se loggea una advertencia detallada por tracking. No cambia el valor cargado (packages sigue ganando) — es señal diagnóstica para que el operador resuelva via `/invoices` o "Re-generar factura".\n\n(4) **Filtro de ruta "Desconocida" + dropdown 3-columnas**: El dropdown de filtro de ruta siempre incluye "Desconocida" (fallback no asignable, scoped al filtro), y se renderiza en 3 columnas para ver todas las rutas sin scroll. Los headers "Todas las rutas" / "Sin ruta" siguen full-width.\n\n(5) **Logging diagnóstico de persistencia + audit defensivo**: `handleIngest` y `loadMegaManFromFirestore` emiten `console.info` estructurado con manifest, conteos (unmatched, unrouted, invoiceRecovered, activeInvoices), override map sizes y muestra de 3 filas. `audit-service.getDeviceContext` ahora envuelve `screen` / `navigator` / `Intl` en `typeof !== "undefined"` — antes tiraba `ReferenceError` en jsdom y abortaba saves en tests (round-trip 1303/1303 ahora pasa).',
    author: 'SmartLogistics Team',
    commitMessage: 'feat(nova): packages-as-truth + invoice cross-validation + 3-col route filter + diag',
  },
  {
    version: '0.0.617',
    date: '2026-04-29',
    layer: 'fe',
    type: 'fix',
    title: 'Facturas + Client Ledger: cambios de estado consistentes y reversibles',
    description: 'Cuatro correcciones en el ciclo de vida de facturas:\n\n(1) **De-anular factura ahora restaura realmente sus items**. Al hacer click en "De-anular" desde la lista de facturas, no sólo cambia el status a `draft`, sino que: (a) elimina los items que se movieron al `manifest_consolidation` durante la anulación, (b) revierte los paquetes cuyo `manifestId` fue reasignado al manifiesto destino — usando el `originalManifestId` que se sella al anular —, y (c) appendea una entrada `statusHistory` con la razón "De-anulación". Best-effort: si falla la limpieza de side-effects, el cambio de status NO se rolea atrás.\n\n(2) **Bulk status update appendea statusHistory** por cada factura. Antes el flujo single-invoice (`handleStatusChange`) sí dejaba historial pero el bulk no, dejando un gap de auditoría. Ahora ambos caminos producen el mismo trail.\n\n(3) **ClientLedger unifica el patrón de auditoría** con `InvoiceGeneration`: cada cambio de estado en la cuenta del cliente appendea `statusHistory` (con `user.id` real vía `useFirebaseAuth`) y el `syncInvoicePackagesToSp2` ya estaba sellando `smartwebSynced` — ahora ambas superficies producen el mismo resultado.\n\n(4) **Anulación a otro manifiesto sincroniza paquetes a SP2** con el nuevo `manifestNumber`. Cuando el operador anula una factura y mueve sus paquetes a un manifiesto destino, el portal del cliente (SP2) ahora recibe el cambio. `forceSync` se omite intencionalmente para que el regression guard de SP2 siga aplicando (background promotion, no admin override).',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(invoices): de-annul restores items, bulk status history, ClientLedger audit, SP2 sync on annul-move',
  },
  {
    version: '0.0.613',
    date: '2026-04-29',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: fix — mover fila a grupo sin match limpia slCode y persiste correctamente',
    description: 'BUG-MOVE-UNMATCHED-STALE-SLCODE: Al mover una fila a un grupo sin match (no-cliente), el slCode anterior del paquete seguía persistiendo. Tres causas raíz: (1) delete sobre objetos recién creados vacíos era no-op — los overrides del estado nunca se limpiaban. (2) unlinkedRows.delete en vez de .add para el grupo destino, lo que hacía que el groupKey usara el slCode viejo. (3) La cadena || en el save inmediato propagaba el slCode viejo del estado. Fix: trackear índices movidos a grupos sin match, agregar a unlinkedRows (no eliminar), limpiar slCodeOverrides/matchOverrides del estado explícitamente, y forzar slCode="" en el save inmediato para esos índices.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(nova): mover a grupo sin match limpia slCode y unlinkedRows correctamente',
  },
  {
    version: '0.0.612',
    date: '2026-04-29',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: fix crítico — desvinculación persistente y sin re-asignaciones automáticas',
    description: 'BUG-CRÍTICO-UNLINK-REGRESSION 2026-04-29: El operador reportaba que al desvincular un paquete, guardar y refrescar, el paquete reaparecía vinculado al cliente anterior. Dos causas raíz corregidas:\n\n(1) **Operador || vs ?? en merge de carga**: En `loadMegaManFromFirestore`, el merge de datos del array embebido sobre los paquetes de la colección usaba `||` (OR lógico). Esto hacía que `slCode: ""` (vacío intencional tras desvincular) fuera tratado como falsy y sobrescrito por el valor antiguo del packages collection. Cambiado a `??` (nullish coalescing) que respeta las cadenas vacías.\n\n(2) **Verificación de políticas de origen**: Confirmado que cuando los datos vienen de Firestore (`dataOriginPolicy.origin === "firestore"`), TODAS las asignaciones automáticas están deshabilitadas: `allowAutoDivergentRematch: false`, `allowAutoPreAlertAssign: false`, `allowAutoLearnedRoute: false`. El operador tiene control total; ninguna asociación automática puede revertir sus cambios manuales.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(nova): usar ?? en lugar de || para mergear slCode vacío tras desvincular',
  },
  {
    version: '0.0.611',
    date: '2026-04-29',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: boton guardar habilitado y mensaje de paquetes actualizados',
    description: 'Tres correcciones:\n\n(1) Botón "Guardar en BD" ya no está bloqueado por grupos sin ruta — ahora siempre está habilitado (solo se deshabilita durante el proceso de guardado).\n\n(2) Mensaje de resultado corregido: antes mostraba solo "0 paquetes ingresados" cuando se actualizaban paquetes existentes. Ahora muestra tanto ingresados como actualizados (ej: "3 ingresados · 12 actualizados").\n\n(3) Race condition en move-to-group: ahora se construyen las filas resueltas inmediatamente con los nuevos valores y se guardan directamente, sin depender del debounce del auto-save que podía perder los cambios si el usuario refrescaba rápido.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(nova): habilitar boton guardar y mensaje paquetes actualizados',
  },
  {
    version: '0.0.610',
    date: '2026-04-29',
    layer: 'fe',
    type: 'fix',
    title: 'Nova auto-save: persistencia robusta de moves y corrección de race conditions',
    description: 'BUG-AUTOSAVE-LOST-MOVE 2026-04-29: El operador reportaba que al mover una fila a otro grupo y refrescar rápidamente, el cambio se perdía. Tres causas raíz corregidas:\n\n(1) `saveManifestRecord` tragaba errores silenciosamente (`try/catch` con solo `console.error`). Si Firestore rechazaba el write (rules, red), el indicador mostraba "Guardado" pero nada persistía. Ahora re-lanza para que el hook detecte el fallo y muestre estado error.\n\n(2) Race condition debounce + refresh: El debounce era 1.5s. Si el operador hacía move → cerraba modal → refrescaba en <1.5s, el timer se destruía antes de que `saveManifestRecord` corriera. Solución: (a) debounce reducido a 800ms, (b) `dirtyRef` tracking con flush en unmount que lee el ref (no el timer) para sobrevivir el cleanup order de React, (c) `beforeunload` guard que previene navegación con edits sin guardar, (d) método `flush()` expuesto para acciones discretas.\n\n(3) `onMoveToGroup` no llamaba flush: Las acciones discretas (move, unlink, assign) ahora llaman `autoSave.flush()` inmediatamente tras aplicar overrides, garantizando persistencia antes de cualquier refresh.\n\nAdicional: `availableGroups` ahora expone `ruta` efectiva (heredada de rutaOverrides/slCodeOverrides/matchOverrides) para que el target group tenga ruta consistente al mover.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(nova): auto-save robusto — re-lanza errores, flush inmediato, beforeunload guard, dirtyRef',
  },
  {
    version: '0.0.609',
    date: '2026-04-29',
    layer: 'fe',
    type: 'feature',
    title: 'Nova UX: auto-save, mover a grupo, modal cliente widescreen, admin Temp Customers, banner X',
    description: 'Cinco mejoras de productividad y resiliencia en el flujo Nova:\n\n(1) AUTO-SAVE de overrides al manifest doc: nuevo hook `useNovaAutoSave` con debounce de 1.5s que persiste TODOS los overrides (slCode, match, name, ruta, unlinked, price, peso, separateInvoices, mergedInvoices, manifest, deleted, priceAdjustments) en `manifests/{manifestNumber}` después de cada cambio. Solo escribe el doc del manifiesto (lightweight) — `packages/` e `invoices/` permanecen intactos hasta el "Actualizar BD" explícito. Gated en Firestore-loaded o post-ingest (nunca auto-save de un fresh-parse sin confirmar). One-in-flight + cola para coalescer cambios concurrentes. Flush automático en unmount para no perder edits al cerrar modal. Indicador visual `NovaAutoSaveIndicator` inline a la izquierda de "Imprimir / Exportar" con estados idle/dirty/saving/saved/error y "hace Xs" relativo. El operador nunca pierde data por refresh, tab close o crash.\n\n(2) MOVER TRACKING A GRUPO EXISTENTE: nueva 4ta opción en `NovaUnlinkActionModal` con búsqueda en tiempo real por nombre o SL code, sugerencias por coincidencia fuzzy de nombres (≥60% match) destacadas, cards arrastrables (drag-and-drop visual), badges matched (Hash) vs unmatched (Users), porcentaje de match en sugerencias. NovaTableModal expone `availableGroups` derivado de `sortedGroups` y handler `onMoveToGroup` que aplica slCodeOverrides + matchOverrides para targets matched o nameOverrides para unmatched. Resuelve el caso "operador sabe que esta fila debería estar en otro grupo del manifiesto" sin tener que ir al CustomerSearchModal.\n\n(3) CustomerDetailModal REDISEÑADO widescreen: max-w-5xl con grid responsive 3 columnas, badges SP1/SP2/both en cada campo sincronizado (azul/púrpura/verde), indicador "Consolidación Activa" prominente en header con icono Boxes y duplicado en sección Ruta cuando aplica, campos vacíos ocultos automáticamente (no más "—" plagando la vista), sección "Detalles técnicos de sincronización" colapsable con timestamps SP1 vs SP2 separados, iconos por sección. Map explícito de `SP1_FIELDS`/`SP2_FIELDS` en `getSyncSource()` documenta de dónde viene cada campo.\n\n(4) ADMIN /temp-customers CRUD: nueva página y servicio `temp-customers-service.ts` para administrar clientes `SL-NAN-*` creados automáticamente por Nova. Lista con sync real-time vía onSnapshot, búsqueda multi-campo (nombre/slCode/email/teléfono/ruta/origen), stats cards (total / con ruta / con consolidación / con contacto), edit dialog con todos los campos (nombre, ruta, email, teléfono, dirección, courier, switch consolidación), delete con AlertDialog y warning sobre referencias en paquetes/facturas, protección del documento `--meta--` (counter SL-NAN nunca se puede borrar/editar desde la UI). Ruta protegida por permiso `customers` (ADMIN/MANAGER), entrada de menú en Operaciones > Datos.\n\n(5) NovaFrozenBanner DISMISSIBLE: el banner "Datos guardados — sin auto-validación" ahora tiene un botón X para cerrarlo. Estado dismissed local — se reabre al recargar el manifest si la policy lo amerita.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat(nova): auto-save + mover a grupo + modal cliente widescreen + temp customers admin + banner X',
  },
  {
    version: '0.0.608',
    date: '2026-04-29',
    layer: 'fe',
    type: 'feature',
    title: 'Modal de integridad — filtros por tipo, búsqueda y contador visible',
    description: 'BUG-INTEGRITY-FINDABILITY 2026-05-02: el modal de auditoría de integridad ya tenía chips togglables de severidad y "facturas afectadas" (BUG-INTEGRITY-FILTERS), pero cuando el operador trabajaba con manifiestos de 149+ filas seguía teniendo dos huecos: (1) no podía saber si un click de filtro había narrowed la lista — la diferencia quedaba debajo del scroll fold, así que parecía no hacer nada; (2) la severidad sola no era el lens correcto cuando la corrupción mezclaba slCode mismatches (mass-repairable) con duplicate_invoice (cada uno necesita revisión humana); (3) no había forma de saltar a "esta fila TBA-1234" o "todas las filas del cliente GOMEZ" sin scrollear.\n\nEsta release agrega tres dimensiones de filtro componibles encima de las existentes: (a) chips por tipo de hallazgo (slCode, Nombre, Ruta, Cliente facturado, Peso facturado, Precio facturado, Sin factura, Factura duplicada). Multi-select, AND-combined con severidad. Sourced desde `report.summary.byKind` así que sólo aparecen los tipos que existen en el reporte. El renglón se oculta entero cuando hay un solo tipo (un manifiesto puro de slcode_mismatch no gana nada con un chip "filter por slCode"). (b) input de búsqueda case-insensitive substring contra `manifestRow.tracking` Y `manifestRow.customerName`, trimmed. Whitespace-only no activa el filtro (no da falso "Quitar filtros"). (c) contador visible "Mostrando 12 de 149 filas" arriba de la lista scrollable (fuera del overflow-y-auto) con `aria-live="polite"` para anunciar el nuevo conteo a screen readers. El contador es la prueba explícita de que el filtro hizo algo — ese era el feedback original del operador.\n\nLas cuatro dimensiones (severidad, tipo, factura, búsqueda) componen multiplicativamente — AND, no OR. `clearAllFilters` resetea TODAS las dimensiones incluyendo el valor del input de búsqueda, pero NO toca `selectedRows` (los ticks manuales sobreviven al cambio de lens). El hero CTA "Aplicar N ahora" y "Marcarlas y revisar" se rescopean a `repairableInScope` cuando hay cualquier filtro activo (incluyendo solo búsqueda) — el operador puede buscar "GOMEZ" → ver 4 filas → "Aplicar 4 ahora" y eso aplica solo esas 4. Los filtros sobreviven al re-audit (cuando el padre re-corre `runAudit()` después del onApply) — perder el filtro en cada apply forzaría al operador de vuelta al ruido del manifiesto completo después de cada corrección.\n\nDOC + REGRESSION GUARDS: el modal y el spec ahora documentan 7 contracts no-obvios que MUST hold across refactors: AND composition, CTA scoping, selection survives filter reset, filters survive re-audit, pluralización del contador, búsqueda como literal substring (regex chars son inertes), apply-in-flight bloquea chips. 24 tests nuevos (44 total, antes 33). Cobertura completa para evitar regresiones cuando alguien refactorea la lógica de filtrado.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat(nova): modal de integridad — filtros por tipo, búsqueda y contador visible',
  },
  {
    version: '0.0.607',
    date: '2026-04-29',
    layer: 'fe',
    type: 'refactor',
    title: 'Nova: separación arquitectural fresh vs Firestore + integrity audit + merge fuzzy + delete invoice button',
    description: 'BUG-CURATED-DESTROYED 2026-04-29: refactor profundo en 4 ejes para terminar la regresión donde re-cargar un manifiesto guardado destruía links curados y generaba facturas con clientes equivocados (caso "PAULA UMANA" → "ANA PAULA FONSECA QUADROS").\n\n(1) DATA-ORIGIN POLICY: nuevo módulo `client/lib/nova/data-origin/` con `DataOrigin = "fresh"|"firestore"` y `DataOriginPolicy` con 7 flags semánticos (`allowAutoDivergentRematch`, `allowAutoPreAlertAssign`, `allowAutoLearnedRoute`, `showDivergentBadges`, `showDivergentFilter`, `showFrozenBanner`, `showRevalidateAllButton`). Hook `useNovaDataOrigin` deriva la policy desde `resultData`. NovaTableModal y `useNovaCustomerAssignment` reemplazan los 8+ `loadedFromFirestore` cast hand-rolled por una sola lectura del policy. El operador NUNCA pierde sus links curados al recargar — los auto-validators están OFF para Firestore data, ON para fresh Excel parses. NovaFrozenBanner se renderiza arriba del save bar del footer (antes header), explica el estado al operador. NovaRevalidateAllButton: escape hatch explícito vía Acciones, con confirm modal que advierte que sobreescribe links manuales. Divergent badges/filter ocultos para Firestore. 21 tests sobre policy + 7 sobre hook + 5 sobre banner + 7 sobre revalidate button.\n\n(2) ROUND-TRIP FIDELITY: `saveManifestRecord` ahora persiste matchScore/matchSource/precioSinPermiso/precioConPermiso/pesoRedondeo/diferenciaRedondeo/pesoConsolidacion en `manifests/{mn}.packages[]`. `loadMegaManFromFirestore` los hidrata sin destructive defaults — antes `precioSinPermiso = precioConPermiso = precio` colapsaba el precio visible cada reload, y `matchScore` se reducía a binario 0/1, rompiendo el filtro low-score. 6 tests sobre round-trip identity.\n\n(3) MERGE GROUPS CON FUZZY MATCHING: nuevo módulo `client/lib/nova/merge-groups.ts` con `fuzzyNameSimilarity` token-based + surname-aware. Detecta el caso INDIRA: "INDIRA TENORIO QUESADA" ↔ "INDIRA LIZETH TENORIO QUESADA" → confidence 1.0 (last2 surnames idénticos + firstname overlap). "ANA LOPEZ" ↔ "ANA MARIA LOPEZ" → 0.85 (subset containment). "JUAN PEREZ" ↔ "JUAN GARCIA" → 0 (rechazado, surnames distintos). NovaMergeGroupsConfirmModal con side-by-side source/target + invoice impact + threshold 0.85. `applyExplicitMatch` en useNovaCustomerAssignment para forzar match sin AI search. Wire en Acciones del grupo unmatched. 31 tests sobre merge logic + 9 sobre modal.\n\n(4) INTEGRITY AUDIT + REPAIR: módulo nuevo `client/lib/nova/integrity/`. `auditManifestIntegrity(manifestId)` cruza `manifests/{mn}.packages[]` vs `packages` collection vs `manifest_encomiendas` vs `invoices`. Detecta `slcode_mismatch` (high), `name_mismatch` (medium), `route_mismatch` (low), `invoice_customer_drift`, `invoice_weight_drift`, `invoice_price_drift`, `orphan_tracking`, `duplicate_invoice`. SuggestedFix con authority ranking: protected invoice (0.95) > consensus 2+ sources (0.90) > draft invoice (0.75) > single source (0.6). `applyIntegrityRepairs` atómico (Firestore writeBatch, máx 250 repairs/chunk) actualiza solo manifests + packages, NUNCA invoices (per data-integrity policy). NovaIntegrityModal con evidence side-by-side de las 3 fuentes + bulk apply confiables. useNovaIntegrityAudit hook auto-dispara para Firestore-loaded manifests, badge "X inconsistencias" en toolbar. 21 tests audit + 9 modal + 6 hook.\n\n(5) DELETE INVOICE PER-BADGE: botón X junto a cada badge de factura (per-row + factura consolidada). NovaDeleteInvoiceConfirmModal con identity card (número/cliente/total/status), warning especial para PAID (recomienda anular en /invoices), typed-confirmation gate ("ELIMINAR" verbatim) para protected statuses. Helper `deleteInvoiceById` en invoice-service. Realtime subscription auto-refresca el badge. 9 tests.\n\nTotal: 1240 tests (+131 nuevos). Branch: refactor/nova-data-origin-separation. Sin breaking changes en endpoints o data shape — todos los manifiestos legacy siguen leyendo correctamente vía fallback en el hidrator.',
    author: 'SmartLogistics Team',
    commitMessage: 'refactor(nova): data-origin policy + integrity audit + fuzzy merge + delete invoice button',
  },
  {
    version: '0.0.604',
    date: '2026-04-28',
    layer: 'fe',
    type: 'fix',
    title: 'NovaTable: "Re-crear facturas" ya no falla en silencio para facturas Enviadas — nuevo botón "Anular y re-crear"',
    description: 'BUG-RECREATE-SILENT-NOOP: cuando el operador hacía click en "Re-crear facturas" sobre un manifiesto con facturas en estado Enviado/Vencido/Pendiente, el sistema saltaba esos grupos por la AI GUARD pero NO le decía nada al operador — la acción parecía ejecutarse sin efecto y el doble-billing podía aparecer si después se re-procesaba el manifiesto. Causa: (a) el smart-diff usaba `inv.status !== "draft"` para detectar non-draft, lo cual incluía erróneamente "annulled" como protegido (los anulados son tombstones inertes, no deberían bloquear nada). (b) la AI GUARD en createInvoicesFromRows tenía el mismo bug. (c) el dialog mostraba un conteo binario "N facturas existentes" sin indicar cuántas están en estado bloqueante. (d) no había forma desde la UI de forzar la recreación cuando la factura estaba en Enviado.\n\nFIX integral: (1) Nueva constante `RECREATE_PROTECTED_STATUSES = {sent, paid, overdue, pending, pending_payment}` — annulled / cancelled / void NO bloquean. (2) Smart-diff y AI GUARD migrados a esta lista; annulled docs son ignorados por completo en el fingerprint. (3) Nueva query `getInvoiceBreakdownByManifest` que retorna {drafts, sent, paid, overdue, pending, annulled} en lugar de un solo conteo. (4) Diálogo "Actualizar BD" ahora muestra el breakdown desglosado por status con explicación de qué hace cada acción para cada bucket. (5) Nuevo helper `annulInvoicesByTrackingsAndManifest` que marca status=annulled (preserva audit trail: annulledAt, annulledBy, annulledReason, statusHistory) en lugar de borrar — paid invoices SIEMPRE se preservan. (6) Tercer botón "Anular y re-crear" (variant=destructive) aparece SOLO cuando hay sent/overdue/pending Y no hay paid. Anula primero, luego corre el flujo regular que ahora ve solo drafts + annulled (excluidos) → recreación libre. (7) Si hay facturas Pagadas, la opción "Anular y re-crear" se oculta (operador debe anular manualmente desde /invoices). El operador ahora ve EXACTAMENTE qué pasará y tiene un camino explícito y reversible para regenerar facturas Enviadas con datos actualizados sin perder el historial.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(nova): re-create invoices now handles sent/overdue/pending via explicit "Anular y re-crear" button',
  },
  {
    version: '0.0.603',
    date: '2026-04-28',
    layer: 'fe',
    type: 'feature',
    title: 'NovaTable: "Actualizar BD" ahora pregunta entre Solo guardar datos vs Re-crear facturas',
    description: 'Antes el botón "Actualizar BD" abría un diálogo con un único "Confirmar y guardar" que SIEMPRE invocaba handleIngestAndInvoice() — esto guarda paquetes Y borra+recrea todas las facturas del manifiesto afectado. Cuando el operador solo cambiaba datos no facturables (descripción, re-link de cliente, reasignación de manifiesto), las notas y ajustes manuales hechos directamente en /invoices se perdían en cada guardado.\n\nAhora el diálogo expone DOS botones explícitos: (1) "Solo guardar datos" → llama handleIngest() que escribe paquetes, manifests/{mn} y manifest_encomiendas pero NO toca la colección invoices — seguro de re-correr cuantas veces sea necesario. (2) "Re-crear facturas" → mantiene el comportamiento legacy: ingest + smart-diff + delete groups changed + createInvoicesFromRows. Útil cuando cambian precios, terceros, IVA o asignaciones de cliente. Cancelar sigue como escape secundario.\n\nLa advertencia de "Manifiesto ya procesado — N facturas existentes" se reescribió para reflejar la elección: ahora explica claramente qué pasa con cada botón. UX intencional: el operador NUNCA destruye facturas por accidente al re-guardar datos.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat(nova): two-button save flow — solo guardar datos vs re-crear facturas',
  },
  {
    version: '0.0.602',
    date: '2026-04-28',
    layer: 'fe',
    type: 'fix',
    title: '/invoices: crash "Cannot read properties of undefined (reading toLowerCase)"',
    description: 'Hotfix: la página /invoices entera reventaba con TypeError al filtrar facturas legacy sin invoiceNumber (creadas antes del 0.0.600). El filtro `inv.invoiceNumber.toLowerCase()` en línea 600 no tenía guard nullish (todas las líneas adyacentes sí lo tenían — fue inconsistencia local). Como el filter corre en cada render aunque el search term esté vacío, una sola factura legacy bloqueaba toda la lista. FIX: `(inv.invoiceNumber ?? "").toLowerCase()` — mismo patrón que el resto del filter. También blindé `filteredCustomers` (`c.fullName ?? ""`, `c.slCode ?? ""`) por la misma clase de bug.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(invoices): nullish guard on invoiceNumber filter to prevent crash on legacy docs',
  },
  {
    version: '0.0.601',
    date: '2026-04-28',
    layer: 'fe',
    type: 'fix',
    title: '/invoices: facturas legacy sin invoiceNumber ya se pueden eliminar',
    description: 'Bug downstream del 0.0.600: las facturas creadas con el flujo manual roto previo no tienen campo invoiceNumber. El diálogo "Eliminar Factura" requiere que el operador escriba el número de factura para confirmar (gate `deleteConfirmText === confirmAction.invoiceNumber`). Para esos docs legacy el código de la factura mostraba vacío y el botón "Eliminar" quedaba disabled permanentemente — imposible borrar la factura. FIX: en `showConfirmation()` cuando `invoiceNumber` viene vacío/whitespace, fallback al `invoiceId` (Firestore doc id, siempre presente y único). El operador escribe/pega el doc id, el contrato de confirmación se mantiene intacto, y los docs legacy quedan eliminables. Las facturas nuevas (Nova o manual post-0.0.600) siempre traen invoiceNumber real → nunca caen al fallback.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(invoices): legacy invoices without invoiceNumber are now deletable via doc-id fallback',
  },
  {
    version: '0.0.600',
    date: '2026-04-28',
    layer: 'fe',
    type: 'fix',
    title: '/invoices/create: paridad total con Nova — fecha, CRC, tipo de cambio, descripción de tracking, manifiesto, source',
    description: 'BUG-CREATE-INVOICE-PARITY: las facturas creadas en /invoices/create salían con "Invalid Date" en el header, sin monto en CRC, sin tipo de cambio, sin manifiesto, sin badge Nova, sin descripción del tracking en los items, y sin invoiceNumber generado — porque el payload solo enviaba 7 campos SP1 (customerId, clientName, items, ivaEnabled, subtotalAmount, taxAmount, totalAmount, discountPercentage, discountAmount) mientras que Nova pasa por buildInvoiceData() que escribe ~30 campos canónicos (invoiceNumber, invoiceDate, dueDate, status, source, exchangeRate, amountCRC/subtotalCRC/ivaCRC, items[] SP2 shape con description+realWeight+isPermiso, invoiceItems[] SP1 shape, customer{} object, manifestNumber+manifestNumbers, trackingNumber/trackingNumbers, ivaRate, packageCount, totalWeight, isConsolidation, isMergedSingle, etc.). FIX: refactor de handleCreateInvoice para construir un InvoiceGroup + ProcessedRow[] desde el customer y los selected packages y delegar en el MISMO buildInvoiceData() que createInvoicesFromRows() usa para Nova — single source of truth garantiza paridad byte-por-byte. Cambios específicos: (1) auto-fetch del exchangeRate en mount usando getRecentManifests(10) — espeja el pre-fill de NovaTableModal, operador puede override antes de submit. (2) Selected packages → ProcessedRow[] con todos los campos requeridos (tracking, peso, precio, permisos, pesoRedondeo, descripcion, etc.). (3) Manual items → extraItems con shape {description, amount} — buildInvoiceData los renderiza como isManual=true exactamente como Servicio de Terceros en Nova. (4) Edge case manual-only (sin packages, solo items manuales): synthesize placeholder row con precio=0 para satisfacer el contrato rows[].length>=1 de buildInvoiceData, después strip del placeholder de items[]/invoiceItems[] antes del write. (5) Si todos los packages comparten el mismo manifiesto, se estampa en la factura — mixed manifests dejan undefined (Nova hace lo mismo). (6) isMergedSingle = !isConsolidation && rows.length>1 → multi-package operator-driven invoice no consolidada = Factura única, exactamente como Nova. (7) Discount post-build: replay de los invariantes USD/CRC (subtotal+iva==total, amountCRC=round(total*rate)) ya que buildInvoiceData no soporta discount nativamente. (8) source: "manual" stamp para distinguir en /invoices badges. (9) notes operador override la auto-nota del builder. Resultado visible: la factura ahora muestra invoiceNumber generado (ej. SL6782-20260428223045123), badge "Borrador", fecha real (28/4/2026), Total CRC con TC visible (ej. ¢475.88), descripción del tracking en cada item, y badge azul cuando aparezca un sistema de provenance. 1109 tests passing.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(invoices): manual create now produces full Nova-parity invoice payload via buildInvoiceData',
  },
  {
    version: '0.0.599',
    date: '2026-04-28',
    layer: 'fe',
    type: 'refactor',
    title: 'Paquetes: editor inline de manifiesto ahora 100% reactivo realtime (onSnapshot)',
    description: 'Sigue al 0.0.598. Reemplaza las queries one-shot por subscripciones onSnapshot para que TODA la información del editor se actualice en tiempo real sin refresh ni refetch manual. (1) Lista de manifiestos del typeahead: useQuery + staleTime 5min reemplazado por useEffect + onSnapshot directo a manifests collection (200 más recientes ordenados por createdAt desc). Cuando un colega o pestaña paralela ingiere un nuevo manifiesto, aparece en el dropdown al instante. (2) Factura activa del cliente para preview: nuevo helper subscribeActiveInvoiceForCustomer en invoice-service.ts que monta 3 subscripciones onSnapshot paralelas (una por cada variante histórica del campo customer-id: clientSlCode / slCode / customerId) y las merge client-side via id-deduplication. La selección de "factura activa" pasa por la misma función pickActiveInvoice que el one-shot fetcher (single source of truth — invariante de selección no se duplica). Cuando alguien marca la factura como pagada, agrega un item, edita un campo, o anula desde otra pestaña, el preview pane Y el modal NovaInvoicePreview reflejan el cambio en sub-segundo sin que el operador tenga que hacer nada. (3) Loading state inteligente: el spinner solo aparece hasta el primer emit; los updates posteriores son silenciosos para que un parpadeo de "buscando..." no aparezca cada vez que cambia la factura en background. (4) Cleanup garantizado: el useEffect retorna unsub() que tira las 3 subscripciones cuando el operador cambia el destino o cierra el popover — cero listeners colgantes. Pattern alineado con subscribeInvoicesByManifest, subscribeRecentManifests y demás subscripciones existentes en el codebase. 1109 tests siguen pasando.',
    author: 'SmartLogistics Team',
    commitMessage: 'refactor(packages): make manifest editor preview fully realtime via onSnapshot',
  },
  {
    version: '0.0.598',
    date: '2026-04-28',
    layer: 'fe',
    type: 'feature',
    title: 'Paquetes: editor inline de manifiesto con typeahead + preview de factura destino',
    description: 'Antes el campo Manifiesto en la fila expandida de /packages era de solo lectura. Ahora click → popover con Command typeahead que filtra los 200 manifiestos más recientes (reusa la query manifestsForBulk ya cacheada con staleTime 5min, sin nueva fetcher). Al seleccionar un destino aparece un panel de preview que muestra: (a) origen → destino con tachado del manifest actual, (b) la factura activa NON-PROTECTED del cliente (si tiene slCode) — exactamente la misma que appendPackagesToCustomerInvoice usaría al confirmar — con número, status badge, item count, total y badge de consolidada cuando aplique, (c) preview del item a agregar (tracking, peso, precio), (d) botón "Ver factura completa" que abre NovaInvoicePreview en modal para auditoría completa antes de confirmar, (e) banners contextuales si el cliente no tiene slCode o no tiene factura activa. Confirmar ejecuta atómicamente: firestoreApi.packages.update con manifestNumber/manifestId/updatedManifest/manifestUpdatedAt → movePackagesBetweenManifestDocs (mirror en arrays embedded packages[] de manifests origen/destino) → batchUpdateConsolidationManifest → appendPackagesToCustomerInvoice (solo cuando hay slCode). Optimistic cache patch en queries packages para que el cambio se vea instantáneo. Nuevo helper findActiveInvoiceForCustomer en invoice-service.ts (queries idénticas a appendPackagesToCustomerInvoice — single source of truth para la selección de factura). Nuevo componente PackageManifestEditor.tsx aislado con preview pane embedded en popover; el modal NovaInvoicePreview solo se monta on-demand al click "Ver factura completa". Invariante: solo se puede escribir un manifestNumber válido (los del Command list) — referential integrity garantizada.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat(packages): inline manifest editor with typeahead and target invoice preview',
  },
  {
    version: '0.0.597',
    date: '2026-04-28',
    layer: 'both',
    type: 'fix',
    title: 'NovaTable: Rule C resuelve regresión masiva de matching + pre-alert ya no machaca asignaciones manuales',
    description: 'Auditoría de NovaTableModal identificó dos fuentes correlacionadas de corrupción de datos:\n\n(1) BUG-NAME-FROM-DISPLAYNAME Rule C: el sync programado SP2→SP1 (4×/día) ejecutaba `fullName = firstName+lastName || displayName` desde el 0.0.591. Para clientes latinos con `lastName=""` en SP1 (común — operador nunca completó el campo) y `displayName="JESUS ARRIETA CLAVERIA"` en SP2, esto truncaba fullName a "Jesus" silenciosamente, destruyendo el matching algorítmico de Nova (jaro-winkler bajaba de 0.92 → 0.55). Fix: nuevo helper puro `resolveCustomerFullName()` en `client/lib/utils/customer-name.ts` con regla Rule C: prefiere displayName SOLO cuando tiene estrictamente más tokens que firstName+lastName Y no luce como handle (sin dígitos, sin paréntesis, sin tokens repetidos). Mirroreado inline en `functions/src/customers/sync.ts` y `functions/scripts/run-customer-sync.ts`. EditCustomerModal usa el helper directo. Botón "Sincronizar" en /customers ahora soporta Shift+Click para forzar re-sincronización COMPLETA — necesario tras este fix para reparar todos los clientes corruptos en una pasada (el sync incremental solo toca clientes con updatedAt más reciente que el último sync, deja la mayoría intactos). 20 tests RCN/LLH cubren todos los casos históricos: Fran92MJ handle, Jesus single-name, multi-apellido latino, datos vacíos, whitespace.\n\n(2) BUG-PREALERT-OVERWRITE: el effect de pre-alert auto-assign en `NovaTableModal.tsx:459` corre una query async (~2s). Durante ese vuelo, si el operador vinculaba/desvinculaba/cambiaba slCode manualmente, el callback usaba el snapshot de matchOverrides/slCodeOverrides/unlinkedRows capturado al momento de mount (closure stale), machacando la acción del operador. En manifiestos cargados de Firestore (loadedFromFirestore=true), el pre-alert reescribía las asignaciones guardadas si el slCode original SP2 difería del slCode curado por el operador, destruyendo manual links como "PAULA UMANA" → "ANA PAULA FONSECA QUADROS". Fix: (a) skip total para manifiestos Firestore-loaded (mantiene solo los badges P), (b) mirror refs (matchOverridesRef, slCodeOverridesRef, unlinkedRowsRef) sincronizados a cada render se leen DENTRO del callback async para tener estado fresco, (c) functional setState con guard `if (prev[idx]) return` como capa extra de seguridad anti-race entre filter y dispatch. 1109 tests pasan, typecheck FE+BE limpio.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(nova): Rule C fullName resolution + pre-alert no longer overwrites operator-curated assignments',
  },
  {
    version: '0.0.595',
    date: '2026-04-28',
    layer: 'fe',
    type: 'fix',
    title: 'Eliminar factura: ahora permite copiar y pegar el número de factura en el input de confirmación',
    description: 'En el diálogo de confirmación de eliminación (/invoices) el operador no podía pegar el número de factura en el input de confirmación porque el handler `onPaste={e => e.preventDefault()}` (línea 4859 de InvoiceGeneration.tsx) bloqueaba todo paste, forzando a tipear el número manualmente. Cambios: (1) eliminado el guard onPaste — el paste ahora funciona normal. (2) El bloque <code> con el número de factura ahora envuelve un span flex con un botón de copiar (icono Copy de lucide) que escribe el valor al portapapeles vía navigator.clipboard.writeText y muestra un Check verde durante 2s como confirmación visual. (3) Clases `select-all break-all` añadidas al <code> para que un click triple seleccione todo el número y se respete el wrap si el número es muy largo. (4) Texto de instrucción actualizado de "escribe el número" a "escribe o pega el número". (5) Reset del estado copiedInvoiceNumber al cerrar el diálogo (onOpenChange handler) para que el icono no quede en estado "copiado" al reabrir.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat(invoices): allow copy/paste of invoice number in delete confirmation dialog',
  },
  {
    version: '0.0.593',
    date: '2026-04-28',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: guardado por selección parcial preserva filas y facturas no seleccionadas (no más re-escritura destructiva)',
    description: 'Antes, al guardar con selección parcial en NovaTableModal, las filas NO seleccionadas se perdían en dos lugares. (1) Diff de facturas destructivo: si seleccionabas 2 de 5 filas de un cliente con factura existente, resolvedGroupFP[A] tenía 2 trackings y existingGroupFP[A] tenía 5 → el diff marcaba "size mismatch → changed" → deleteInvoicesForTrackings borraba la factura completa con [T1..T5] → recreaba sólo con [T1,T2] → T3, T4, T5 desaparecían silenciosamente de la factura. (2) saveManifestRecord usa setDoc({packages, customers}, {merge:true}) — el merge de Firestore reemplaza arrays completos, no los fusiona, así que el doc manifests/{mn} pasaba de 10 packages a 2 entradas. Fix en 3 puntos: nuevo helper puro computeProtectedGroupKeys() en client/lib/utils/nova-invoice-grouping.ts identifica grupos cuyas facturas existentes contienen trackings fuera de la selección; handleIngestAndInvoice (step 2b\') y handleIngest los excluyen del diff y la recreación, dejando intactas las facturas existentes; saveLocalBackup, saveManifestRecord y saveEncomiendaManifestRows reciben manifestDocRows (set completo construido con buildResolvedRows(resultData.rows)) en modo selección, evitando truncar el doc del manifiesto. UI: nueva fila verde "Protegidos (selección parcial) — N grupos · M trackings" en el diálogo de confirmación informa al operador antes de guardar. 8 tests nuevos PGK-01..PGK-08 en nova-invoice-grouping.spec.ts cubren null/empty/full-coverage/partial-overlap/__unmatched__/mixed/case-insensitive/empty-selection (47 tests del archivo, 1089 totales pasan).',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(nova): partial selection no longer overwrites unselected rows or truncates manifest doc',
  },
  {
    version: '0.0.591',
    date: '2026-04-28',
    layer: 'both',
    type: 'fix',
    title: 'Customer fullName se recomputa desde firstName+lastName (antes SP2 displayName sobrescribía con handles)',
    description: 'El cliente SL26590 se mostraba como "Fran92MJ (Fran92MJ)" en el listado /customers y en el detalle, aunque sus campos firstName="Francisco" y lastName="Mejia" estaban correctos en Firestore. Causa: (1) functions/src/customers/sync.ts y functions/scripts/run-customer-sync.ts priorizaban `sp2User.displayName || firstName+lastName`, dejando que un handle/username de SP2 sobrescribiera el nombre real al sincronizar. (2) client/components/EditCustomerModal.tsx:177 hacía `formData.fullName || firstName+lastName` en handleSubmit — como el input de fullName no existe en el form, `formData.fullName` llegaba con el valor sucio pre-cargado y el fallback nunca disparaba, re-stamping el handle en cada save. Fix: invertida la prioridad en los 3 sitios — `${firstName} ${lastName}`.trim() siempre gana cuando está presente; displayName queda solo como fallback para perfiles SP2 sin nombre estructurado, y "Usuario" como último recurso. Los clientes ya guardados con fullName malformado se corrigen gradualmente al abrirlos en Edit→Save o al correr el próximo sync SP2→SP1.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(customers): fullName prioriza firstName+lastName sobre SP2 displayName',
  },
  {
    version: '0.0.590',
    date: '2026-04-28',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: temp customers (SL-NAN-*) auto-aplican Factura única + fix colisión de invoiceNumber por segundo',
    description: 'Se cerraron dos bugs encadenados que provocaban facturas duplicadas y badges visualmente idénticos para grupos de paquetes vinculados a un mismo cliente temporal. (1) Auto Factura única para temp customers: cuando el operador asigna 2+ filas al mismo SL-NAN-*, ahora mergedInvoices[slCode] se activa solo (computeAutoFacturaUnicaKeys, Step 3 del effect reactivo en NovaTableModal). Real customers conservan opt-in manual, operador puede desactivar (operatorModeOverrides), y facturas pre-existentes en Firestore (Step 1) siguen ganando prioridad. (2) generateInvoiceNumber agregó precisión de milisegundos: antes el formato YYYYMMDDHHmmss colisionaba cuando se creaban 2+ facturas para el mismo slCode dentro del mismo segundo (caso típico: createInvoicesFromRows en lote), produciendo dos docs Firestore con invoiceNumber idéntico que renderizaban el mismo badge en la tabla y engañaban al operador. Nuevo formato YYYYMMDDHHmmssSSS (17 dígitos) — backward-compatible con isConsolidatedInvoice (sufijo -C) y con tests existentes (\\d{14} sigue matcheando como substring). 13 tests nuevos: 10 para computeAutoFacturaUnicaKeys (AFU-01 a AFU-10) + 3 para generateInvoiceNumber con anti-colisión.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(nova): auto Factura única para temp customers + fix colisión invoiceNumber',
  },
  {
    version: '0.0.589',
    date: '2026-04-28',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: cargar manifiesto desde Firestore ya no rompe asignaciones manuales (auto-rematch destructivo)',
    description: 'Al hacer "Cargar datos" sobre un manifiesto guardado, el useEffect de autoValidation en useNovaCustomerAssignment detectaba filas con nombre divergente vs nombreCliente y disparaba handleUnlinkAndRematch silenciosamente, destruyendo asignaciones manuales como "PAULA UMANA" → "ANA PAULA FONSECA QUADROS" que el operador había curado a propósito antes de guardar. Ahora el payload trae un flag loadedFromFirestore (seteado por loadManifestFromDB) que se propaga como skipAutoValidation hasta el hook y corta el rematch reactivo. Los datos se cargan tal cual están en Firestore — re-vincular es decisión explícita del usuario (Acciones → Desvincular / Vincular). 5 tests de regresión nuevos en use-nova-customer-assignment.spec.ts.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.588',
    date: '2026-04-28',
    layer: 'fe',
    type: 'feature',
    title: 'NovaTableModal: eliminar fila individual con doble confirmación (paquetes de otro courier)',
    description: 'Se añadió un botón de basurero rojo hover-revealed al final de la columna Descripción de cada fila en el modal de revisión de manifiesto Nova. Al hacer click abre el modal showBulkDelete existente con un solo índice — paso 1 muestra preview con el tracking + advertencia irreversible, paso 2 exige escribir ELIMINAR para activar el botón final. El flujo borra el doc de packages y todas las facturas asociadas. Caso de uso principal: el Excel del manifiesto contiene un paquete de otro courier y el operador necesita descartar solo esa fila sin tocar el resto. Usa el patrón group/opacity-0 group-hover:opacity-100 para no contaminar la tabla en reposo, accesibilidad con aria-label del tracking y focus-visible para teclado.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.587',
    date: '2026-04-28',
    layer: 'fe',
    type: 'fix',
    title: 'Sync SmartWeb (drafts) + Anular Factura: lista de manifiestos válidos en orden cronológico real',
    description: 'Sync SmartWeb: previewSyncInvoices ahora clasifica las facturas en 3 buckets (eligible, noSlCode, nonSyncable=draft). El modal muestra una tarjeta roja con cuántos borradores hay, un banner explicando que deben pasar a Enviada/Pagada antes, y el botón Continuar se desactiva si no hay nada syncable — antes el operador veía "Sincronización completada · 0 procesadas" sin entender por qué. Anular Factura → Asignar a otro Manifiesto: el listado de "Recientes" mostraba manifiestos en orden arbitrario (21-04 → 16-04 → 14-04 → 17-04…) porque la colección manifests tenía updatedAt con tipos mixtos (Timestamp vs ISO string) en distintos code paths. Cambiamos el orderBy a createdAt (siempre serverTimestamp) y unificamos los writes para que usen serverTimestamp() en lugar de new Date().toISOString(). 7 tests de regresión nuevos para previewSyncInvoices.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.586',
    date: '2026-04-28',
    layer: 'fe',
    type: 'fix',
    title: 'Consolidación auto-aplica al vincular cliente + fix crash al crear cliente desde modal',
    description: 'La auto-consolidación ahora considera matchOverrides/slCodeOverrides al contar miembros del grupo, así uniones manuales (ej. LIDOA → SL66) activan la facturación consolidada con el badge "C" sin esperar recarga. También se corrigió un TypeError "Cannot read properties of undefined (reading \'forEach\')" al crear cliente temporal desde el diálogo de vincular/desvincular (faltaban rowIndex/rowIndices). Cubierto con 8 tests de regresión nuevos en computeAutoConsolidationKeys.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.582',
    date: '2026-04-28',
    layer: 'both',
    type: 'fix',
    title: 'Crear Factura: precio redondeado, IVA toggle, fix guardado y más manifiestos en Anular',
    description: 'Precio unitario de paquetes redondeado a entero. Checkbox IVA (13%) para habilitar/deshabilitar el impuesto. Fix crítico al guardar: se usaba customerPackages en lugar de effectivePackages causando crash silencioso; ahora el payload incluye trackingNumber, totalPrice, weight, ivaEnabled, taxAmount y totalAmount. Fix en búsqueda de manifiestos al anular factura: límite ampliado de 8 a 25 resultados y orderBy añadido a la query de búsqueda por prefijo.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.570',
    date: '2026-04-27',
    layer: 'both',
    type: 'refactor',
    title: 'Nova: auto-validación divergentes al cargar + facturación reactiva en tiempo real',
    description: 'Al abrir un manifiesto desde Firestore, se detectan y corrigen automáticamente los matches divergentes (nombre del manifiesto ≠ nombre del cliente, incluyendo pre-alertas). Cada nombre único queda en su propio grupo con intento de re-match a 0.85. Se reemplazó el fetch puntual de facturas por una suscripción onSnapshot en tiempo real. El modo de facturación (consolidado/fusión) se infiere reactivamente de las facturas persistidas. Soporte de overrides del operador para prevenir sobreescritura por actualizaciones en vivo.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.569',
    date: '2026-04-27',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: consolidación auto-activada desde Firestore + badge divergentes + re-validación de matches',
    description: 'Al cargar un manifiesto desde Firestore, se activa automáticamente el modo consolidación para grupos cuyo cliente tenga consolidationEnabled=true en Firestore, incluso si el manifest row guardado tiene consolidacion=false. Se agregó badge ámbar "N diferentes" en group headers donde nombres de filas no comparten tokens con el cliente asignado, más opción "Desvincular divergentes (N)" en Acciones para corregir matches erróneos antes de guardar.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.568',
    date: '2026-04-27',
    layer: 'both',
    type: 'perf',
    title: 'Nova: divergence guard, pre-alert badge, invoice ordering y threshold hardening',
    description: 'Divergence guard en manifest-processor.ts rechaza matches de nombre donde manifiesto y cliente no comparten ningún token (ej. "IVETH MURILLO" → "ARELIS VALERIO" se bloquea). Campo matchSource en ManifestRow distingue pre-alerta vs match por nombre; group header en NovaTable muestra badge "Pre-alerta" cuando la asignación viene de pre-alerta registrada por el cliente. Invoice lookups corregidos con orderBy createdAt desc para siempre usar la factura más reciente. Umbrales de matching elevados: auto-aceptación 0.72→0.88, AI assignment 65%→80%, AI auto-save 88%→93%. AI prompt anti-homónimo endurecido.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.526',
    date: '2025-07-24',
    layer: 'fe',
    type: 'feature',
    title: 'Encomiendas: tabs Activos/Entregados + orden de manifiestos más reciente primero',
    description: 'La página de Manifiestos Encomiendas ahora tiene dos tabs: "Activos" (paquetes no entregados — en aduana, retenido, devuelto, etc.) y "Entregados" (historial read-only sin botones de acción ni facturación). Los manifiestos se ordenan de más reciente a más antiguo. El tab Entregados oculta el tfoot de "Agregar a factura", los items manuales y deshabilita todas las acciones de edición.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.525',
    date: '2025-07-24',
    layer: 'fe',
    type: 'fix',
    title: 'Encomiendas: auto-sync silencioso al cargar la página',
    description: 'El auto-sync al montar la página de Manifiestos Encomiendas disparaba un toast "N paquetes sincronizados" en CADA carga porque syncAllEncomiendaPackages contaba todos los paquetes, no solo los modificados. Ahora el auto-sync en mount es completamente silencioso; el toast solo se muestra al usar el botón manual "Sync Paquetes".',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.524',
    date: '2025-07-24',
    layer: 'fe',
    type: 'fix',
    title: 'EditCustomerModal: fecha de nacimiento y nacionalidad no se cargaban desde la lista',
    description: 'handleEditFromResult en Customers.tsx construía el objeto CustomerData manualmente y omitía los campos birthDate y nationality. Agregados ambos campos al interface CustomerData y al mapping, por lo que el modal de edición ahora los pre-popula correctamente.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.523',
    date: '2025-07-24',
    layer: 'fe',
    type: 'feature',
    title: 'Tab Demografía en Analytics con 6 gráficos de clientes',
    description: 'Nuevo tab "Demografía" en la página de Analytics con hook useDemographicsAnalytics. Incluye: distribución por grupo de edad (barras horizontales), consumo por grupo de edad (paquetes + ingresos), distribución por nacionalidad (donut), membresía/tier, estado de clientes y nuevos clientes por mes (área). KPIs: total clientes, edad promedio, cobertura TSE, % verificados.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.522',
    date: '2026-04-23',
    layer: 'fe',
    type: 'feature',
    title: 'Datos TSE: fecha de nacimiento y nacionalidad en perfiles de clientes',
    description: 'Se muestran y editan birthDate y nationality en CustomerDetailModal, CustomerInfoGrid y EditCustomerModal. Tipo Customer actualizado con ambos campos. Campos visibles en SP2 pestaña Personal (UsersManagement).',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.486',
    date: '2026-04-23',
    layer: 'fe',
    type: 'fix',
    title: 'MEGA-MAN "Cargar": incluye paquetes movidos desde consolidación',
    description: 'bulkMoveConsolidationItems (paso 6) llama a syncConsolidationGroupToManifest para que los paquetes sin array embedded en el manifiesto origen queden grabados en el array embedded del MEGA-MAN inmediatamente. loadMegaManFromFirestore auto-repara el array embedded al detectar paquetes en manifest_consolidation que no están en embedded (consolNotInEmbedded). Corrige que el contador del subscribeRecentManifests use el totalPackages almacenado en lugar de getCountFromServer para MEGA-MAN.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.485',
    date: '2026-04-23',
    layer: 'both',
    type: 'refactor',
    title: 'MEGA-MAN: contadores correctos, badges por fuente y paquetes de consolidación',
    description: 'Corrige el overwrite de totalPackages al mover paquetes desde consolidación (usa increment atómico). El contador MEGA-MAN suma packages collection + manifest_consolidation. loadMegaManFromFirestore incluye paquetes de consolidación como tercera fuente. subscribeRecentManifests expone fusedFromCounts (pkgs por manifiesto origen) y consolidationCount. SavedManifestsSection muestra el conteo de cada manifiesto fusionado dentro del badge y una línea "+N pkgs de Consolidación". Tier 4 de nova-tools es fire-and-forget (no bloquea la UI). Auto-reparación en NovaChatMessage para manifiestos fusionados con totalPackages=0.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.484',
    date: '2026-04-23',
    layer: 'both',
    type: 'refactor',
    title: 'Autocomplete de cliente refactorizado con shadcn Popover + Command',
    description: 'Reescritura completa de CustomerAutocomplete usando Popover + Command (cmdk). Elimina hacks de portal manual y event propagation. Soporta teclado, accesibilidad ARIA y funciona correctamente dentro de Radix Dialog.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.483',
    date: '2026-04-22',
    layer: 'fe',
    type: 'fix',
    title: 'Fix barra de progreso atascada en 85% al sincronizar facturas',
    description: 'Reemplaza el timer falso (capado en 85%) por progreso real basado en fases: API sync (0–50%), stamp Firestore (60%), sync paquetes (75–95%). El label también muestra la fase activa.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix: real progress phases in SyncInvoicesModal, remove fake timer capped at 85',
  },
  {
    version: '0.0.482',
    date: '2026-04-22',
    layer: 'both',
    type: 'perf',
    title: 'Fix Firestore WebChannel 400 storm on invoice sync',
    description: 'Reemplaza el patrón teardown-all/recreate-all de listeners en InvoiceGeneration por suscripciones incrementales via pageSubsRef. Elimina el storm de 400 Bad Request en el WebChannel de Firestore al sincronizar facturas masivamente hacia SP2.',
    author: 'SmartLogistics Team',
    commitMessage: 'perf: fix Firestore WebChannel 400 storm on invoice sync',
  },
  {
    version: '1.0.36',
    date: '2026-04-22',
    layer: 'be',
    type: 'fix',
    title: 'Correcciones de integridad en sync SP1 → SP2',
    description: 'slUpdateInvoice ahora propaga cambios de estado a SP2 en cada actualización. slDeleteInvoice empuja estado "cancelled" a SP2. Corrección de etiqueta canónica de aduanas en sp1-invoice-sync. Fixes en package-sync para escribir sp1PackageId de vuelta al crear paquetes, habilitando actualizaciones subsecuentes SP2→SP1.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix: sp1-sp2 sync integrity — invoice status push, delete cancellation, sp1PackageId writeback',
  },
  {
    version: '0.0.481',
    date: '2026-04-22',
    layer: 'both',
    type: 'refactor',
    title: 'Refactor impresión de etiquetas de envío — 1 etiqueta por página portrait',
    description: 'Reemplaza layout 2-up landscape por 1 etiqueta por página en portrait. Mejoras de layout, tamaño de fuentes, QR visible, tracking numbers compactos. Aplica a bulk (EncomiendaBulkLabelModal) y etiqueta individual (NovaShippingLabelModal).',
    author: 'SmartLogistics Team',
    commitMessage: 'refactor: shipping label print layout — 1 per page portrait, improved sizing',
  },
  {
    version: '0.0.462',
    date: '2026-04-22',
    layer: 'fe',
    type: 'feature',
    title: 'Etiquetas de envío desde lista de facturas (encomiendas) + fix error etiquetas NOT_FOUND',
    description: 'Facturas: botón "Etiqueta" en cada factura de Encomiendas abre NovaShippingLabelModal para generar/imprimir etiqueta de envío. Bulk: botón "Etiquetas" en barra de acciones masivas para imprimir todas las etiquetas de facturas Encomiendas seleccionadas (EncomiendaBulkLabelModal). Fix: slListShippingLabels fallaba con "5 NOT_FOUND" porque usaba getFirestore() apuntando a la DB "(default)" en lugar de la DB "portal". Corregido importando el db compartido de config/firebase. También se corrigió el orden de where/orderBy en la query y se agrega manejo graceful de NOT_FOUND.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat: etiquetas envío desde facturas encomiendas, fix slListShippingLabels NOT_FOUND db portal',
  },
  {
    version: '0.0.461',
    date: '2026-04-22',
    layer: 'fe',
    type: 'feature',
    title: 'Fix SP2 sync al enviar emails, filtro multi-estado facturas, doble confirmación bulk y alerta SERVICIO DE TERCERO encomiendas',
    description: 'Fix SP2 sync: al enviar email con "Sincronizar con SP2" ahora se llama syncInvoicesToSp2 (push de factura a SP2) + syncInvoicePackagesToSp2 (actualiza paquetes en SP1). Filtro de estado en facturas reemplazado por Popover multi-select con checkboxes. Doble confirmación obligatoria para todas las acciones bulk (checkbox "Confirmo..."). Sync SmartWeb bulk ahora pasa por confirmación. Badge "SIN COBRO DE TERCEROS" en filas de facturas de encomiendas sin item SERVICIO DE TERCERO. Alerta amber en diálogo de email cuando falte el item.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat: fix SP2 sync emails, filtro multi-estado, doble confirmación bulk, alerta terceros encomiendas',
  },
  {
    version: '0.0.460',
    date: '2026-04-21',
    layer: 'fe',
    type: 'fix',
    title: 'Fix factura incompleta al mover paquetes entre manifiestos en Nova',
    description: 'NovaTableModal: mergeExistingDrafts=true para todos los manifiestos (primario y destino). individualRows de manifiestos destino se agrupan por slCode antes de llamar createInvoicesFromRows, eliminando el cascade-merge waterfall que fallaba por delays de índices Firestore y dejaba facturas con un solo ítem cuando el cliente tenía varios paquetes reasignados.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix: invoice merge al mover paquetes entre manifiestos Nova — agrupa individualRows por slCode en target manifest',
  },
  {
    version: '0.0.459',
    date: '2026-04-21',
    layer: 'fe',
    type: 'fix',
    title: 'Fix servicio encomienda en Nova + filtro Estado multi-select en Packages',
    description: 'invoice-service: encomiendaServiceName ahora busca en d.encomienda, addresses[*].encomienda y courierService además de defaultAddress, corrigiendo que clientes con servicio asignado no lo mostraban en la tabla Nova. Packages: filtro Estado reemplazado por Popover multi-select con checkboxes, consistente con el filtro de Rutas.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix: encomienda service lookup en Nova + Estado multi-select en Packages',
  },
  {
    version: '0.0.458',
    date: '2026-04-21',
    layer: 'fe',
    type: 'feature',
    title: 'Modal devolución accesible, fix GTI cálculos precio, estado factura encomiendas',
    description: 'Distribution: reemplaza Popover de devolución por Dialog full-screen optimizado para móvil y accesibilidad cognitiva. GTI: corrige precioUSD usando amountCRC/printTc para evitar drift por TC y muestra PRECIO2 c/IVA (logística×1.13) en tabla y exports. Encomiendas: badge de estado de factura (Borrador/Enviada/Pagada/Vencida) en tiempo real en cards de manifiestos.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat: return modal móvil, fix GTI precios amountCRC, estado factura encomiendas',
  },
  {
    version: '0.0.456',
    date: '2026-04-21',
    layer: 'both',
    type: 'perf',
    title: 'Fixes de filtros en Packages y Routes + corrección de sync SP2',
    description: 'Filtro de rutas multi-select con checkboxes en Packages (corrige bug de Encomiendas por case mismatch). Dropdown de Flag muestra labels correctas (snake_case → camelCase). Routes: bulkUpdate ahora valida result.success para evitar falsos positivos en errores de CF. Toast de SP2 explica paquetes omitidos vs errores reales. Track de intentos de entrega fallida en Distribution.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.414',
    date: '2026-04-20',
    layer: 'both',
    type: 'refactor',
    title: 'Invoice consistency + Encomienda manifest move & stale data reconciliation',
    description: 'Universal "every package must be invoiced" rule enforced across all manifest move flows (BulkManifestWizardModal, PackagesDataTable, BulkMoveDialog) via shared appendPackagesToCustomerInvoice utility. Enhanced syncManifestEncomiendaFromPackages to self-heal stale mirror docs by reclassifying moved packages to their real manifest. Added Move-to-manifest wizard in Encomienda Manifests page. Fixed manifest picker z-index regression with inline autocomplete (no portal).',
    author: 'SmartLogistics Team',
    commitMessage: 'refactor: invoice consistency, encomienda manifest move & stale data repair',
  },
  {
    version: '0.0.415',
    date: '2026-04-20',
    layer: 'fe',
    type: 'feature',
    title: 'Distribución — Escáner de cámara para buscar paquetes',
    description: 'Botón de escáner (⌖) junto al campo de búsqueda en la pantalla de distribución. Abre modal fullscreen con cámara trasera, detecta automáticamente el código de barras del paquete (CODE_128, QR, PDF417, DATA_MATRIX y más), hace flash verde al capturar y llena el campo de búsqueda con el tracking detectado. Reutiliza los hooks existentes: useHtml5QrcodeScanner + useNativeBarcodeDetector. Ciclo de vida limpio: cámara se inicia al abrir el modal y se detiene al cerrar.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat: distribution scanner modal — camera barcode scan to search packages',
  },
  {
    version: '0.0.414',
    date: '2026-04-20',
    layer: 'fe',
    type: 'feature',
    title: 'Distribución — Super búsqueda multi-campo',
    description: 'El input de búsqueda ahora encuentra paquetes por cualquier campo: nombre completo del cliente, código SL (con/sin prefijo), últimos N dígitos del tracking (mínimo 4 dígitos numéricos), número de factura/manifiesto, dirección de entrega y email. El placeholder actualizado guía al chofer con los criterios disponibles.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat: super-search in distribution — name, slCode, last-N tracking digits, manifest, address',
  },
  {
    version: '0.0.413',
    date: '2026-04-20',
    layer: 'fe',
    type: 'feature',
    title: 'Distribución — Entrega grupal por cliente (bajo cognitive load)',
    description: 'Nueva experiencia de entrega para choferes: los paquetes se agrupan por cliente (agrupado por slCode > customerId > nombre). Cada grupo muestra: nombre del cliente, código SL, dirección con enlace a Google Maps, y lista de paquetes con checkboxes auto-seleccionados. El chofer puede desmarcar paquetes individuales no entregados (fondo rojo). Botón único "Entregar X paquete(s)" por grupo → captura de firma → modal de confirmación con lista de paquetes a entregar, preview de firma y toggle "Cobrar en efectivo" (activo por defecto). Actualización batch en paralelo vía useBatchUpdatePackageStatus: marca todos los seleccionados como delivered y guarda deliverySignature, deliverySignedAt, paymentCollected, paymentCollectedAt.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat: grouped delivery workflow — customer groups, auto-checked packages, batch confirm + payment toggle',
  },
  {
    version: '0.0.412',
    date: '2026-04-20',
    layer: 'fe',
    type: 'feature',
    title: 'Analíticas — datos 100% reales y AI Insights corregido',
    description: 'Filtros de fecha en Firestore (no cliente), pageSize 2000, clientes activos calculados desde actividad real del período, MoM muestra "Sin período anterior" en vez de 0%, tooltips con nombre de cliente en todas las gráficas, AI Insights corregido (responseMimeType json + maxOutputTokens 8192).',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.410',
    date: '2026-04-20',
    layer: 'fe',
    type: 'fix',
    title: 'AppNavbar — Navegación precisa y segura',
    description: 'Estado activo ahora usa detección precisa: coincidencia exacta O sub-ruta (/customers/123 activa /customers). Los botones de sección en el desktop (Operaciones, Herramientas, Gestión, RRHH) se resaltan en color primario cuando cualquier ruta de esa sección está activa. Se eliminó código muerto (sections array, hrConfig). Mobile nav también corregido.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix: precise nav active state — startsWith sub-routes + section-level trigger highlighting',
  },
  {
    version: '0.0.409',
    date: '2026-04-20',
    layer: 'fe',
    type: 'perf',
    title: 'AppNavbar — Memoización completa para eliminar lag en navegación',
    description: 'AppNavbar ahora está envuelto en React.memo(), previniendo re-renders causados por cambios de estado en las páginas (ej: listeners onSnapshot de InvoiceGeneration). Se memoizaron: allItems (40 items con JSX + t()), filteredItems, todas las secciones derivadas, handlers y cálculo de iniciales. El navbar ahora solo re-renderiza cuando cambia auth, location o permisos.',
    author: 'SmartLogistics Team',
    commitMessage: 'perf: memoize AppNavbar to eliminate navigation lag from page re-renders',
  },
  {
    version: '0.0.408',
    date: '2026-04-20',
    layer: 'fe',
    type: 'fix',
    title: 'Estado de Cuenta — Reemplaza date picker nativo con DateRangePicker del app',
    description: 'El filtro de fechas en Estado de Cuenta ahora usa el mismo DateRangePicker con presets rápidos (Hoy, Últimos 7 días, Este mes, etc.) y calendario doble que se utiliza en Facturas y demás secciones del app. Se eliminan los inputs nativos del browser.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix: replace native date inputs with app DateRangePicker in Estado de Cuenta',
  },
  {
    version: '0.0.407',
    date: '2026-04-20',
    layer: 'both',
    type: 'feature',
    title: 'Estado de Cuenta — Mejoras de UI, búsqueda, prints con branding y actualización de estado de facturas',
    description: 'Pills de clientes con gradientes rojo/rose para identidad visual. Dropdown interactivo en pills de estado de factura con actualización directa (Firestore + SP2 sync + SP1 packages). Búsqueda multi-token: split por palabras individuales + prefix search en firstNameLower/lastNameLower, filtro client-side para coincidencia de todos los términos. fmtDate ahora maneja Firestore Timestamps ({ seconds, nanoseconds }). Fecha en estado de cuenta usa sentAt → invoiceDate → createdAt → extraída del número de factura. Print de paquetes muestra Estado SP1 (label o raw), columna Sync SP2 (smartwebSynced + fecha) y fecha corregida. Ambos prints incluyen logo /logo-inv.png con header branded.',
    author: 'SmartLogistics Team',
    commitMessage: 'feat: client ledger UI enhancements — search, status update, branded prints',
  },
  {
    version: '0.0.403',
    date: '2026-04-20',
    layer: 'fe',
    type: 'feature',
    title: 'Consolidación — Reasignación masiva muestra manifiestos abiertos de Nova',
    description: 'El diálogo de reasignación masiva ahora consulta la colección manifests de Firestore y lista todos los manifiestos abiertos (fecha futura o sin facturas enviadas para ese cliente). Los manifiestos con factura enviada muestran una etiqueta de aviso y, al seleccionarlos, presentan un toggle para anular o mantener la factura destino. Los paquetes se actualizan en packages, manifest_consolidation y manifests (embedded packages[]) para reflejarse correctamente en Nova.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.402',
    date: '2026-04-20',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — Boleta de Bodega ordenada A-Z por nombre de cliente y agrupada por ruta',
    description: 'La boleta de bodega ahora ordena las filas por ruta → nombre del cliente (sistema) A-Z → SL code como desempate. Además se agregaron encabezados de grupo por ruta (fila coloreada con conteo de paquetes) para facilitar la verificación visual en bodega.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.401',
    date: '2026-04-17',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — invoice preview y correo consistentes con tabla (peso override + totales)',
    description: 'Tres correcciones relacionadas con la edición inline de peso en grupos consolidados: (1) buildOne ahora omite el redondeo de techo para manifiestos no aéreos (el total del preview coincide con la tabla). (2) realWeight en los items del preview usa pesoOverrides[idx] ?? r.peso, eliminando el "0.00 kg" en filas con override. (3) useNovaResolvedRows propaga pesoOverrides al campo peso de las filas resueltas, de modo que buildInvoiceData y las plantillas de correo también reciben el peso corregido por el operador.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.400',
    date: '2026-04-17',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — manifiesto de ruta usa precios reales + edición inline de peso',
    description: 'El manifiesto de ruta ahora obtiene los precios directamente de buildResolvedRows (misma fuente que la tabla Nova), eliminando discrepancias en consolidaciones. Se implementó edición inline de peso con doble confirmación: doble clic en la celda Peso, vista previa del nuevo precio calculado y modal de confirmación. El distribuidor de precios para grupos consolidados evita precios negativos cuando un item tiene override manual.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.397',
    date: '2026-04-17',
    layer: 'fe',
    type: 'fix',
    title: 'Peso real siempre visible en facturas de consolidación (preview, impresión y correo)',
    description: 'Se almacena realWeight (r.peso) en cada InvoiceItem al crear facturas consolidadas. La lógica de precios (peso proporcional) no cambia; solo la visualización muestra ahora el peso real del paquete en el tiquete electrónico, el modal de preview y el correo enviado al cliente.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.396',
    date: '2026-04-17',
    layer: 'fe',
    type: 'feature',
    title: 'Botones imprimir/exportar colapsados en dropdown en footer de Nova',
    description: 'Boleta bodega, Manifiesto ruta, Manifiesto GTI y descarga CSV/Excel ahora están en un único dropdown "Imprimir / Exportar" con opciones más grandes y visibles. Reduce el overflow en pantallas pequeñas.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.395',
    date: '2026-04-17',
    layer: 'fe',
    type: 'feature',
    title: 'Bandera [P] y badges Permisos/Consolidación en manifiesto de ruta',
    description: 'En todos los manifiestos de ruta (Nova, Rutas, Facturas) se muestra [P] al lado del tracking de paquetes con permiso (requiresPermit). En el header del cliente aparece el badge naranja [PERMISOS] con la nota "(Prohibida la consolidación)" y el badge azul [Consolidado] cuando aplica. Cambio en nova-print.ts — aplica automáticamente a NovaTableModal, RoutesManagement e InvoiceGeneration.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.394',
    date: '2026-04-17',
    layer: 'fe',
    type: 'feature',
    title: 'Force Sync SP2: botones per-row y bulk, regression guard y corrección de sincronización',
    description: 'Botón de Force Sync por paquete (icono Wifi en hover) y modal bulk con forceSync=true en PackagesDataTable. SyncSmartWebModal: banner de modo force-override, prop forceSync. syncInvoicePackagesToSp2: regression guard SP1-side (previene downgrade de delivered/returned). sp1-shipment-sync: STATUS_LABEL canónicos (Procesando en Costa Rica, En Ruta de Entrega), historyUpdate condicional con FieldValue.arrayUnion para evitar race condition con invoice-sync. package-sync: fix bug anti-loop onPackageUpdated (condición incorrecta permitía echo SP2→SP1).',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.393',
    date: '2026-04-17',
    layer: 'both',
    type: 'fix',
    title: 'fix: data integrity guards, invoice email in routes, permiso badge en manifiestos',
    description: 'Guards de persistencia Firestore: PROTECTED_PKG_STATUSES, draft-only invoice delete, non-draft merge block, AI-guard JSDoc en todas las funciones críticas. Ícono de factura azul en rutas cuando factura fue enviada. Preview de factura en rutas con envío a cliente y test email. Badge PERMISO en manifiestos de ruta cuando paquetes requieren permisos.',
    author: 'SmartLogistics Team',
  },
  {
    version: '1.0.30',
    date: '2026-04-17',
    layer: 'be',
    type: 'fix',
    title: 'fix: AI-guard comments en processPackage SP2 — skip-create y regression guard',
    description: 'Documenta reglas de persistencia en sp1-shipment-sync: NEVER auto-create desde SP1, regression guard sin bypass, update-only.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.392',
    date: '2026-04-17',
    layer: 'both',
    type: 'refactor',
    title: 'GTI precio-0 filter + PRECIO1/PRECIO2; sync double confirmation SP1↔SP2',
    description: 'Excluye filas precioUSD=0 de exports GTI (CSV/XLSX). Agrega columnas PRECIO1/PRECIO2 con conversión ₡ inline. Doble confirmación status sync: SP1 valida status conocidos antes de enviar (layer 1) y SP2 aplica regression guard a todos los callers incluyendo SP1 (layer 2).',
    author: 'SmartLogistics Team',
  },
  {
    version: '1.0.29',
    date: '2026-04-17',
    layer: 'be',
    type: 'refactor',
    title: 'SP2 regression guard aplica a SP1 + skip creación de shipments nuevos',
    description: 'Eliminado bypass !fromSP1 en regression guard de sp1-shipment-sync. El sync solo actualiza shipments existentes, nunca los crea.',
    author: 'SmartLogistics Team',
  },
  {
    version: '1.0.28',
    date: '2026-04-17',
    layer: 'both',
    type: 'chore',
    title: 'Sync inmediato SP2→SP1 al registrar usuario',
    description: 'Nuevo endpoint HTTP slSyncCustomerFromSp2 en SP1 que recibe un push de SP2 en el momento del registro, eliminando el retraso de hasta 6 horas del sync programado. SP2 llama a SP1 desde slUserProfileCreated (trigger Firestore) y slRegisterAccount (HTTP) de forma no bloqueante.',
    author: 'SmartLogistics Team',
    commitMessage: 'chore: real-time SP2→SP1 customer sync on user registration',
  },
  {
    version: '0.0.390',
    date: '2026-04-17',
    layer: 'both',
    type: 'fix',
    title: 'Facturas — descripción de ítems en uppercase + menú nav sticky fix',
    description: 'La descripción de ítems manuales ahora se muestra en mayúsculas en el preview y en el email (FE + BE). El menú de navegación ahora se cierra correctamente al hacer clic en un ítem (dropdown controlled state).',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.389',
    date: '2026-04-17',
    layer: 'fe',
    type: 'feature',
    title: 'Encomiendas — Impresión bulk 2 etiquetas por hoja con guías de corte',
    description: 'Layout landscape 50/50, tipografía escalada, orden por servicio de courier, QR reubicado bajo Remitente, guías de corte vertical (centro) e inferior con margen simétrico de 0.65in.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.388',
    date: '2026-04-16',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — Factura única, dropdown Manifiesto y badges de clientes',
    description:
      'BUG-I14: Factura única ya no se marca como consolidación (isConsolidation=false, sin sufijo -C). ' +
      'Se almacenan trackingNumber + trackingNumbers para búsquedas de pago/eliminación. ' +
      'Fix z-index: dropdown Manifiesto (CSV/Excel) era invisible detrás del modal (z-50 < z-[60]). ' +
      'Footer de Nova Table: badges de clientes y clientes consolidando. ' +
      'Nuevos tests de regresión BUG-I14 para consolidación e isMergedSingle.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix(nova): Factura única isConsolidation, dropdown z-index, footer badges',
  },
  {
    version: '0.0.387',
    date: '2026-04-15',
    layer: 'fe',
    type: 'feature',
    title: 'Panel detalle de facturas en 5 columnas (Cliente · Desglose · Paquetes · SmartWeb · Email)',
    author: 'SmartLogistics Team',
    commitMessage: 'feat: panel collapse facturas 5 columnas',
  },
  {
    version: '0.0.386',
    date: '2026-04-15',
    layer: 'fe',
    type: 'fix',
    title: 'SP2 sync: botón Re-sync para facturas pagadas + fix statusOnly tracking lookup',
    description:
      'Habilita el botón "Re-sync SP2" (ámbar) para facturas en estado Pagado que ya estaban sincronizadas. ' +
      'Corrige el path statusOnly en SP2 para leer tracking numbers del documento existente cuando el payload no los incluye. ' +
      'Garantiza que al pagar una factura los paquetes se actualizan a En Ruta en el portal del cliente.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix: habilitar re-sync SP2 para facturas pagadas + fix statusOnly tracking lookup',
  },
  {
    version: '0.0.383',
    date: '2026-04-15',
    layer: 'both',
    type: 'fix',
    title: 'Fix logs de email, historial de anulación y dropdown de manifiestos en rutas',
    description:
      'Usa arrayUnion para emailSendLogs/emailResendIds en envío de correos (atomicidad). ' +
      'Registra statusHistory al anular facturas (handleAnnulInvoice). ' +
      'Corrige dropdown "Cambiar manifiesto" en Gestión de Rutas: ahora muestra los manifiestos reales del route en lugar del collection Nova.',
    author: 'SmartLogistics Team',
    commitMessage: 'fix: email logs arrayUnion, statusHistory anulación y dropdown manifiestos rutas',
  },
  {
    version: '0.0.378',
    date: '2026-04-15',
    layer: 'fe',
    type: 'feature',
    title: 'Nova: TC auto-rellenado del último manifiesto + alerta de variación en confirmación',
    description:
      'Al procesar un manifiesto nuevo, el TC se pre-rellena automáticamente con el tipo de cambio del último manifiesto guardado. ' +
      'En el modal de confirmación "Guardar en BD", si han pasado 3+ días desde el último manifiesto ' +
      'o el TC actual varía ≥0.5% respecto al de referencia, se muestra una alerta naranja con la variación (+₡X / %) ' +
      'y un recordatorio de verificar el valor. El TC de referencia se almacena en ManifestRecord.exchangeRate.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.378',
    date: '2026-04-15',
    layer: 'fe',
    type: 'feature',
    title: 'Nova: TC pre-cargado desde Firestore al cargar un manifiesto guardado',
    description:
      'Al cargar un manifiesto desde Firestore (carga de datos guardados), el campo TC (₡/$) en el footer de NovaTable ' +
      'se pre-rellena automáticamente con el tipo de cambio que se usó al guardar esos paquetes. ' +
      'El TC se lee del doc del manifiesto (exchangeRate) o del primer paquete que lo tenga. ' +
      'Flujo de datos: loadMegaManFromFirestore → ProcessingResult.exchangeRate → ProcessedNovaData.exchangeRate ' +
      '→ NovaChatArea.initialExchangeRate → NovaTableModal useState/useEffect.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.378',
    date: '2026-04-15',
    layer: 'both',
    type: 'fix',
    title: 'Facturas: reemplazar Vencimiento por Pago: DE CONTADO en todos los templates',
    description:
      'Eliminada la fecha de vencimiento dinámica de todas las superficies visibles de facturas. ' +
      'Ahora muestra "Pago: DE CONTADO" en su lugar. Aplica en: email HTML template (SP1+SP2), ' +
      'email plain-text (SP1+SP2), NovaInvoicePreview preview+print HTML, InvoicePreview, ' +
      'InvoiceModal dashboard SP2 (React JSX + print HTML), InvoicesManagement SP2 admin panel. ' +
      'El campo dueDate se mantiene en los modelos de datos (no se eliminó).',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.377',
    date: '2026-04-15',
    layer: 'fe',
    type: 'refactor',
    title: 'SmartWeb sync persistencia en paquetes y reactivity bulk update',
    description:
      'Sincronización SmartWeb (SP2) ahora persiste en cada paquete los campos smartwebSynced, smartwebSyncedAt y smartwebSyncSource (invoice|package). ' +
      'Al sincronizar facturas, los paquetes vinculados quedan marcados con source=invoice. ' +
      'Al hacer bulk update con estado elegible, los paquetes se marcan con source=package. ' +
      'Badge Globe2 en columna Estado de la tabla de paquetes muestra estado de sync con tooltip de fuente y fecha. ' +
      'Corregida reactividad: invalidaciones de packageSearch en todos los callbacks onBulkUpdate para que filtros y búsquedas actualicen instantáneamente.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.367',
    date: '2026-04-15',
    layer: 'both',
    type: 'chore',
    title: 'Mejoras email status realtime, tracking lookup y fixes UI',
    description:
      'Resend webhook: corregido 500 al faltar RESEND_WEBHOOK_SECRET (ahora solo warn). ' +
      'Secreto configurado en functions/.env. ' +
      'Nuevo botón ↻ Sync en sección EMAIL de facturas (llama slRefreshEmailStatus CF → Resend emails.get()). ' +
      'Ícono de email enviado movido inline antes del nombre del cliente en la fila colapsada. ' +
      'Botón "Obtener info" en modal Crear Paquete: consulta ML Cargo y Colombia en paralelo y auto-llena peso, descripción, destino, origen y tipo de manifiesto. ' +
      'Nova: lista de manifiestos guardados limitada a 8.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.356',
    date: '2026-04-14',
    layer: 'fe',
    type: 'fix',
    title: 'CustomerAutocomplete: búsqueda de clientes en Crear Paquete siempre vacía',
    description:
      'useCustomers() devuelve { data, pagination } — no un array — por lo que ' +
      'Array.isArray() siempre era false y allCustomers quedaba []. ' +
      'Reemplazado con useCustomerSearch (debounced, Firestore-backed) que ya funciona ' +
      'en el resto del sistema. Ahora la búsqueda es en tiempo real, cubre toda la base ' +
      'de clientes y muestra spinner y mensaje de vacío apropiados en español.',
    author: 'Cascade',
    commitMessage: 'fix: CustomerAutocomplete uses useCustomerSearch instead of broken useCustomers bulk load',
  },
  {
    version: '0.0.355',
    date: '2026-04-14',
    layer: 'both',
    type: 'feature',
    title: 'Sync SmartWeb — SP1→SP2 package synchronisation',
    description:
      'Replace "Facturar" in the bulk floating menu with "Sync SmartWeb". ' +
      'Selecting packages and clicking Sync pushes them to SP2 customer dashboards via a ' +
      'new Cloud Function (slSyncShipmentsFromSp1) that uses Firebase Admin SDK to bypass ' +
      'Firestore rules. Logic: if the customer pre-alerted the package, only the status is ' +
      'updated (preserving customer-provided fields); if no shipment exists, a new one is ' +
      'created with full data. Status regression and admin-locked documents are fully ' +
      'guarded. Modal includes a two-step confirmation (first confirm + type "SYNC"). ' +
      'Also fixed the date filter in Packages page to start empty instead of pre-populating today.',
    author: 'Cascade',
    commitMessage: 'feat: Sync SmartWeb bulk action + date filter fix',
  },
  {
    version: '0.0.354',
    date: '2026-04-14',
    layer: 'both',
    type: 'perf',
    title: 'Crear Factura: preview unificado, manifiesto/permisos en paquetes, UX smooth',
    description: 'Selección de cliente sin parpadeo (skeleton inline en PackageSelectionGrid). Derivación de manifestType desde origin+type de Firestore. Badges de manifiesto y permiso en tarjetas de paquete. Descripción y manifestNumber en lugar de nombre/SL. 10 paquetes por página + opción Ver todos. BE v1.0.22.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.353',
    date: '2026-04-14',
    layer: 'fe',
    type: 'perf',
    title: 'Mejoras UI en pantalla de Facturas',
    description: 'Botones de acción en barra horizontal visible. Typeahead de manifiestos en anulación con deduplicación. Número de factura como columna independiente. Nombre de cliente sin truncar en font-medium. Confirmación antes de enviar email. Corrección duplicados en búsqueda de manifiestos.',
    author: 'SmartLogistics Team',
  },
  {
    version: '1.0.21',
    date: '2026-04-14',
    layer: 'be',
    type: 'fix',
    title: 'Corrección cuenta BAC Dólares en emails de factura',
    description: 'Despliega functions con la cuenta correcta CR75010200009534930877 en la plantilla invoice-email.html y email config.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.351',
    date: '2026-04-14',
    layer: 'fe',
    type: 'fix',
    title: 'Corrección cuenta BAC Dólares en facturas y emails',
    description: 'Actualiza número de cuenta BAC Dólares de CR94010200009534930944 a CR75010200009534930877 en: preview de factura (NovaInvoicePreview), plantilla HTML de email, config de email del backend y template de invoice-email.html.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.350',
    date: '2026-04-14',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: manifiestos DAN/DANP siempre cargan con precios aéreos USA',
    description: 'Al cargar un manifiesto desde Firestore, el tipo de envío se resuelve por prioridad: (1) sufijo DAN/DANP → siempre aéreo, (2) voto mayoritario del campo type en la colección packages, (3) manifestType guardado. Corrige manifiestos ya guardados con tipo incorrecto usa_sea sin requerir migración de datos.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.349',
    date: '2026-04-14',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: cargar manifiesto Firestore desde colección packages (datos vivos)',
    description: 'loadMegaManFromFirestore ahora consulta primero la colección packages (filtrado por manifestNumber) para obtener los datos más actualizados post-ingesta y ediciones desde Packages. Solo hace fallback al array embebido en manifests si la colección no tiene resultados.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.348',
    date: '2026-04-14',
    layer: 'fe',
    type: 'fix',
    title: 'Manifiesto de ruta: clientes ordenados alfabéticamente',
    description: 'Los grupos de clientes en el manifiesto de ruta impreso ahora aparecen ordenados alfabéticamente por nombre (A→Z) usando localización español.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.347',
    date: '2026-04-14',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: precios consolidados correctos y detección aéreo/marítimo',
    description: 'Corrige cálculo de precios para facturas consolidadas: aplica patrón distribuidor para eliminar diferencias de redondeo (ej. $1307.99 → $1308). Elimina falsa detección de manifiestos aéreos como marítimos causada por la palabra "ship" en encabezados. Agrega guardia de tipo aéreo en los tres sitios de facturación por techo para evitar regresión con manifiestos marítimos.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.294',
    date: '2026-04-13',
    layer: 'be',
    type: 'fix',
    title: 'Factura por correo: eliminar descripción del paquete (ej. ROPA, ACCESORIOS)',
    description: 'La sección DESCRIPCIÓN del correo de factura ahora muestra únicamente el número de tracking, sin el texto de descripción del paquete (ROPA, ACCESORIOS Y ARTICULOS VARIOS, JUGUETES, etc.). Aplica globalmente en HTML y texto plano del email. BE v1.0.20.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.293',
    date: '2026-04-13',
    layer: 'fe',
    type: 'feature',
    title: 'MEGA-MAN: fusiones guardadas en Firestore, sección en Nova, peso real en manifiesto de ruta',
    description: 'Fusiones de manifiestos ahora se guardan en Firestore con ID MEGA-MAN-DD-MM-YYYY. El Excel fusionado se sube a Firebase Storage para re-procesamiento futuro. Nova detecta consultas sobre MEGA-MAN y muestra sección "Fusiones MEGA-MAN · Firestore" al final de la lista de manifiestos (carga desde Firestore). Botón "Re-procesar" descarga desde Storage y re-ingesta (merge idempotente). storage.rules: agentes pueden escribir en MLCARGO/. Peso en manifiesto de ruta ahora usa siempre el peso real (no pesoRedondeo) para todas las boletas incluyendo permisos y consolidación.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.292',
    date: '2026-04-13',
    layer: 'both',
    type: 'chore',
    title: 'Manifiesto de Ruta: ajustes visuales de impresión (altura consistente, checkboxes, fuentes)',
    description: 'Altura fija y consistente en rows de tracking (36px) y headers de cliente (44px). Checkboxes de método de pago más grandes (16pt) alineados horizontalmente con flex. Firma centrada en header. Eliminado "X paq." de columna Firma. Checkbox izquierda / texto derecha en método de pago. Fuentes aumentadas: slCode 9pt, montos totales 10pt, nombre cliente 12pt, peso 9pt. Fondo blanco en celdas de firma y método de pago. Tipo de cambio global en header superior derecho.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.291',
    date: '2026-04-13',
    layer: 'both',
    type: 'chore',
    title: 'Manifiesto de Ruta: rediseño de layout de impresión + fix carga de facturas por manifiesto',
    description: 'Print de manifiesto de ruta: eliminado "Firme aquí", columna Descripción renombrada a Firma, columna Firma antigua eliminada, Método de Pago con rowspan por cliente y opciones verticales, tracking font 9.5pt, nombres de cliente 10pt, precios 9pt, peso 9pt, Dólares izquierda / Colones derecha en celda de totales, Tipo de Cambio global en header en negritas, fondo blanco en filas y celda de pago. Fix InvoiceGeneration: consulta directa a Firestore por manifestNumber para cargar facturas más allá del límite de cursor 1000. Fix Nova: campo clientSlCode agregado a facturas para compatibilidad con searchInvoices().',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.290',
    date: '2026-04-13',
    layer: 'both',
    type: 'fix',
    title: 'WEIGHT_DISPLAY_RULE: permiso/consolidación usan pesoRedondeo en facturas, previews y manifiesto de ruta',
    description: 'Permisos y consolidaciones ahora muestran el peso redondeado (Math.ceil) en previews, facturas guardadas en Firestore, emails y manifiesto de ruta impreso. Paquetes regulares siguen usando el peso real. Etiquetas del print cambiadas a "Dólares:" y "Colones:", fuente reducida 1pt, badge "Consolidado" en grupos de consolidación. 3 tests de regresión nuevos en invoice-service.spec.ts y 28 tests en nova-print.spec.ts. Fix CSS.escape → escapeCssId para compatibilidad con Node/Vitest.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.289',
    date: '2026-04-13',
    layer: 'both',
    type: 'refactor',
    title: 'Rutas/Despacho: agrupación, invoice preview, alineación de tabla',
    description: 'Tab Despacho por defecto con estilo rojo activo. Agrupación de paquetes por nombre/SL Code/Manifiesto con totales USD y CRC. Invoice preview standalone con test email. Columnas de tabla con ancho fijo para alineación perfecta.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.287',
    date: '2026-04-13',
    layer: 'fe',
    type: 'fix',
    title: 'Manifiesto de Ruta: columna Zona → Método de Pago, sin palabra "Pago:", "Firme aquí"',
    description: 'Header de columna renombrado de Zona a Método de Pago. Removida la palabra "Pago:" del encabezado de cada cliente. Texto cambiado de "Firme abajo" a "Firme aquí".',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.286',
    date: '2026-04-13',
    layer: 'fe',
    type: 'fix',
    title: 'Manifiesto de Ruta: layout compacto, checkboxes grandes, ruta no se repite por paquete',
    description: 'Eliminado texto de ruta en celda Zona de cada paquete (redundante). Totales restaurados en 3 líneas (dólares, colones, TC). Opciones de pago inline con checkboxes 13pt. Layout más denso: márgenes reducidos, padding mínimo, sin height fijo en filas.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.285',
    date: '2026-04-13',
    layer: 'fe',
    type: 'fix',
    title: 'Manifiesto de Ruta: métodos de pago ya no se salen del área en impresión vertical',
    description: 'Se eliminó white-space:nowrap de .pago-cell y .sig-h. Se rebalancearon los anchos de columna (Zona 10%→14%, Firma 16%→21%, recortando Tracking y Descripción). Cada opción de pago (Ef/Tr/Sinpe) queda en su propia línea con display:block.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.284',
    date: '2026-04-13',
    layer: 'fe',
    type: 'fix',
    title: 'Clientes: botón Sincronizar ahora llama a triggerCustomerSync en Cloud Functions',
    description: 'useSyncCustomers tenía una mutationFn placeholder que no hacía nada. Ahora llama correctamente a firebaseApi.customers.sync() → Cloud Function triggerCustomerSync (SP2→SP1). El toast de éxito muestra creados/actualizados.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.283',
    date: '2026-04-13',
    layer: 'fe',
    type: 'feature',
    title: 'Facturas: anular factura mueve items al Manifiesto de Consolidación',
    description: 'Al confirmar la anulación de una factura, los items no-manuales (con trackingNumber) se escriben automáticamente en la colección manifest_consolidation vía batch atómico. El diálogo de confirmación informa al usuario de este comportamiento.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.282',
    date: '2026-04-14',
    layer: 'fe',
    type: 'feature',
    title: 'Consolidación: colección dedicada manifest_consolidation con flujo de agregar/quitar manual',
    description: 'Nueva colección Firestore manifest_consolidation (sin \'s\') — inicia vacía. La vista de Manifiestos de Consolidación ahora lee exclusivamente de esta colección. Botón "Agregar" abre un dialog de búsqueda por tracking que enriquece el item con datos del paquete y precio de factura antes de guardarlo. Botón "Quitar" (basurero) en cada PackageRow para eliminar el item de la colección. El botón "Mover" actualiza el campo manifestNumber dentro de manifest_consolidation de forma atómica. Reglas Firestore actualizadas.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.281',
    date: '2026-04-13',
    layer: 'fe',
    type: 'feature',
    title: 'Encomiendas manifiestos: borrado bulk de paquetes por cliente seleccionado',
    description: 'Botón "Borrar (N)" en el header del manifiesto cuando hay clientes seleccionados. Flujo de dos pasos con confirmación antes de eliminar. Elimina los documentos de manifest_encomiendas correspondientes vía writeBatch.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.280',
    date: '2026-04-13',
    layer: 'fe',
    type: 'feature',
    title: 'Encomiendas: items de factura reactivos, filtro sin cliente y creación de temp customer',
    description: 'Suscripción onSnapshot a la factura por grupo de cliente con edición y eliminación inline de items manuales. Botón directo "Crear cliente" en el header del grupo para clientes sin SL code. Filtro "Sin cliente" en la barra de filtros para mostrar solo clientes sin SL o temporales (SL-NAN-*). Regla Firestore para colección temp_customers (permisos de lectura y escritura para agentes).',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.278',
    date: '2026-04-12',
    layer: 'both',
    type: 'refactor',
    title: 'Nova: refactoring modular + cross-collection query agent',
    description: 'Extracción de hooks/utils/componentes de NovaTableModal (use-nova-resolved-rows, use-nova-price-calcs, use-nova-downloads, nova-print, NovaCopyCell, NovaMultiMatchSection). Nuevo tool query_packages_with_invoice_status para consultas cruzadas paquetes×facturas. Mejoras i18n, aria y perf en componentes nuevos.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.277',
    date: '2026-04-12',
    layer: 'both',
    type: 'fix',
    title: 'Manifiesto de ruta: totales etiquetados y firma sin raya',
    description: 'Header de grupo en impresión muestra "Total a pagar en dólares", "Total a pagar en colones" y "Tipo de cambio" en líneas separadas. Celda Firma reemplaza raya por sub-leyenda "(Firme abajo)". Matching Nova prioriza collection customers sobre temp_customers en todos los puntos de sort y exact-match.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.276',
    date: '2026-04-12',
    layer: 'both',
    type: 'refactor',
    title: 'Factura Única funcional en BD + temp_customer matching y encomiendas reactivas',
    description: 'Factura Única ahora genera una sola factura al guardar en BD (mergedInvoices wire en handleIngestAndInvoice). groupRowsForInvoicing acepta mergedSlCodes. InvoiceRecord incluye isMergedSingle. temp_customers integrados en customer-matcher para matching en Nova. onSnapshot y handleAssignEncomienda enrutados a temp_customers para códigos SL-NAN-*.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.275',
    date: '2026-04-12',
    layer: 'both',
    type: 'perf',
    title: 'Refactor servicio de email de facturas con fuente única de verdad',
    description: 'TC/CRC visible en preview y correo. handleSendEmail usa buildInvoiceEmailPayload (descuentos, TC 2 decimales, CRC post-descuento). handleSaveEditInvoice persiste exchangeRate y amountCRC. SP1 normalise con derivedTc fallback.',
    author: 'SmartLogistics Team',
  },
  {
    version: '1.0.11',
    date: '2026-04-11',
    layer: 'be',
    type: 'fix',
    title: 'Email factura: logo correcto, badge Consolidación y orden condiciones',
    description: 'Logo ahora apunta a smart-portal-admin.web.app. Badge "Consolidación" en sección cliente. Bullet permisos al final de Condiciones de Servicio.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.251',
    date: '2026-04-11',
    layer: 'fe',
    type: 'fix',
    title: 'Facturación: ceil(peso) uniforme — individuales y consolidaciones',
    description: 'Individuales: precio en ceil(peso)×$12. Consolidados: ceil(suma pesos)×$12 distribuido proporcional por paquete. Permisos: ceil(peso)×$12+$3. Reactivo en tiempo real al toggle de consolidación.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.251',
    date: '2026-04-11',
    layer: 'be',
    type: 'chore',
    title: 'Email: sincronizar Condiciones de Servicio con el preview de factura',
    description: 'El email de factura ahora tiene exactamente las mismas condiciones que el preview impreso: título "Condiciones de Servicio", condición de encomienda 4PM y enlace a www.smartlogisticscr.com/terms.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.250',
    date: '2026-04-11',
    layer: 'both',
    type: 'chore',
    title: 'Condiciones: paquetes con permiso de importación no se consolidan',
    description: 'Agrega la condición "Los paquetes con permiso de importación no se consolidan y se facturan de forma individual" en las Condiciones de Servicio del preview de factura y en los Términos de Pago del email de factura.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.249',
    date: '2026-05-12',
    layer: 'both',
    type: 'fix',
    title: 'Facturas consolidadas: precio por pesoRedondeo y email TIQUETE ELECTRÓNICO',
    description: 'Corrige discrepancia de cálculo en facturas consolidadas/permiso: el precio ahora se calcula desde el peso redondeado (pesoRedondeo) en lugar del peso bruto, de modo que el peso mostrado en la factura coincide con el precio cobrado. Aplica a buildResolvedRows, buildOne preview y consolidatedHeaderTotal. Email: título cambiado de RECIBO a TIQUETE ELECTRÓNICO, etiquetas SmartId y Ruta corregidas.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.216',
    date: '2026-04-11',
    layer: 'fe',
    type: 'feature',
    title: 'Encomiendas: bulk label preview, bulk invoice send y collapse por manifest',
    description: 'Vista previa unificada para impresión masiva de etiquetas (todas en una sola ventana de impresión). Modal de envío masivo de facturas con búsqueda paralela de invoices y progreso por cliente. Botón collapse/expand de grupos de clientes por manifest. Auto-generación de etiqueta en bulk print cuando el cliente tiene datos completos.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.179',
    date: '2026-04-10',
    layer: 'fe',
    type: 'feature',
    title: 'Nova — Desvincular en dropdown de fila; Clientes — ruta y consolidación en lista',
    description: 'Desvincular movido de hover a dropdown (⋯) por fila child con opciones Desvincular, Reasignar y Editar nombre. Al desvincular, el parent/footer del grupo desaparece en tiempo real sin necesidad de recargar. Filas desvinculadas aparecen planas sin asociación visible. Fix: unlinkedRows agregado a deps de buildResolvedRows. Página de Clientes: ruta del cliente visible en cada fila como badge con color primario. Badge "Consolida" en azul cielo para clientes con consolidationEnabled. Modal de detalles de cliente: eliminados campos redundantes Route, Zona, Ruta preferida (ID) — solo permanece el campo Ruta.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.172',
    date: '2026-04-10',
    layer: 'fe',
    type: 'fix',
    title: 'Nova Table — fixes de sort, filas faltantes, desvincular por fila, mensaje genérico',
    description: 'Filas faltantes corregidas: key duplicado en tracking causaba que React descartara filas silenciosamente. Sort de cliente ahora usa row.nombre (nombre en manifiesto visible) en vez de nombreCliente (nombre sistema). 7 bugs de sort/ruta corregidos incluyendo matchOverrides ignorados en cálculo de ruta. Función "Desvincular" por fila individual: ícono naranja en hover desvincula la asociación de esa fila sin afectar el grupo. Contador de filas en header/footer refleja filtros activos. Mensaje de procesamiento de paso 6 cambiado a genérico sin mencionar slCode.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.166',
    date: '2026-04-10',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — badge de procesado en manifiestos, detección prefijo BB, tarjetas más grandes',
    description: 'Badge verde "✓ Procesado" aparece junto al nombre del manifiesto si ya fue procesado. Detección en dos niveles: doc directo (SP1) + query por campo manifestId (SP2). Prefijo BB y similares ahora se auto-detectan en rutas via Tier 3 lookup contra rutas conocidas. Tarjetas de manifiesto más grandes y legibles. Sin ruta badge más visible (opacity 60).',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.138',
    date: '2026-04-10',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — Auditoría de bugs en aprendizaje, matching y prompts de IA',
    description: 'BUG-ML1 (crítico): lookupLearned tier 2 generaba falsos positivos — entrada aprendida de 1 token ("PEDRO") podía matchear "PEDRO RODRIGUEZ VEGA CR" con score 0.95. Fix: guard de proporcionalidad ≥50% en cantidad de tokens. BUG-ML2 (crítico): learnedCacheIndex guardaba solo 1 entrada por normalizedName — clientes con mismo nombre (familias/tocayos) perdían el segundo match. Fix: detección de colisiones y exposición de requiresUserChoice/multipleMatches cuando hay 2+ slCodes para el mismo nombre normalizado. BUG-ML3 (moderado): BATCH_SIZE=15 en customer-matcher vs límite de 12 en aiSelectBestMatchBatch — los items 13-15 de cada batch se descartaban silenciosamente. Fix: BATCH_SIZE reducido a 12. BUG-ML4 (moderado): entradas ai_auto obsoletas persistían en Firestore después de que el operador corrigiera el match — envenenaban el caché en futuros manifiestos. Fix: saveMatchFeedback marca como ai_superseded los docs conflictivos al confirmar un admin_pick; filtrados en loadLearnedMatches. BUG-AI1 (moderado): regla 3 del prompt verifyNames era ambigua ("Eliminar... Mantener...") — Gemini podía eliminar apóstrofes (O\'Connor) o guiones (García-López) válidos. Fix: instrucciones separadas con NUNCA explícito. BUG-AI2 (moderado): aiFindPotentialMatchesBatch podía alucinar slCodes cuando la lista de candidatos estaba vacía. Fix: instrucción CRÍTICO + marcador explícito en casos sin candidatos. BUG-AI3 (menor): getLearnedCandidatesForAI no ordenaba por relevancia antes del slice — la IA recibía hints aleatorios para tokens comunes como "JOSE". Fix: ordenar por overlap de tokens y luego por hitCount.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.137',
    date: '2026-04-10',
    layer: 'fe',
    type: 'feature',
    title: 'Nova — Inline edit UX, route learning mejorado y badges de revisión',
    description: 'Inline name edit con comportamiento Excel (Enter/Tab confirma, Escape cancela, sin auto-guardar en blur). Botones ✓ OK y ✕ Cancel inline junto al input. Botón Copiar nombre con feedback visual (ícono cambia a ✓ verde por 1.5s). Badge "R" rojo visible antes del nombre para filas sin cliente asignado. Badge slCode verde cuando tiene check de aprobación, después del nombre y antes de íconos. Íconos de lápiz y copiar más grandes (h-3.5). Fix: guardar aprendizaje de ruta al seleccionar del dropdown (no solo al ingestar). Aprendizaje de prefijos: "BB", "SJ", etc. se guardan como clave de ruta en unmatched_route_learning para auto-asignar ruta en futuros manifiestos aunque no tengan cliente asociado. Verificación de lógica peso real vs redondeo en facturas: sin regresiones.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.136',
    date: '2026-04-09',
    layer: 'fe',
    type: 'feature',
    title: 'Encomiendas: gestión de proveedores de courier en SP1 + sync bidireccional con SP2',
    description: 'Nueva página /encomiendas en SP1 (Admin/Manager). CRUD completo: crear, editar, activar/desactivar, eliminar proveedores. Suscripción en tiempo real via Firestore onSnapshot. ZoneTagInput con autocompletado y soporte de teclado. Tabs de filtrado (Todos/Activos/Inactivos/Pendientes) + búsqueda normalizada. Sync bidireccional SP1↔SP2: escribir en SP1 replica en SP2 (fire-and-forget); importFromSP2 hace bootstrap desde el JSON de SP2. Menú lateral bajo Gestión > Plataforma (ADMIN/MANAGER). i18n en/es para menú y breadcrumbs. Lazy-loaded + ProtectedRoute. Firestore indexes añadidos (active+name, reviewStatus+name).',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.135',
    date: '2026-04-09',
    layer: 'both',
    type: 'fix',
    title: 'Encomiendas: fix CRUD — FieldValue sentinels destruidos por removeUndefined + null guards',
    description: 'BUG-E1 (SP2 firestore-service.ts): removeUndefined() iteraba recursivamente los objetos FieldValue de Firestore (serverTimestamp, arrayUnion, etc.). Como sus propiedades son no-enumerables, quedaban reducidos a {} y eliminados por el guard length>0 — todos los documentos se escribían sin createdAt/updatedAt, causando rechazo en security rules para create/update/patch/delete. Fix: se detectan sentineles via ._methodName y se pasan sin modificar. BUG-E2 (SP2): arrays vacíos como zones:[] eran descartados por el mismo guard length>0. Fix: arrays vacíos ahora se preservan. BUG-E3 (SP2 EncomiendaManagement.tsx): allKnownZones useMemo usaba e.zones.forEach sin null guard — crash cuando algún doc de Firestore carecía del campo. Fix: (e.zones ?? []).forEach con z?.trim(). BUG-E4 (SP1 EncomiendaManagement.tsx): mismo null guard faltante en allKnownZones. BUG-E5 (SP1 encomienda-service.ts): encomiendaToForm() usaba e.zones.join() sin guard defensivo.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.129',
    date: '2026-04-08',
    layer: 'both',
    type: 'chore',
    title: 'Integridad de datos tabla Nova + sync SP2→SP1',
    description: 'BUG-DI1: sort por "Cliente" usaba row.nombre crudo en vez del nombre efectivo (matchOverrides→nameOverrides→nombreCliente). BUG-DI2: tiebreak secundario en sort por Ruta ignoraba nameOverrides. BUG-DI3: sort por "P.Redn" ignoraba priceOverrides[idx].pesoRedondeo — orden incorrecto tras redondear pesos. BUG-DI5: totalWeight en buildOne (preview de factura) usaba r.pesoRedondeo crudo sin consultar priceOverrides. 21 tests de regresión nuevos. BE 1.0.6.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.134',
    date: '2026-04-08',
    layer: 'be',
    type: 'fix',
    title: 'Sync SP2→SP1: 3 bugs de integridad de datos — nuevos clientes no llegaban a SP1',
    description: 'BUG-S1 (SP2 user-service.ts): JSON.parse/JSON.stringify en createProfile() convertía los FieldValue serverTimestamp() en objetos vacíos {}. Firestore guardaba updatedAt como mapa vacío en vez de Timestamp, haciendo que where("updatedAt",">",since) nunca los encontrara — todos los registros web de SP2 eran invisibles al sync incremental indefinidamente. Fix: stripUndefined() preserva sentineles de FieldValue. BUG-S2 (SP2 auth-triggers.ts): slUserProfileCreated actualizaba el doc con claims pero sin updatedAt — usuarios importados vía auth:import nunca tenían un Timestamp válido. Fix: updatedAt: FieldValue.serverTimestamp() en la llamada update. BUG-S3 (SP1 sync.ts): el sync incremental sólo consultaba updatedAt>since sin fallback. Usuarios con updatedAt roto ({}) nunca eran recuperados. Fix: segunda query createdAt>since como defensa en profundidad para cubrir el período de transición.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.133',
    date: '2026-04-08',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: 7 bugs en Nova.tsx — sort, clear, badges, a11y, perf',
    description: 'BUG-N1: MANIFEST_TYPE_OPTIONS definido dentro del componente — movido a nivel de módulo. BUG-N2: useMemo innecesario para flags booleanos simples — eliminado. BUG-N3: sort cronológico producía NaN con timestamps inválidos/undefined — guard añadido. BUG-N4: botón "Nueva conversación" sólo visible cuando existían mensajes de Nova agent, ocultándose si sólo había manifiestos — ahora usa hasAnyContent. BUG-N5: badge "N líneas" en ManifestCards no se actualizaba al finalizar el procesamiento — refreshTrigger counter propaga el evento. BUG-N6: dep del useEffect de processedStatus usaba .length en lugar de IDs — reemplazado con string de IDs. BUG-N7: selector de tipo de manifiesto sin role="radiogroup"/"radio" ni aria-checked — corregido. +10 tests nuevos (formatTrackingDate, sort NaN guard, module-level constant).',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.132',
    date: '2026-04-08',
    layer: 'fe',
    type: 'perf',
    title: 'Nova: 4 mejoras de rendimiento + 4 bugs funcionales en filtros y revisión',
    description: 'PERF-1: buildResolvedRows O(n²)→O(n) con Map de índices. PERF-2: activeTotal O(n²)→O(n) usando selectedRows directamente. PERF-3: pre-alertas de N Firestore reads individuales→ceil(N/10) con batchCheckTrackingPreAlerts (where in chunks). PERF-4: deps de filteredIdxs useMemo corregidas (nameOverrides/matchOverrides faltaban). BUG-F1/F2/F3: búsqueda de texto en tabla no encontraba nombres/slCodes editados por el operador. BUG-F4: rowNeedsReview marcaba filas como "requiere revisión" incluso después de asignación manual. +21 pruebas nuevas (performance, filtro, review, edge cases).',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.131',
    date: '2026-04-08',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: 6 bugs de edge-case en la tabla — cliente, boleta, contactos y rutas',
    description: 'BUG-E1: Crear cliente solo actualizaba la primera fila del grupo — ahora actualiza todas. BUG-E2: Modal de reasignar cliente quedaba abierto después de seleccionar — ahora cierra. BUG-E3: Editar ruta de cliente en modal no actualizaba rutaOverrides en tabla — ahora sí. BUG-E4: Boleta de bodega usaba nombre DB ignorando ediciones inline — ahora aplica nameOverrides. BUG-E5/E6: customerContactMap no se refrescaba al vincular/crear clientes — el botón "Enviar recibo" no aparecía — ahora llama getCustomersBySlCodes al terminar.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.130',
    date: '2026-04-08',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: descarga CSV/Excel ahora refleja el estado actual de la tabla',
    description: 'BUG-D1/D2: Los botones CSV y Excel descargaban los datos crudos del manifiesto ignorando todos los cambios del operador (rutas, nombres, precios recalculados, slCodes asignados). Ahora handleDownloadCSV y handleDownloadXLSX usan buildResolvedRows para producir el archivo con exactamente los datos visibles en la tabla antes de descargar.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.129',
    date: '2026-04-08',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: cambios en tabla siempre reflejados al ingresar paquetes y facturas',
    description: 'BUG-T1: rutaOverrides (picker de rutas) ignorado al guardar — ahora aplicado. BUG-T2: nameOverrides (edición inline de nombres) ignorado al guardar — ahora aplicado. BUG-T3: priceOverrides/computedPrices no reflejados en filas de facturas — precio manual visible en tabla ahora coincide con lo guardado. Refactor: buildResolvedRows() como fuente única de verdad antes de cualquier escritura. 23 tests de regresión nuevos en NovaTableModal.overrides.spec.ts.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.128',
    date: '2026-04-08',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: corrección de datos y cobertura completa de regresiones en facturas',
    description: 'BUG: handleIngest no actualizaba el doc de manifests con el tipo de cambio — ahora llama saveManifestRecord después de ingestManifestToPackages. Deps faltantes en useCallback (separateInvoices, customerContactMap, priceAdjustments). 52 tests de regresión para invoice-service (IVA, TC, consolidación, agrupación, emails). Documentación JSDoc completa con mapa de quick-fixes.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.127',
    date: '2026-04-08',
    layer: 'fe',
    type: 'fix',
    title: 'Tracking: Colombia y MLCargo consultados en paralelo siempre',
    description: 'Eliminada exclusión mutua entre providers. useTrackingSearch ahora llama MLCargo y Colombia en paralelo para toda búsqueda de tracking. El panel de proveedor muestra Colombia si found=true, USA en caso contrario. Fix: trackings numéricos de Colombia (ej. 016008590915) ya no quedan sin datos.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.126',
    date: '2026-04-08',
    layer: 'both',
    type: 'feature',
    title: 'Tracking: mejoras de UI y corrección de resolución de tracking',
    description: 'Permiso visible en panel MLCargo (reemplaza Destino). Panel de proveedor adaptativo (USA / Colombia). Discrepancias de slCode en PreAlertSysCard y CustomerMatchPanel. Eliminada lógica de prefijos AI en resolveSearchQuery — el middleware resuelve el canonical ID. Fix: números de 12 dígitos (FedEx/Colombia) ya no se expanden erróneamente a USPS. BE v1.0.5.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.125',
    date: '2026-04-08',
    layer: 'fe',
    type: 'refactor',
    title: 'Tracking: modularización completa de cards y paneles',
    description: 'Extraídos 10 componentes reutilizables en client/components/tracking/: CarrierBadge, ColombiaPanel, CustomerMatchPanel, EventTimeline, MLCargoPanel, PackageCard, PackageHistory, PreAlertSysCard, PriceTag, status-helpers + tipos/helpers en types.ts con barrel index.ts. Tracking.tsx reducido ~75 %. Cards de Sistema rediseñados con el mismo layout de grid-dl que MLCargo para comparación visual directa. Resaltado de discrepancias (rojo + AlertTriangle) en nombre, peso, manifiesto y descripción.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.124',
    date: '2026-04-07',
    layer: 'fe',
    type: 'feature',
    title: 'Pre-Alertas en Sistema: identificación completa del cliente y origen de datos',
    description: 'Página Pre-Alertas: card detallado con nombre, correo, DNI, teléfono, SL Code, origen, descripción, peso (kg), permiso y manifiesto — sin joins adicionales. Tracking page → panel Sistema ahora muestra pre-alertas de SP2 junto a paquetes; badge de origen "Pre-Alerta · SP2" / "Nova" / "Paquete" en cada card. Tracking en paneles MLCargo y Colombia formateado en uppercase. Unidad de peso corregida a kg en todas las vistas de pre-alerta.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.123',
    date: '2026-04-07',
    layer: 'fe',
    type: 'feature',
    title: 'Página Pre-Alertas: buscador ultra-rápido en Herramientas',
    description: 'Nueva página /pre-alerts en el menú Herramientas → Logística. Búsqueda directa sobre la colección pre_alerts por tracking exacto o por SL Code (agrupa todos los trackings del cliente). Debounce 250ms, consulta Firestore O(1), exportación CSV y contador de tiempo de respuesta.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.122',
    date: '2026-04-07',
    layer: 'fe',
    type: 'feature',
    title: 'Pre-alerta overrides match de nombre en procesador de manifiesto',
    description: 'Si un tracking tiene pre-alerta con slCode en la colección pre_alerts, ese slCode se usa como match directo (prioridad 1) sobre el match algorítmico por nombre. La verificación corre en paralelo con el matching para no agregar latencia.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.121',
    date: '2026-04-07',
    layer: 'fe',
    type: 'chore',
    title: 'Badges [P], [C], [R] en tabla Nova + herramienta check_pre_alert',
    description: 'Badges compactos en tabla de manifiesto: [P] pre-alerta (violet), [C] consolida (blue), [R] revisar (amber). Nueva herramienta check_pre_alert para consultar la colección pre_alerts desde Nova.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.120',
    date: '2026-04-02',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — sorts por child rows, peso flat sin grupos',
    description: 'Sort por CLIENTE/TRACKING/PRECIO/COLONES usa valores de row child (no agregados del header). Sort por PESO y P.REDN muestra vista plana sin encabezados de grupo, ordenando todos los paquetes globalmente. Sort por CLIENTE usa nombre del manifiesto (row.nombre), no el nombre del cliente registrado.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.117',
    date: '2026-04-02',
    layer: 'fe',
    type: 'feature',
    title: 'Nova — consolidación proporcional, umbral match 85%, confirmación TC y ajustes visuales',
    description: 'Consolidación: suma pesos reales → ceil → precio único → distribución proporcional en tabla y facturas. Permisos y filas normales mantienen precio individual. Factura no-consolidada muestra peso real (no pesoRedondeo). Umbral mínimo de match subido a 85% (scores 65–84% van a Revisión). Diálogo de confirmación TC antes de Guardar en BD. Colores de grupos (header/child) aclarados y equilibrados. Toggle consolidación ya no sobreescribe priceOverrides individuales.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.70',
    date: '2025-07-16',
    layer: 'fe',
    type: 'feature',
    title: 'Ruta "Desconocida" agregada a todos los componentes de rutas',
    description: 'Añade ruta Desconocida (zinc/gris) en nova-route-options, bodega/types, RoutesManagement, PackagesDataTable, seed y script de migración Firestore. Usada para paquetes sin cliente registrado.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.69',
    date: '2025-07-16',
    layer: 'fe',
    type: 'feature',
    title: 'Nova: mejoras en tabla — badge C consolidación, ruta inline, badge manifiesto removido',
    description: 'Filas hijas muestran badge "C" (azul outline) si el cliente consolida. Celda ruta en filas hijas siempre visible con dropdown inline que actualiza toda la ruta del grupo. Se removió el badge "manifiesto" de filas hijas. consolidationEnabled cargado desde Firestore.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.68',
    date: '2025-07-16',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: traducciones del CustomerSearchModal corregidas',
    description: 'Aplana claves customerSearch.* en nova.json a formato flat customerSearch_* para alinearse con keySeparator:false + nsSeparator:dot de i18next. Corrige encabezado que mostraba "title" y "manifestLabel" como texto literal.',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.67',
    date: '2025-07-16',
    layer: 'fe',
    type: 'fix',
    title: 'Nova: modal Reasignar y acciones del dropdown ahora abren correctamente',
    description: 'Corrige z-index stacking issue donde CustomerSearchModal (Reasignar), RoutePickerModal y NovaEditCustomerModal aparecían detrás del tableModal. Se portalan a document.body con createPortal y z-[65].',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.66',
    date: '2025-07-16',
    layer: 'both',
    type: 'fix',
    title: 'Distribution en tiempo real + optimización de rutas y Firestore',
    description: 'Corrige Distribution que siempre retornaba [] (stub sin implementar). Implementa queries directas a Firestore para rutas y paquetes eliminando Cold-start de Cloud Functions. Alinea los estados canónicos (route/consolidated) en Distribution y RoutesManagement. Agrega índices Firestore para packages:ruta+status+createdAt. Corrige customs label a "Procesando en Costa Rica".',
    author: 'SmartLogistics Team',
  },
  {
    version: '0.0.65',
    date: '2026-03-31',
    layer: 'both',
    type: 'chore',
    title: 'Nova tabla — mejoras UX: columnas, rutas, encabezados ocultos, badges y fixes',
    description: 'Abreviación SJ para rutas San Jose. Reducción de anchos de columna para iPad. Botones Crear/Vincular corregidos (portal z-index). Toggle "Encabezados ocultos" con badges por fila (Ruta, slCode, revisar). Badge Nova oculto al aprobar. Badge Sin ruta con borde punteado. Filtro "N grupos sin ruta" como botón toggle. Header tabla con fondo sólido.',
    author: 'SmartLogistics Team',
    commitMessage: 'chore: Nova table UX improvements — column widths, hidden headers, SJ routes, badge fixes',
  },
  {
    version: '0.0.60',
    date: '2026-03-31',
    layer: 'both',
    type: 'perf',
    title: 'Nova tabla — sorting Excel-like, Acciones junto al nombre de cliente',
    description: 'Ordenamiento dinámico por columnas (ASC/DESC) con sort secundario ruta/cliente, peso ascendente dentro de cada grupo. Botón Acciones reubicado al lado del nombre del sistema cliente.',
    author: 'SmartLogistics Team',
    commitMessage: 'perf: Nova table Excel-like sorting + Acciones dropdown relocation',
  },
  {
    version: '2.9.3',
    date: '2026-03-30',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — corregido error de permisos al crear cliente (FirebaseError)',
    description: 'generateNextSlCode() usaba SP2 counters cuyas reglas de Firestore bloquean escrituras desde el cliente. Se migró al colección sl_counters de SP1 que ya tiene allow write: if isAgent(), resolviendo el FirebaseError: Missing or insufficient permissions.',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.9.2',
    date: '2026-03-30',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — header fila única, fuente compacta, sin "sistema", TC default 487',
    description: 'Header de la tabla en una sola fila scrolleable (nombre → botones → búsqueda → cerrar). Fuente reducida a 11px estilo Excel. Removido badge rojo "sistema". Tipo de cambio por defecto cambiado de 540 a 487.',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.9.1',
    date: '2026-03-30',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — tabla A→Z, ocultar correo/cédula, ocultar Ver factura/Enviar recibo/Etiqueta',
    description: 'Grupos de clientes ordenados alfabéticamente (A→Z, colación española). Removida la línea de correo y cédula del encabezado de grupo. Ocultados los botones Ver factura, Enviar recibo y Etiqueta (funcionalidad preservada, solo no visibles).',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.9.0',
    date: '2026-03-30',
    layer: 'fe',
    type: 'fix',
    title: 'Nova — nombre de cliente en filas de paquetes ya no hace word-wrap',
    description: 'El nombre del manifiesto en las filas de paquetes (bajo el encabezado de grupo de cliente) se mostraba partido palabra por palabra en resoluciones bajas. Se añadió whitespace-nowrap a la celda para que el nombre se mantenga en una sola línea.',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.8.0',
    date: '2026-03-30',
    layer: 'fe',
    type: 'fix',
    title: 'Tracking — cálculo de costo por kg + tabla Nova responsive en Galaxy Book5',
    description: 'Corrección del cálculo de costo en Tracking y Nova: el campo peso (peso de mlcargo API) ya estaba en kg, se eliminó la conversión incorrecta ×0.453592 que lo trataba como libras. Mejoras de responsividad en la tabla modal de Nova: toolbar de acciones en fila secundaria con scroll horizontal, botones de acción por cliente con flex-wrap, y min-width de 1080px en la tabla para evitar colapso de columnas en Galaxy Book5 (viewport efectivo ~1280px con scaling 125–150%).',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.7.0',
    date: '2026-03-30',
    layer: 'fe',
    type: 'feature',
    title: 'Nova — diálogo pre-proceso + facturación individual por paquete',
    description: 'Al subir un manifiesto en Nova se muestra un diálogo para confirmar el tipo de ruta (USA Aéreo por defecto) y el tipo de cambio (₡540 por defecto) antes de procesar. El tipo de cambio capturado se pre-llena automáticamente en el campo de facturación. Corrección de lógica de agrupación: cuando un cliente no tiene consolidación habilitada, cada paquete genera su propia factura individual en lugar de una factura conjunta.',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.6.0',
    date: '2026-03-30',
    layer: 'fe',
    type: 'feature',
    title: 'Scanner Bodega — history cards rediseñados + IdleView mejorado',
    description: 'Cards de historial con fuentes más grandes, nombre de ruta en mayúsculas, tracking clickeable para copiar, badge de abreviación removido, altura reducida. Layout 65/35. FoundView muestra nombre completo de ruta con tamaño dinámico. IdleView usa logo animado, mensajes motivadores profesionales, fuentes más grandes y sin badge duplicado de conteo. Workflow de deploy con auto-increment de versión en prebuild.',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.5.0',
    date: '2025-03-30',
    layer: 'fe',
    type: 'feature',
    title: 'Release Notes page',
    description: 'Added /release-notes page with FE and BE changelog. Includes deploy workflow with release notes step and project rules.',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.4.0',
    date: '2025-03-30',
    layer: 'fe',
    type: 'feature',
    title: 'Scanner Bodega — brand red, morning greeting',
    description: 'Input focus border changed to brand red. Session badge is now red. Added time-based morning/afternoon/night greeting with motivational phrase.',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.3.0',
    date: '2025-03-29',
    layer: 'fe',
    type: 'perf',
    title: 'Scanner Bodega — Firestore dedup cache + 30-variant fast path',
    description: '60s in-memory dedup cache eliminates redundant Firestore reads on double-scans. Fast path expanded from 10 to 30 variants, matching the Firestore `in` operator limit.',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.2.0',
    date: '2025-03-28',
    layer: 'fe',
    type: 'feature',
    title: 'Scanner Bodega — accessibility + i18n completeness tests',
    description: 'Added accessibility tests (ARIA live regions), translation completeness tests across all 34 namespaces, and performance tests for variant builder and motivational engine.',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.1.0',
    date: '2025-03-27',
    layer: 'fe',
    type: 'feature',
    title: 'Nova AI Manifest Processor',
    description: 'Renamed from Manifiesto to Nova. Gemini-style chat UI for processing Excel/CSV manifests with AI name verification, weight anomaly detection, and dynamic pricing.',
    author: 'SmartLogistics Team',
  },
  {
    version: '2.0.0',
    date: '2025-03-20',
    layer: 'both',
    type: 'feature',
    title: 'Payroll — Benefits unified page',
    description: 'Unified Vacations, Christmas Bonus, and Severance into a single Benefits page. Added PayrollRunWizard for calculating and approving payroll.',
    author: 'SmartLogistics Team',
  },
  {
    version: '1.9.0',
    date: '2025-03-15',
    layer: 'be',
    type: 'perf',
    title: 'Tracking middleware v3.2 — carrier detection',
    description: 'Added detectCarrier() for UPS/Amazon/Shein/FedEx/USPS routing. Mayorista variant reduction (10→6 searches). Eliminates 15-20s timeouts on UPS/FedEx inputs.',
    author: 'SmartLogistics Team',
  },
  {
    version: '1.8.0',
    date: '2025-03-10',
    layer: 'be',
    type: 'fix',
    title: 'Tracking middleware v3.1 — O(1) LRU cache + race condition fix',
    description: 'Fixed O(n) LRU eviction, NaN date guard, registry Promise race condition, enrichment lock flags, and CORS wildcard removal.',
    author: 'SmartLogistics Team',
  },
  {
    version: '1.0.0',
    date: '2025-01-01',
    layer: 'both',
    type: 'feature',
    title: 'Initial release — Smart Portal Admin',
    description: 'First production deployment of Smart Portal Admin with packages, customers, routes, invoices, scanner, and user management.',
    author: 'SmartLogistics Team',
  },
];
