# Changelog

All notable changes to the **Smart Portal 1 (Admin/Nova)** project will be documented in this file.

## [0.0.1598] - 2026-09-04

### Fixed & Hardened (Payroll Unpaid Leave Calculation & Terminology Alignment)
- **Corrección en Cálculo de Solapamiento de Fechas (`PayrollRunWizard.tsx`):**
  - Corregido error en `getOverlapDays` que causaba la duplicación de días al comparar límites horarios (`00:00:00` vs `23:59:59` con `+ 1`), asegurando que permisos de 1 día (o cualquier número registrado) retornen exactamente la cantidad correcta de días sin duplicarse.
  - Implementado límite estricto con `leave.days` como salvaguarda adicional.
- **Corrección en Fórmula de Deducción Semanal de Permisos sin Goce (`PayrollRunWizard.tsx`):**
  - Eliminada la división indebida entre `4.33` sobre la deducción por ausencia; el sistema ahora rebaja la tarifa diaria completa ($\text{Salario Base Mensual} / 30$) en la semana en la que ocurrió el permiso.
- **Actualización de Terminología (`PayrollRunWizard.tsx`, `PayrollBenefits.tsx`):**
  - Reemplazado `Dcto. Suspensión` por `Rebajo sin Goce: -₡... (X días)` en el asistente de nómina.
  - Actualizado a `Rebajo Permiso sin Goce` en las colillas/boletas de pago oficiales HTML y previas de correo.
  - Actualizados los títulos y textos de ayuda en el modal de gestión de permisos sin goce a `Días sin Goce de Salario` y `Escriba el motivo del permiso sin goce / rebajo...`.
- **Suite de Pruebas Automatizadas y Certificación:**
  - Creada nueva suite de pruebas en `client/pages/payroll/__tests__/PayrollUnpaidLeaveCalculations.spec.ts`.
  - 179 suites y 2.390 pruebas pasando al 100% (0 errores, 0 regresiones).

## [0.0.1595] - 2026-08-26

### Fixed (Scanner-Standard Route Abbreviations in Driver Route Sessions)
- **Alineación de Abreviaciones de Rutas con el Escáner (`DriverRouteWizard.tsx`):**
  - Actualizado el diccionario y lógica de mapeo de rutas para reflejar las abreviaciones oficiales del escáner y bodega: `Cartago 1` → `C1`, `Cartago 2` → `C2`, `Heredia` → `H`, `Alajuela` → `A`, `San Jose Centro` → `SJ`, `San Jose Escazu` → `SJ-E`, `San Jose Coronado` → `SJ-C`, `Occidente` → `OCC`, `Encomiendas` → `ENC`, `Retira` → `RET`.
  - Soporte completo para sesiones multi-ruta combinadas (ej. `Cartago 1 + Cartago 2` → `C1 + C2`).
- **Certificación de Pruebas Automatizadas:**
  - 18 pruebas unitarias del módulo de rutas pasando al 100% con 0 errores.

## [0.0.1594] - 2026-08-26

### Fixed (Route Session Manifest Loading Resolution)
- **Corrección de Carga de Manifiestos en Sesiones de Ruta (`DriverRouteWizard.tsx`):**
  - Restaurada la importación faltante de `getRecentManifests` requerida para la inicialización y consulta de manifiestos disponibles en el asistente de ruta del chofer (`StartRouteWizard`).
  - Resuelto error en tiempo de ejecución (`ReferenceError: getRecentManifests is not defined`) que impedía listar manifiestos al iniciar sesión de ruta.
- **Certificación de Pruebas Automatizadas:**
  - 18 pruebas del módulo de rutas pasando al 100% con 0 errores.

## [0.0.1590] - 2026-08-25

### Added & Hardened (Universal Costa Rica District Parser & Relocated Muted Gray District Badge in Customer Card)
- **Motor Universal de Extracción de Distritos de Costa Rica (`location-utils.ts`):**
  - Mapeo y análisis inteligente de distritos y cantones costarricenses a partir de direcciones geocodificadas con Plus Codes (ej. `Concepción`, `Sabanilla`, `Curridabat`, `Carmen`, `Guadalupe (Arenilla)`, `San Rafael`).
  - Extracción automática y transparente para el 100% de los clientes en sesión de ruta, sin importar si el campo de distrito viene vacío en la base de datos.
- **Reubicación y Estilo Gris Muted del Badge (`DriverRouteWizard.tsx`):**
  - Trasladado a la fila intermedia de insignias (`[SL] [Ruta] [Consolida] [X PKGS] [📍 DISTRITO]`) con estilo gris muted neutro.
- **Certificación de Pruebas Automatizadas:**
  - 178 suites de prueba pasando al 100% con 0 errores y 0 regresiones.

## [0.0.1588] - 2026-08-25

### Added & Hardened (District Badge in Customer Card, Exact Address Row & Multi-Manifest Tabs in Route Sessions)
- **Insignia de Distrito en Tarjetas de Clientes (`DriverRouteWizard.tsx`):**
  - Incorporado el badge de distrito (`MapPin`) junto a la píldora de precio en la tarjeta de cliente para identificación geográfica inmediata por parte del chofer.
- **Dirección Completa en Tarjetas de Parada (`DriverRouteWizard.tsx`):**
  - Renderizado de la dirección exacta de entrega con icono de ubicación y apertura automática de coordenadas o búsqueda de dirección en Google Maps.
- **Filtro y Píldoras de Múltiples Manifiestos (`PackageList`):**
  - Generación dinámica de pestañas de filtrado por manifiesto (`Todos`, `MAN-1`, `MAN-2`) para sesiones donde el chofer carga paquetes de más de un manifiesto, con contadores en tiempo real de clientes y paquetes `(X c · Y p)`.
- **Certificación de Pruebas Automatizadas:**
  - 177 suites de prueba y 2,371 tests pasando al 100% con 0 fallos y 0 regresiones.

## [0.0.1586] - 2026-08-25

