# Guía de Arquitectura Global: Rendimiento, Calidad y QA

Este documento establece los estándares de ingeniería, patrones de diseño, optimizaciones de rendimiento, estrategias de control de calidad (QA) y pautas de mantenibilidad obligatorias para todos los módulos de `smart-portal-1` y `smart-portal-2`.

---

## 1. Contexto Arquitectónico Global

SmartLogistics opera sobre una arquitectura serverless híbrida (React + Firebase Firestore/Functions). En este tipo de entornos, la mantenibilidad a largo plazo y la eficiencia en el uso de recursos son críticas. Esta guía define los pilares para asegurar un sistema escalable, de alto rendimiento y libre de regresiones.

---

## 2. Estándares de Rendimiento en Frontend (UI/UX)

Para garantizar interfaces fluidas que respondan instantáneamente y no saturen el navegador del cliente, todos los módulos de la aplicación deben adherirse a los siguientes estándares de renderizado:

### A. Virtualización de Listas y Tablas (Virtualization)
* **Regla**: Cualquier tabla, listado o cuadrícula que deba renderizar más de **100 filas** de forma simultánea debe utilizar virtualización de filas (ej. `@tanstack/react-virtual`).
* **Justificación**: Renderizar cientos de elementos complejos satura el árbol DOM del navegador. La virtualización limita el renderizado físico únicamente a los elementos visibles, manteniendo el número de nodos DOM constante e independiente del tamaño del set de datos.
* **Caso de Estudio (Nova)**: Se implementó en `NovaTableModal` para manejar ~341 filas dinámicas sin degradación de velocidad.

### B. Aislamiento de Renders Volátiles (State Isolation)
* **Regla**: Las acciones locales en celdas (copiar texto, cambiar toggles, hovers) no deben gatillar re-renders en la tabla o contenedor padre.
* **Patrón**: Encapsula estos comportamientos en sub-componentes independientes y memoizados (usando `React.memo`).
* **Caso de Estudio**: El componente `<NovaCopyButton />` encapsula localmente el estado de confirmación de copiado, aislando los efectos secundarios y eliminando re-renders en el resto de la fila y la tabla.

### C. Desacoplamiento de Entradas de Usuario (Input Debounce)
* **Regla**: Los inputs que alteran estados de cálculo global o realizan filtrados complejos no deben enlazarse directamente a estados globales sincrónicos en cada pulsación de tecla (`onChange`).
* **Patrón**:
  1. Vincula el input a un estado de edición local y rápido en el componente.
  2. Implementa un debounce timer (de **300ms a 500ms**) para propagar el valor al estado global del negocio una vez que el usuario termine de escribir.
  3. Utiliza hooks como `useTransition` (React 18) si la actualización del cálculo pesado bloquea la UI principal.
* **Caso de Estudio**: El input de Tipo de Cambio en el pie de página de Nova usa un debounce de `400ms` para evitar congelamientos en la recomputación de colones.

### D. Memoización de Datos Derivados (`useMemo` / `useCallback`)
* **Regla**: Evita realizar bucles de reducción (`.reduce`), búsquedas complejas (`.find`), o mapeos repetitivos dentro del cuerpo principal de renderizado de la UI.
* **Patrón**: Envuelve toda la lógica de derivación en hooks `useMemo` y declara exhaustivamente sus arreglos de dependencias para asegurar que la recomputación ocurra únicamente cuando las fuentes de datos verdaderas cambien.

---

## 3. Estándares de Base de Datos y Red (Firestore/Functions)

Para garantizar consistencia, transaccionalidad y control de facturación en Cloud Firestore, aplicamos las siguientes directrices:

### A. Operaciones Atómicas y Escrituras en Lote (Write Batches)
* **Regla**: No envíes bucles de escrituras concurrentes (`Promise.all` con escrituras individuales).
* **Patrón**: Agrupa las escrituras en un `WriteBatch` de Firestore. Limita siempre el tamaño del lote a un máximo de **400 operaciones** (dejando un margen seguro por debajo del límite estricto de 500 de Firestore) para evitar desbordamientos del lote.
* **Idempotencia**: Diseña funciones de sincronización idempotentes. Utiliza el ID de la entidad origen como el ID del documento destino para asegurar que re-ejecutar una sincronización actualice el registro en lugar de duplicarlo.

### B. Suscripciones Efímeras en Tiempo Real (Scoped Listeners)
* **Regla**: Queda estrictamente prohibido mantener escuchas en tiempo real (`onSnapshot`) sobre colecciones completas en pantallas de alta densidad de datos.
* **Patrón**:
  1. Recupera los listados iniciales mediante consultas paginadas o búsquedas estáticas indexadas.
  2. Activa escuchas en tiempo real (`onSnapshot`) de forma efímera y acotada, por ejemplo, exclusivamente sobre el ID de un documento individual mientras un modal de edición esté abierto.
  3. Desconecta siempre el listener en el retorno de limpieza del efecto (`useEffect`) para evitar fugas de memoria y lecturas fantasma.

### C. Agregaciones con Contadores Atómicos (Counters)
* **Regla**: No consultes colecciones completas en el servidor solo para mostrar contadores o KPI métricas en paneles de inicio.
* **Patrón**: Mantén documentos de agregación consolidados (ej. `metadata/dashboard_counters`) y actualízalos de forma atómica en segundo plano a través de triggers de Cloud Functions utilizando `FieldValue.increment`.

---

---

## 4. Eficiencia en Costos Operativos y Seguridad (SecOps & Cost Control)