### Added & Hardened (Nova Print Alignment with Returns & Invoices, Live Customer Search & 2s Debounce)
- **Alineación de Impresión de Manifiestos de Ruta y Boletas de Bodega en Nova (`NovaTableModal.tsx`, `nova-print.ts`):**
  - Consulta en tiempo real a las colecciones `invoices` y `packages` de Firestore (`fetchManifestPrintEnrichment`).
  - Agrupación automática de múltiples facturas por cliente en la sublínea (`#FAC-...`), suma total en USD y CRC calculada con el tipo de cambio oficial.
  - Detección de paquetes devueltos/reasignados en tiempo real con insignias `+X` en la cabecera del cliente, badge de manifiesto de origen (`ret-mani-badge`) y desglose de precios unitarios.
  - Boletas de bodega estándar y ALFA enriquecidas con insignias `DEV` y origen de manifiesto.
- **Búsqueda Resiliente de Clientes en Tiempo Real (`use-customer-search.ts`, `typeahead-search.ts`, `customer-loader.ts`):**
  - Fallback en tiempo real consultando `customers` en SP1 y `users` en SP2 (`dbSP2`) cuando se busca un cliente recién creado (ej. `SL262273` - Blanca Flor Ramirez Ugalde) no presente en la caché en memoria.
  - Inyección dinámica e instantánea en memoria (`injectCustomerIntoCache`) para disponibilidad O(1) inmediata en toda la sesión de Nova.
  - Soporte de rutas automáticas por encomienda (`encomienda`, `encomiendaName`, `defaultRoute`).
- **Control de Búsqueda y Debounce de 2 Segundos (`NovaCustomerSearchModal.tsx`, `use-customer-search.ts`):**
  - Debounce configurado a 2.0 segundos (2000 ms) tras detener la escritura.
  - Ejecución inmediata al presionar la tecla `Enter`.
- **Certificación de Pruebas Automatizadas:**
  - 177 suites de prueba y 2,369 tests pasando al 100% con 0 fallos y 0 regresiones.

## [0.0.1575] - 2026-08-24

### Fixed & Hardened (Source Invoice Auto-Annulment on Move to Consolidación Transitoria & SP2 Sync)
- **Anulación Automática y Sincronización Integral al Mover a Consolidación Transitoria (`MoveManifestDialog.tsx`, `BulkMoveDialog.tsx`, `manifest-consolidation-service.ts`, `EncomiendaManifests.tsx`):**
  - Removida la restricción `isConsolidation: true` que impedía la anulación de facturas estándar al trasladar paquetes a *Consolidación Transitoria*.
  - Implementada búsqueda directa por `pkg.invoiceId`, `slCode` y `trackingNumber` con consultas por lotes (`chunk` de 30) sin bucles $N+1$, garantizando costo mínimo en Firestore.
  - Al trasladar paquetes a transitoria, las facturas origen se actualizan inmediatamente a `status: 'annulled'`, registrando `annulledAt` y `cancelReason`.
  - Disparo automático de `deleteInvoiceFromSp2` para eliminar de forma inmediata la factura del portal del cliente en SP2 y desvincular los envíos (`invoiceId: null`, `invoiceReady: false`), eliminando cobros huérfanos.
- **Actualización Reactiva en UI de Facturas (`Invoices.tsx`):**
  - Actualización optimista de `liveInvoiceData` en `handleAnnulInvoice` para que las facturas anuladas reflejen su estado en la tabla de inmediato sin depender de recargas de red.
- **Certificación de Pruebas Automatizadas:**
  - 175 suites de prueba y 2,344 tests pasando al 100% con 0 fallos y 0 regresiones.

## [0.0.1573] - 2026-08-20

### Optimized & Hardened (Nova Customer Search Modal — Zero AI, In-Memory Typeahead, Route Colors & Tests)
- **Eliminación Total de IA y Consultas Firestore por Tecla (`use-customer-search.ts`, `NovaCustomerSearchModal.tsx`):**
  - Removidos los llamados a Gemini AI y las consultas de red por cada tecla a Firestore (`searchCustomersFirestore`).
  - Implementada búsqueda instantánea en memoria (100% client-side index lookup via `searchCustomersLocal`) con debounce de 120 ms.
  - Agregada caché en memoria para asociaciones de Nova Learning (`learningAssociationsCache`), garantizando 0 lecturas repetidas a Firestore.
  - Resolución síncrona en $0\text{ ms}$ del cliente actualmente vinculado en el montaje del modal.
- **Mejoras de Diseño y UX:**
  - Badges de ruta con colores Tailwind oficiales según [`route-colors.ts`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/utils/route-colors.ts).
  - Badge de consolidación estandarizado a cyan/azul (`bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30`).
  - Navegación fluida por teclado (flechas ↑ ↓ para navegar, Enter para seleccionar, Esc para cerrar).
  - Resuelto warning de React fiber queue portalizando limpiamente sin wrappers redundantes de `AnimatePresence`.
- **Suite de Pruebas Automatizadas:**
  - Creada suite [`NovaCustomerSearchModal.spec.tsx`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/components/nova/__tests__/NovaCustomerSearchModal.spec.tsx) con 8 tests unitarios.
  - 175 suites de prueba y 2,344 tests pasando al 100% con 0 fallos.

## [0.0.1572] - 2026-08-20

### Fixed & Hardened (Invoice Annulment Modal — Wide Layout, Zero-Jump & ManifestPicker)
- **Rediseño Amplio y Fluido de `InvoiceConfirmationDialog` (`InvoiceConfirmationDialog.tsx`, `alert-dialog.tsx`):**
  - Removido el tope `sm:max-w-lg` en `AlertDialogContent` y asignado ancho expansivo (`sm:max-w-[880px] md:max-w-[920px] lg:max-w-[960px]`) para eliminar scrolling y evitar truncado de texto.
  - Integración nativa de `ManifestPicker` con `singleSelect={true}`, alineación `start` y ancho completo sin desbordamientos.
- **Eliminación Total de Brinco Visual / Cumulative Layout Shift:**
  - Resolución síncrona en $0\text{ ms}$ del estado de consolidación del cliente desde el índice en memoria (`getCustomerBySlCode`), eliminando recargas tardías o parpadeos en el diálogo.
  - Tarjetas de opción superior simétricas con altura fija y área de configuración contextual inferior.
  - Textos informativos de anulación claros, directos y coherentes tanto para el modo consolidación como para la reasignación de manifiesto.
- **Suite de Pruebas Automatizadas:**
  - Creada suite [`InvoiceConfirmationDialog.spec.tsx`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/pages/invoices/components/modals/__tests__/InvoiceConfirmationDialog.spec.tsx) validando renderizado, selección de modos, interacción con `ManifestPicker`, warning/checkbox de consolidación y callbacks de confirmación.
  - 174 suites de prueba y 2,336 tests pasando al 100% con 0 fallos y 0 regresiones.

## [0.0.1571] - 2026-08-20

### Fixed & Hardened (Consolidation Manifests - Isolated Per-Package Timers)
- **Aislamiento e Inmutabilidad de Fechas de Consolidación ("Día 0 / Día 1") (`ConsolidationCustomerCard.tsx`, `getConsolidationStartDate`):**
  - Implementado extractor determinístico por paquete que calcula de forma 100% aislada la fecha de inicio (`Día 1: DD/MM/YYYY`), días transcurridos y período de gracia para cada paquete dentro del grupo del cliente.
  - La anulación de facturas de entrega o delivery posteriores para nuevos paquetes del mismo cliente ya no resetea ni sobreescribe el contador de consolidación de paquetes previos.
  - Búsqueda cronológica en el historial de auditoría (`statusHistory`) y en el campo inmutable `firstConsolidatedAt` para garantizar la fecha real de ingreso o anulación de cada paquete individualmente.
- **Inviolabilidad de `firstConsolidatedAt` en Handlers de Anulación y Reasignación:**
  - Blindados los flujos de anulación de facturas en [`Invoices.tsx`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/pages/invoices/Invoices.tsx), [`ConsolidationInvoiceRow.tsx`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/pages/consolidation/components/ConsolidationInvoiceRow.tsx), [`ConsolidationCustomerCard.tsx`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/pages/consolidation/components/ConsolidationCustomerCard.tsx), [`invoice-service.ts`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/invoice-service.ts), [`ReturnedPackages.tsx`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/pages/consolidation/ReturnedPackages.tsx) y [`consolidation-carry-on-service.ts`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/consolidation-carry-on-service.ts) para preservar `firstConsolidatedAt` sin sobreescrituras.
- **Suites de Pruebas Automatizadas (2,330 tests certificados):**
  - Añadidas pruebas unitarias en [`ConsolidationCustomerCard.spec.tsx`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/pages/consolidation/components/__tests__/ConsolidationCustomerCard.spec.tsx) validando tarjetas con múltiples paquetes y fechas de consolidación independientes.
  - 173 suites de prueba y 2,330 tests pasando con 0 fallos y 0 regresiones.

## [0.0.1570] - 2026-08-20

### Fixed & Hardened (SP2 Customer Resolution & Ultra-Fast Scanner Bodega)
- **Resolución Resiliente de Clientes SP2 (`customer-loader.ts`):**
  - Extendido `findCustomerBySlCode(slCode)` para consultar la colección `users` de SP2 (`dbSP2`) cuando un cliente no se encuentra en SP1 o aparece marcado como eliminado.
  - Inyecta el resultado en memoria en $O(1)$ (Zero-Overcost) para que paquetes subsecuentes no requieran consultas adicionales.
  - Los paquetes pre-alertados se graban con el nombre real del cliente (`customerName: "HORACIO FERNÁNDEZ"`), `slCode: "SL26742"` y `ruta: "OCCIDENTE"`, eliminando el fallback `"Cliente Pre-alertado (SL...)"`.
- **Aceleración Ultra-Rápida y Auto-Reparación en Scanner Bodega (`ScannerBodega`, `views.tsx`, `HistoryCard.tsx`, `search.ts`):**
  - **Multi-Indexación en Memoria ($O(1)$):** Indexación de tracking exacto, tracking limpio, eliminación de prefijos GS1-128 (`420...`) y sufijos numéricos de 6 a 12 dígitos para resolución instantánea a $0\text{ ms}$ sin consultas a Firestore ni Cloud Functions.
  - **Auto-Reparación en Caliente:** Si un paquete existente tenía `"Cliente Pre-alertado (SL26742)"`, el scanner consulta su índice de clientes y muestra de inmediato `HORACIO FERNÁNDEZ` en la tarjeta central y en el historial lateral, actualizando el documento en Firestore en segundo plano.
  - **Pre-carga en Montaje y Audio No-Bloqueante:** Se inicializa `loadCustomers()` al abrir la pantalla de bodega y se cancela la cola de audio previa (`speechSynthesis.cancel()`) antes de cada locución.
- **Suites de Pruebas Automatizadas (2,328 tests certificados):**
  - Creadas suites [`customer-loader-sp2.spec.ts`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/matching/__tests__/customer-loader-sp2.spec.ts) y [`scanner-bodega-speed-and-autoheal.spec.tsx`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/pages/scanner/bodega/__tests__/scanner-bodega-speed-and-autoheal.spec.tsx).
  - 173 suites de prueba y 2,328 tests pasando al 100% con 0 fallos y 0 regresiones.

## [0.0.1561] - 2026-08-19

### Fixed & Hardened (Matching Engine & Manifest Ingestion)
- **Veto de Género y Nombres de Pila Distintos (`gender-name-guard.ts`, `algorithms.ts`, `normalize.ts`, `parser.ts`):**
  - Creado módulo determinístico `areDistinctGivenNames(a, b)` con tabla bidireccional $O(1)$ de pares de género opuesto y nombres distintos (*DANIEL ↔ DANIELA, VICTOR ↔ VICTORIA, MARIO ↔ MARIA, GABRIEL ↔ GABRIELA, etc.*).
  - Bloqueada la distancia Levenshtein $\le 1$ y la regla de abreviación de prefijos en `tokensMatch` e `isAbbreviationOf` para evitar tratar diferencias de género como typos.
  - Integrado en `isDivergentMatch` para vetar agrupaciones divergentes en la tabla Nova (`NovaTableModal.tsx`).