### A. Control de Costos en Base de Datos (Read/Write Optimizations)
* **Principio de Caché en Frontend**: Todos los hooks de datos deben estar integrados a nivel de cliente con políticas de caché coherentes (ej. React Query `staleTime` de 15s y `gcTime` de 5 minutos). Esto evita lecturas redundantes en Firestore al navegar rápidamente entre pestañas.
* **Peticiones por Lote e Ingestion Debouncing**: El guardado automático (Auto-Save) debe ser de bajo impacto (escribir solo el documento de metadatos o overrides del manifiesto) y debounced a un mínimo de 1.5s para agrupar múltiples pulsaciones en un solo Write.

### B. Seguridad del Software y RBAC (Role-Based Access Control)
* **Validación en Cliente y Servidor**: Las pantallas y rutas se protegen en el cliente mediante `<ProtectedRoute resource="nombre" />`. Sin embargo, la seguridad definitiva debe residir en las **Firestore Security Rules** y la verificación de Claims de tokens JWT en Cloud Functions.
* **Privilegios Mínimos**: Ningún usuario debe tener acceso de escritura directa a colecciones transaccionales (facturas firmadas, registros de auditoría) a menos que su claim de rol (ADMIN/MANAGER) esté explícitamente autorizado.

---

## 5. Resiliencia, Escape Hatches (Workarounds) y Control Total

Las automatizaciones inteligentes pueden fallar debido a variaciones en la data de proveedores externos (ej. formatos de Courier, nombres incompletos de clientes). Para evitar bloqueos operativos:

### A. Escape Hatches (Mecanismos de Escape)
* **Regla**: Toda automatización o asignación heurística (ej. coincidencia difusa de nombres) debe proveer una interfaz de anulación manual visible (Override).
* **Workarounds**: Si el matching algorítmico no detecta un cliente temporal, el operador debe poder forzar la asignación manual desde el buscador de clientes (`useNovaCustomerAssignment`).

### B. Resiliencia de Red y Caídas
* **Patrón**: El frontend debe implementar fallbacks defensivos. Si la lectura consolidada de contadores falla o el documento no está inicializado, el sistema debe caer automáticamente a consultas directas de conteo en la base de datos de desarrollo para mantener el Dashboard activo sin interrumpir la visualización.

---

## 6. Integridad de Datos y Cero Pérdida de Información

### A. Separación de Orígenes de Datos (Data-Origin Policy)
* **El Principio**: Los algoritmos automáticos (ej. autovinculadores de pre-alertas) **nunca deben sobreescribir** enlaces manuales previamente curados por un operador humano.
* **Implementación**: Separamos las políticas según el origen de la data (`fresh` importaciones vs `firestore` registros persistidos). Para datos provenientes de Firestore, los autovalidadores se apagan por defecto, protegiendo las decisiones previas del operador.

### B. Transacciones y Reversión ante Fallos (Rollback)
* **Regla**: En flujos complejos que modifican múltiples colecciones concurrentemente (ej. facturación masiva de paquetes), las escrituras deben realizarse mediante transacciones (`db.runTransaction`) o lotes atómicos. Si una sola operación falla, todo el lote debe revertirse (rollback) para evitar que queden paquetes facturados sin su factura correspondiente en Firestore.

---

## 7. Control de Calidad (QA) y Pipelines E2E

### A. Estrategia de Simulación de Autenticación (Mock Auth)
* Para acelerar las pruebas de extremo a extremo, todos los contextos de autenticación del sistema deben soportar un bypass de desarrollo local (ej. `window.__playwright_mock_auth__`). Esto permite a los frameworks de test simular roles y permisos de forma aislada y offline en menos de 2 segundos, eliminando cuellos de botella de red.

### B. Pipeline de QA Pre-despliegue
Antes de empaquetar y subir cambios a producción, se debe seguir estrictamente este flujo de validación:
1. **Typecheck**: `npm run typecheck` sin errores.
2. **Tests Unitarios**: `npm run test` con 100% de éxito.
3. **Tests E2E**: `npm run test:e2e` para validar flujos críticos sobre navegadores reales.
4. **CI/CD**: Las pruebas de extremo a extremo se autoejecutan en GitHub Actions mediante workflows configurados en `.github/workflows/` ante cada cambio a la rama principal.

---

## 8. Estándares de Normalización Temporal y Zona Horaria (`America/Costa_Rica` - UTC-6)

### A. Invarianza de la Zona Horaria del Cliente
* **Regla Obligatoria**: Queda estrictamente prohibido utilizar funciones directas de fecha local del navegador (`new Date().getHours()`, `new Date().getDate()`, `new Date().toLocaleDateString()` sin opciones) para generar identificadores de negocio, marcas de tiempo de facturación o renderizado de estados de cuenta.
* **Justificación**: SmartLogistics opera comercial y tributariamente bajo la zona horaria de Costa Rica (`UTC-6`). Si un usuario o administrador opera desde otra región (ej. Tokio UTC+9, Europa o EE. UU.), el uso de funciones locales del navegador produce discrepancias en los días de emisión y números de factura por cruce de medianoche UTC.
* **Patrón de Ingeniería**: Utiliza siempre el módulo canónico [`client/lib/utils/date-utils.ts`](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/utils/date-utils.ts) (`getCostaRicaDateParts`, `formatCostaRicaDate`, `formatCostaRicaDateTime`, `extractDateFromInvoiceNumber`).

### B. Generación Determinista de Identificadores
* **Regla**: Todo número de factura autogenerado (`generateInvoiceNumber`) debe descomponer sus partes temporales (año, mes, día, hora, minuto, segundo y milisegundo) evaluadas exclusivamente en `America/Costa_Rica`.
* **Compatibilidad Retrospectiva**: Al leer o procesar facturas históricas, el parser debe manejar de forma transparente tanto timestamps de Firestore como cadenas ISO y fechas pre-formateadas sin alterar su contenido original.