- **Protección de Tokens Únicos Aislados en Historial e Ingestión (`batch-matcher.ts`, `parser.ts`):**
  - Añadida barrera estricta `AUTO_ACCEPT_MIN_TOKENS (2)` en Pass 1.5 (historial de paquetes) y en el Paso 9 del parser. Nombres de una sola palabra aislada (ej. `VICTOR`) nunca reciben scores de 99% ni auto-asignación y se retienen desvinculados (`[sin registro]`) para revisión del operador.
- **Soberanía Absoluta de Reglas de Admin en Nova Learning (`batch-matcher.ts`):**
  - Eliminado el requisito arbitrario de $\ge 3$ hits para registros con `source: 'admin'`. Toda asignación humana es ley absoluta inmediata en el Paso 0/1 y no se cuestiona ni aborta por falsas colisiones algorítmicas de clientes con una palabra compartida (ej. `MARIA JOSE` → `MARIA JOSE PICON CHAVES SL26116`).
  - Añadido filtro `isDivergentMatch` en las respuestas de IA (Pass 2a/2b) para descartar alucinaciones.
- **Consumo Estricto de Tokens y Veto de Apellido Paterno (`match-engine.ts`, `parser.ts`):**
  - Técnica 5 ahora consume tokens con `splice(idx, 1)` tras cada match, impidiendo que una sola palabra en el cliente satisfaga múltiples tokens repetidos del manifiesto (ej. `SOLIS SOLIS`).
  - Técnica 6b e `isDivergentMatch` penalizan y declaran divergente cualquier caso donde el manifiesto y el cliente tengan 2+ apellidos pero el apellido paterno principal sea incompatible (`BRYAN SOLIS SOLIS` vs `BRAYAN ROLANDO CONEJO SOLIS`).
- **Suites de Pruebas de Regresión Permanentes (2,213 tests certificados):**
  - Creadas suites [`gender-name-guard.spec.ts`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/matching/__tests__/gender-name-guard.spec.ts), [`incident-regressions-protection.spec.ts`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/matching/__tests__/incident-regressions-protection.spec.ts) y [`manifest-18-08-2026DAN-simulation.spec.ts`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/manifest-processor/__tests__/manifest-18-08-2026DAN-simulation.spec.ts).
  - 147 suites de prueba y 2,213 tests pasando al 100% con 0 fallos y 0 regresiones.

### Added & Guaranteed
- **Motor Central de Zona Horaria Costa Rica (`America/Costa_Rica` - UTC-6):**
  - Creado módulo [`client/lib/utils/date-utils.ts`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/utils/date-utils.ts) con utilidades especializadas (`getCostaRicaDateParts`, `formatCostaRicaDate`, `formatCostaRicaDateTime`, `getCostaRicaTodayISO`, `parseDateSafe`, `extractDateFromInvoiceNumber`).
  - Blindada la generación de números de factura (`generateInvoiceNumber`) para extraer siempre el año, mes, día, hora, minuto, segundo y milisegundo en la hora local de Costa Rica, independientemente de la ubicación geográfica del administrador o navegador (por ejemplo, operando desde Japón UTC+9, Europa o EE. UU.).
  - Actualizado el formateo y renderizado de fechas en todos los módulos: `ClientLedger`, `Invoices`, `Nova`, `DriverRouteWizard`, `ShippingLabels`, `Encomiendas`, `GTIManifests`, `TempCustomers`, `ManifestsAdmin`.
  - Añadida suite de pruebas exhaustivas (`client/lib/utils/__tests__/timezone-exhaustive.spec.ts` y `date-utils.spec.ts`) validando paridad e invariancia en 6 zonas horarias globales (`Asia/Tokyo`, `Europe/London`, `America/New_York`, `Australia/Sydney`, `Pacific/Honolulu`, `UTC`) y garantizando compatibilidad retrospectiva con datos históricos.

## [0.0.1534] - 2026-08-17

### Fixed & Tested
- **Paridad de Zona Horaria en CI Pipeline (`safeFormatDate` en `invoice-service.ts`, `utils.spec.ts`):**
  - Configurada explícitamente la zona horaria `{ timeZone: 'America/Costa_Rica' }` en `safeFormatDate` para eliminar discrepancias entre entornos locales (UTC-6) y servidores de integración continua CI en GitHub Actions (UTC).
  - Certificadas las 1,935 pruebas unitarias y de integración (124 suites) con 100% de éxito.
- **Suites de Pruebas Unitarias de Autenticación y RBAC (`FirebaseAuthContext.spec.tsx`, `PermissionsContext.spec.tsx`):**
  - Añadida cobertura integral para el ciclo de vida de login/logout y permisos basados en roles (ADMIN, MANAGER, STAFF).


### Fixed & Improved
- **Visualización Completa y Dinámica de Códigos de Tracking (`DriverRouteWizard.tsx`):**
  - Eliminado el corte por elipsis (`truncate`) en los números de guía/tracking de paquetes.
  - Implementada escala tipográfica automática y adaptativa según la longitud del tracking (`break-all`, `text-xs`/`text-sm`/`text-base`) para garantizar lectura íntegra en cualquier dispositivo móvil.
  - Ajustadas las pestañas de navegación (`Por entregar` / `Entregados`) con `whitespace-nowrap` y padding responsivo.
- **Control de Visibilidad y Fallback Seguro de Fleet AI (`EntregasAdmin.tsx`, `FleetAIPanel.tsx`, `fleet-ai-service.ts`):**
  - Ocultación automática del panel `Fleet AI` y de los botones de análisis individual por chofer cuando la IA está inactiva, deshabilitada o carece de token válido.
  - Añadidas reglas de seguridad en `firestore.rules` para la colección `fleet_ai_analyses` con manejo resiliente ante fallos de red o de API externa.
- **Corrección de Reglas de Hooks en React (`ProtectedRoute.tsx`):**
  - Reubicada la llamada al hook `useLocation` en la cima incondicional del componente `ProtectedRoute`, eliminando advertencias de inconsistencia de hooks.
- **Preselección de Manifiesto Único y Captura Segura de Tablero (`DriverRouteWizard.tsx`, `route-ai-analyzer.ts`):**
  - Al crear una sesión de ruta, el selector de manifiestos ahora preselecciona por defecto únicamente el manifiesto más reciente (1 solo).
  - La captura de fotografía del tablero/odómetro se guarda limpiamente y sin alertas destructivas cuando el servicio de OCR/IA no está disponible, permitiendo al conductor continuar sin bloqueos.

### Fixed & Improved
- **Rediseño Segmentado de Pestañas de Entrega y Badges de Chofer (`DriverRouteWizard.tsx`):**
  - Implementado control de pestañas segmentado moderno e integrado (`Por entregar` vs `Entregados`) con micro-sombras, contadores de clientes y animación activa fluida.
  - Badge de cantidad de paquetes (`PKGS` / `PKG`) actualizado con fondo negro y tipografía blanca de alto contraste (`bg-black text-white`).
  - Badge de **`CONSOLIDA`** actualizado al tono azul rey característico (`#1d4ed8`) alineado con las boletas de ruta de Nova.

### Fixed & Verified
- **Verificación Integral de Módulos y Cero Regresiones (`PackagesDataTable.tsx`, `nova-print.ts`, `ReturnedPackages.tsx`, `RoutesManagement.tsx`):**
  - Validación del 100% de la suite de pruebas unitarias e integración (118 test files, 1,918 tests pasando en verde).
  - Compilación limpia de producción (`vite build`) verificando dependencias y tipos.
  - Blindaje completo del ciclo de vida de paquetes devueltos con facturas pagadas contra sobreescrituras accidentales y cobros duplicados.

## [0.0.1529] - 2026-08-17

### Fixed & Improved
- **Normalización de Estados y Badges en Tabla de Paquetes (`PackagesDataTable.tsx`, `StatusPopoverEditor.tsx`, `Packages.tsx`):**
  - Mapeo de sinónimos (`route`, `on_route`, `in_route`, `en_ruta`, `transit`, `held`) en `StatusPopoverEditor` y `PackagesDataTable`.
  - Los paquetes con estado `"route"` o `"on_route"` ahora muestran consistentemente la etiqueta traducida **"En Ruta"** con el badge cyan estilizado (`bg-cyan-200 text-cyan-900`) en lugar de texto plano sin formato.

### Fixed & Improved
- **Disposición Vertical de Metadatos en Filas de Tracking (`nova-print.ts`):**
  - Reestructurada la celda de tracking (`td.track-cell`) dividida en `<div class="track-main">` (código de tracking completo a ancho total) y `<div class="track-meta">` (badge de manifiesto de origen y factura debajo del tracking).
  - Evita truncamiento o desbordamiento en trackings largos (ej. 34 dígitos USPS) al ubicar el manifiesto y factura en su propia sublínea dentro de la misma celda.

### Fixed & Improved
- **Unificación de Celda de Firma en Boletas de Ruta (`nova-print.ts`):**
  - Implementado `rowspan="${g.rows.length}"` en la columna de firma (`td.sig`) para grupos con múltiples paquetes, combinando las filas en un solo recuadro continuo de firma por cliente en lugar de celdas fragmentadas.

### Fixed & Improved
- **Estilo Muted y Limpieza de Badges en Boleta de Ruta (`nova-print.ts`):**
  - Ajustado el color de la fuente de los números de factura a un tono muted formal (`color: #64748b`, `font-weight: 500`) en la cabecera de cada cliente.
  - Eliminado el flag `[D]` de las filas de tracking para evitar redundancia visual, manteniendo exclusivamente el badge con el manifiesto de origen (`.ret-mani-badge`) y el indicador compacto `+N` en la cabecera del cliente.

### Fixed & Improved
- **Claridad de Facturas y Aislamiento Estricto de Devoluciones (`nova-print.ts`, `RoutesManagement.tsx`, `ReturnedPackages.tsx`):**
  - Removido el prefijo `"Factura "` del subtítulo de la boleta de ruta, renderizando directamente los números de documento (`#SL...`) con tamaño de fuente mejorado (`7.5pt`, `font-weight: 600`, color `#444`) para alta legibilidad en impresión y vista previa.
  - Filtro estricto de paquetes devueltos (`isReturned === true || wasReturned === true || returnedAt || returnReason`): los paquetes de consolidación normal / carry-over ya no muestran flags `[D]` ni badges `+N`.
  - Persistencia explícita de `isReturned`, `wasReturned` y `originalManifest` al reasignar paquetes en `ReturnedPackages.tsx`.

### Fixed & Improved
- **Formato Limpio y Ajustado en Boleta / Manifiesto de Ruta (`nova-print.ts`):**
  - Ubicación de números de factura debajo del nombre del cliente en subtítulo atenuado (`.inv-subline`, `5.5pt`, `font-weight: 400`, color muted `#777`), eliminando badges invasivos y evitando sobrecarga visual.
  - Badge compacto `+N` (ej. `+1`) en cabecera de cliente exclusivamente cuando existen paquetes devueltos/reasignados en el grupo.
  - Desglose de precios y número de factura por línea en la tabla (`td.child-amt`, `.child-amt-split`) aplicado de manera estricta y exclusiva a grupos con paquetes devueltos; los clientes estándar mantienen sus líneas de tracking limpias sin repeticiones de factura.
  - Detección precisa y aislada de paquetes devueltos (`isReturned`, `isReassigned`, `originalManifest`), evitando falsos positivos `[D]` en paquetes regulares de la ruta.

### Fixed
- **Inmutabilidad y Preservación de Facturas en Devoluciones (`ReturnedPackages.tsx`):**
  - Se eliminó la anulación automática de facturas en estado `paid` asignadas por la administración al reasignar o re-consolidar paquetes devueltos.
  - Se preserva el vínculo a la factura existente (`invoiceId`, `invoiceNumber`, `invoiceStatus`) y sus importes/costos originales para evitar facturaciones duplicadas o alteraciones involuntarias.
  - Se optimizó la suscripción de `onSnapshot` para que los paquetes reasignados o entregados salgan de la vista reactivamente sin requerir recargar la página.
- **Soporte de Facturas Multi-Manifiesto (`invoice-service.ts`):**
  - `subscribeInvoicesByManifest` y `getInvoicesByManifest` ahora consultan tanto `manifestNumber` como el array `manifestNumbers` para detectar facturas asociadas a paquetes reasignados entre manifiestos.
- **Visualización de Factura por Línea en Nova Table (`NovaTableModal.tsx`):**
  - Búsqueda mejorada de factura asociada (`displayInv`) considerando `row.invoiceId`, `row.invoiceNumber` e ítems de factura (`items`, `invoiceItems`), permitiendo previsualizar el documento incluso en facturas pagadas previamente.
- **Agrupamiento y Visualización en Rutas (`RoutesManagement.tsx`):**
  - Carga reactiva de facturas referenciadas por paquetes del manifiesto y soporte multi-manifiesto para listar facturas separadas de forma limpia e independiente.

### Security & Reliability
- Blindaje de pruebas automatizadas con 118 suites en SP1 (1,913 tests) y 46 suites en SP2 (1,436 tests) pasando al 100%.

## [0.0.1485] - 2026-08-11

### Added
- **Metadatos de Origen en Carry-On:** Se muestra en el modal de Carry-on (`ConsolidationCarryOnDialog.tsx`) el manifiesto de origen y el número de factura anulada con badges detallados para cada paquete movilizado.
- **Indicador de Facturas Activas:** Se añadió un badge de advertencia verde indicando si el paquete se encuentra asociado a alguna factura activa.
- **Soporte de Búsqueda y Categorización (`ManifestPicker`):** Reemplazo del selector de manifiestos por el componente `ManifestPicker` con selección simple en el modal.

### Changed
- **Corrección de Zona Horaria a Costa Rica:** Se actualizó la zona horaria (`America/Costa_Rica` y locale `es-CR`) en `ConsolidationCustomerCard.tsx` y `ConsolidationInvoiceRow.tsx` para evitar desfases de fechas de "Día 1".
- **Registro Permanente de Anulaciones en DB:** Se modificaron todos los flujos de anulación de facturas (`Invoices.tsx`, `invoice-service.ts`, `route-session-service.ts`) para persistir `annulledInvoiceId`, `annulledInvoiceNumber` y `annulledAt` directamente en los documentos de paquetes en Firestore.

### Fixed
- **Resolución Retrospectiva Inteligente de Fecha:** Implementado escaneo y parseo mediante expresiones regulares sobre las notas del arreglo `statusHistory` en `ConsolidationCustomerCard.tsx` para deducir la fecha original de creación de la factura si los campos fueron eliminados físicamente de la base de datos (ej. caso `GFUS01063074222530`).
- **Capa y Capacidad de Visualización de Menús:** Añadida propiedad `z-[9999]` al `PopoverContent` del `ManifestPicker.tsx` para garantizar que la lista flote siempre por encima de las capas del modal de diálogo.

## [0.0.1483] - 2026-08-11

### Added
- **Pruebas y Verificación de Etiquetas de Encomienda:**
  - Añadida cobertura de pruebas unitarias robustas en `EncomiendaBulkLabelModal.spec.tsx` para validar la hidratación de la cola de impresión, las advertencias visuales del modal y los conteos de etiquetas masivas.

### Fixed
- **Impresión Masiva de Etiquetas de Encomienda (Fallbacks y Hojas Completas):**
  - Implementado fallback seguro (`ParcelPreview` alternativo con dirección y transportista en blanco) en `EncomiendaBulkLabelModal.tsx` cuando falla la búsqueda de un cliente no registrado, evitando que se omitan etiquetas en la impresión masiva.
  - Asegurado que todas las etiquetas de la cola (incluyendo fallbacks) se rendericen en el modal y se impriman al hacer click en "Imprimir todas", permitiendo a los operadores escribir los datos a mano y garantizando el total de hojas esperado por el cliente.
  - Resaltado visual en ámbar con el banner "FALTAN DATOS (IMPRIME EN BLANCO)" en el portal para distinguir las etiquetas incompletas.

## [0.0.1462] - 2026-08-11

### Added
- **Reglas de Consolidación Visuales y Cobros de Bodegaje:**
  - Carga reactiva de `grace_period_consolidation` y `storage_charge_daily` desde la configuración global en Firestore.
  - Implementación de fórmula de rangos dinámicos dividiendo la gracia (`gp`) en tres tercios iguales: Verde (días <= gp/3), Amarillo (advertencia, días > gp/3 y <= 2gp/3), y Rojo (alerta/bodegaje, días > 2gp/3).
  - Rediseño premium de badges: "Día 1" en azul con icono de calendario, "Días" con color dinámico según el rango, y cobro de bodegaje (ámbar intermitente con el importe acumulado y días vencidos) o estado de gracia.
  - Añadidas pruebas unitarias funcionales robustas cubriendo límites dinámicos, días nulos y fallbacks seguros ante falta de datos de fecha en `ConsolidationCustomerCard.spec.tsx`.

### Changed
- **Estampado de `invoicedAt` al Anular Facturas:**
  - Modificación de `recordDeliveryEvent` (scan de consolidación) y `closeRouteSession` en `route-session-service.ts` para inyectar `invoicedAt` (tomada de la fecha de creación de la factura `createdAt`) en el paquete y su registro espejo.
  - Actualización de `handleAnnulInvoice` en `Invoices.tsx` para estampar `invoicedAt` cuando el administrador mueve manualmente un paquete facturado a transitoria anulando la factura.
  - Actualización de las pruebas de integración en `route-session-service.test.ts` para certificar la inyección de `invoicedAt` tanto en scans normales como ante falta de facturas asociadas.

## [0.0.1461] - 2026-08-07

### Fixed
- **Filtrado de Códigos de Ruta en Nova:**
  - Se implementaron validaciones estrictas en `saveManifestRecord`, `ingestManifestToPackages` y `upsertManifestPackageOverrides` en `ingestion.ts` para asegurar que solo códigos de cliente reales (que comiencen con `"SL"`) se almacenen en el campo `slCode` de Firestore, previniendo la filtración de marcadores de ruta como identificadores de cliente.
  - Corrección en `ResultSummary` de `NovaTableModal.tsx` y `getEffSlCode` en `use-nova-resolved-rows.ts` para tratar marcadores no-SL como vacíos (`""`), impidiendo que paquetes sin registrar de la misma ruta se colapsen erróneamente en una única factura agrupada y preservando la integridad del agrupamiento por nombre en la tabla.
- **Hidratación en Carga de Manifiestos:**
  - Se agregó un efecto de hidratación de carga en `use-nova-customer-assignment.ts` que marca reactivamente como desvinculados (`unlinked`) a los paquetes cuyos códigos de cliente no inicien con `"SL"`, evitando que se mezclen registros al reabrir manifiestos guardados desde Firestore.
- **Curación y Saneamiento de Datos:**
  - Limpieza completa del paquete de Viviana Martínez (`SL6080`) en base de datos.
  - Remoción de 3 facturas borradores inválidas creadas por rutas (`Heredia-20260807082820936`, etc.) y desasociación de sus 6 paquetes.
  - Desvinculación definitiva del paquete de Vielka Rodriguez Campos (`SPXMIA013672607270015906`) de `SL26767` en la colección `packages` y en el manifiesto para mantener su estado de `sin registro`.

## [0.0.1454] - 2026-08-05

### Added
- **Bitácora de Auditoría para Forzado de Pre-alertas:**
  - Registro automático del evento `'pre_alert_bypass'` en `audit_logs` que documenta la reasignación de propietario cuando el administrador fuerza el guardado con conflictos, capturando el operador, manifiesto, tracking y detalles del dueño anterior y nuevo.

### Changed
- **Bypass de Pre-alertas en Tiempo Real y Auto-guardado:**
  - Se modificaron `handleIngest` y `handleIngestAndInvoice` en `NovaTableModal.tsx` para propagar la bandera `bypassIntegrity: true` cuando el operador fuerza el guardado manual desde el modal.
  - El auto-guardado en segundo plano (`useNovaAutoSave`) ahora es completamente no bloqueante: en lugar de fallar ante conflictos, filtra y omite la actualización en la colección global `packages` únicamente para las filas discrepantes, permitiendo persistir el manifiesto (`manifests/{mn}`) sin interrupciones.
  - Advertencia del modal de conflictos actualizada con un mensaje explícito sobre la exclusiva responsabilidad del administrador y el registro de bitácora.

### Fixed
- **Falsos Positivos de Pre-alertas Históricas en NovaTable:**
  - Modificación de la suscripción en vivo `watchTrackingPreAlerts` en `nova-tools.ts` para ignorar reactivamente pre-alertas en estados terminales (`delivered`, `returned`, `cancelled`, `annulled`, `void`), eliminando falsos positivos de trackings reciclados.

## [0.0.1452] - 2026-08-05

### Added
- **Herramientas de Recuperación y Corrección de Datos Históricos:**
  - Creación y ejecución del script de una sola ejecución (`scripts/heal_enc_megaman.ts`) para restaurar 39 paquetes huérfanos perdidos en la colección global para el manifiesto `ENC-MEGA-MAN-03-08-2026`.
  - Creación y ejecución de `scripts/blacklist_historic_deletions.ts` para registrar los 10 trackings eliminados históricamente por el administrador en la lista negra de `ENC-MEGA-MAN-03-08-2026`.
  - Creación y ejecución de `scripts/restore_single_pkg.ts` para restaurar el tracking `GFUS01063130163587` (Sharon Daniela) a petición de la administración, registrando de forma transparente la bitácora de restauración en `audit_logs`.

### Changed
- **Lista Negra de Trackings Eliminados (`deletedTrackings`):**
  - Implementación de una lista negra persistente en los manifiestos consolidados en Firestore (`deletedTrackingsSet`).
  - Filtrado en los sub-flujos de hidratación (`pkgsDirectFromCollection`, `sourcePkgsRaw`, `missingInvoiceTrackings`, y `embeddedSupplement`) en `loadMegaManFromFirestore` para ignorar trackings blacklisted, resolviendo definitivamente el loop de reaparición de filas eliminadas por el administrador.
  - Preservación del campo `deletedTrackings` durante la re-fusión en `fuseFirestoreManifests` para evitar que se pierdan las exclusiones previas al rehacer la consolidación.
- **Eliminación Atómica y Auditoría en Nova:**
  - Sincronización masiva de eliminaciones en lote (`handleIngest` y `handleIngestAndInvoice`), persistiendo los trackings eliminados en la lista negra en el documento de manifiesto, desasociando los paquetes en la colección global (`deletePackagesByTrackings`) y registrando logs en `audit_logs` con la acción `'package_deleted'`.

### Fixed
- **Protección contra Truncamientos en Tabla Nova (Filtros Activos):**
  - Modificación de la ingesta para usar el listado de filas completo (`manifestDocRows`) si no hay filas seleccionadas en la interfaz de usuario, protegiendo el manifiesto contra truncamientos accidentales cuando se guardan datos bajo filtros de tabla activos.

## [0.0.1450] - 2026-08-05

### Fixed
- **Protección contra Bloqueos en Nombres no Cadenas (Nova/Mega-Man):**
  - Se corrigió un error en el modal de desvinculación masiva (`NovaTableModal.tsx`) que provocaba un bloqueo de renderizado en React si el nombre del destinatario (`nombre`) era numérico, nulo o indefinido en el manifiesto. Se añadió conversión explícita y segura a `String` antes del recorte de caracteres.

## [0.0.1447] - 2026-08-05

### Security
- **Protección de Permisos en Firestore:**
  - Se modificaron las reglas de seguridad de Firestore ([firestore.rules](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/firestore.rules)) para validar de manera estricta los roles del token de Firebase Auth (`request.auth.token.role`).
  - Se restringieron las funciones auxiliares de roles `isAdmin()`, `isAgent()`, e `isDelivery()`, resolviendo el bypass de permisos que permitía a cualquier usuario autenticado realizar operaciones de administración, soporte o entrega.

### Added
- **Visualización Reactiva de Direcciones:**
  - Se añadió la visualización a tiempo real del listado de direcciones físicas registradas por el cliente en [CustomerDetailModal.tsx](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/components/customer/CustomerDetailModal.tsx) y [EditCustomerModal.tsx](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/components/customer/EditCustomerModal.tsx).

### Changed
- **Visualización Completa de Datos y Cero Ocultamientos Automáticos (Nova/Mega-Man):**
  - Se eliminó el filtro automático en el load-time (`ghostSet.has(trk)`) en `loadMegaManFromFirestore` para asegurar que el operador siempre vea todos los paquetes y totales, garantizando la integridad de datos en pantalla y el control 100% manual.
- **Desvinculación Lógica sin Pérdida de Datos (Nova/Mega-Man):**
  - Las eliminaciones de paquetes individuales y en bloque en Nova se realizan mediante desasociación lógica, preservando los registros e historiales en la base de datos global.
- **Trazabilidad en Desvinculaciones (Auditoría):**
  - Se agregaron logs de auditoría exhaustivos con `logAction` tanto para el éxito (`result: 'success'`) como para fallas (`result: 'error'`) en el borrado masivo de Nova.
- **Mensajes de Error Claros y Detallados:**
  - Se actualizaron todos los bloques de captura de errores de NovaTableModal para exponer el detalle real del error (`err.message`) en lugar de mensajes genéricos.
- **Resolución de Manifiesto de Origen al Desvincular:**
  - Soporte para múltiples variantes del manifiesto de origen (`originalManifestID`, `originalManifestId`, `originalManifest`) en `deletePackagesByTrackings`, asegurando la reversión correcta.
- **Degradación Graciosa de Inteligencia Artificial (Offline/Online Graceful Degradation):**
  - Implementación de resiliencia ante la desconexión, expiración o suspensión de la API Key de Gemini en los servicios de Flota, Rutas y Analíticas.
  - Actualización de [fleet-ai-service.ts](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/fleet-ai-service.ts), [route-ai-analyzer.ts](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/route-ai-analyzer.ts) y [useAnalytics.ts](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/hooks/queries/useAnalytics.ts) para que, en lugar de lanzar errores crudos de consola o causar bloqueos visuales, detecten la inactividad del servicio y muestren mensajes amigables en español al usuario final y choferes.
  - Prevención de fallos en el lector OCR de tableros del chofer alertando pasivamente: *"El lector inteligente de tablero está temporalmente inactivo. Por favor, ingresa los datos manualmente."*
  - Control de fallas en el panel de analíticas financieras y de flota mostrando avisos controlados sin interrumpir la operatividad general del sistema.
- **Sincronización Silenciosa y Automática de Rutas:**
  - Remoción por completo de checkboxes manuales de sincronización (`syncToSp2`) y ventanas modales de confirmación en [EditCustomerModal.tsx](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/components/customer/EditCustomerModal.tsx) y [NovaEditCustomerModal.tsx](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/components/nova/NovaEditCustomerModal.tsx).
  - Implementación de lógica reactiva que detecta cambios de ruta al guardar y activa automáticamente el flag de sincronización (`syncRutaToSp2 = true`) y los datos de auditoría correspondientes de forma transparente y sin fricciones de UI.
- **Corrección de dropdown de Ruta:**
  - Se corrigió el dropdown de ruta en [EditCustomerModal.tsx](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/components/customer/EditCustomerModal.tsx) para que pinte y cargue de forma inmediata el color correcto asignado en la base de datos desde el primer renderizado, eliminando retardos visuales o estados grises ("Sin Asignar").

- **Advertencia Visual Pasiva de Mismatch de Clientes:**
  - Se agregó una alerta visual de seguridad en la Nova Table ([NovaTableModal.tsx](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/components/nova/NovaTableModal.tsx)). Si un paquete del cliente A tiene asociada una factura del cliente B, la etiqueta de la factura se muestra en color ámbar/alerta con un icono `AlertTriangle` y un tooltip descriptivo, permitiendo al operador ver el conflicto de inmediato y solucionarlo manualmente.

### Fixed
- **Integridad de Pruebas Unitarias:**
  - Se actualizaron las especificaciones de prueba en [customer-sync.spec.ts](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/customer-sync.spec.ts) para validar el comportamiento automático e inmune de la propagación de rutas a SP2.
- **Asociación de Clientes en Consolidación (Mover bloque):**
  - Se corrigió un error crítico en [ConsolidationManifests.tsx](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/pages/consolidation/ConsolidationManifests.tsx) y [ConsolidationCustomerCard.tsx](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/pages/consolidation/components/ConsolidationCustomerCard.tsx) donde al hacer clic en "Mover bloque" (especialmente en bandejas compartidas como `CONSOLIDACION_TRANSITORIA`) el sistema intentaba adivinar el cliente por coincidencia de manifiesto, asociando erróneamente los paquetes y generando facturas en borrador para el primer cliente de la lista. Ahora se pasa explícitamente el `slCode` correcto desde el componente hijo.
- **Sincronización Opcional de Dirección de Entrega en Generación de Etiquetas:**
  - Se implementó la función `updateCustomerDeliveryAddress` en [customer-sync.ts](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/customer-sync.ts) que actualiza la dirección física del cliente en SP1 (colección `customers` y subcolección `addresses`) y la replica automáticamente al perfil y colección en SP2.
  - Se agregó un checkbox y mensaje de confirmación estilizados en el modal de Información de Entrega de [ShippingLabels.tsx](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/pages/shipping/ShippingLabels.tsx) para permitir al operador elegir si la edición de dirección debe persistir permanentemente en la base de datos sincronizada.
