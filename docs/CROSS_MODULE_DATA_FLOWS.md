# Mapa de Dependencias y Flujos de Datos entre Módulos

Este documento documenta la topología de interconexión, contratos de interfaz y ciclos de vida de estados compartidos entre todos los módulos de **Smart Portal 1** (`smart-portal-1`) y su sincronización bidireccional con **Smart Portal 2** (`smart-portal-2` / SmartWeb).

---

## 1. Diagrama de Flujo de Datos Principal

```
┌─────────────────────────┐
│     Pre-Alertas         │ ───► Coincidencia de Tracking & SL Code
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐      Ingesta de Archivos &
│    Manifest Processor   │ ───► Asignación de Códigos SL
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐      Escaneo Físico en Muelle
│    Scanner / Bodega     │ ───► Invarianza de Estado & Marca Temporal
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐      Agrupación de Paquetes,
│   Nova Consolidation    │ ───► Reglas de Exención e Impuestos
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐      Emisión, Anulación, Multi-Manifiesto,
│     Invoices Module     │ ───► Notificación WhatsApp/Email & Sync SP2
└─────┬─────────────┬─────┘
      │             │
      ▼             ▼
┌───────────┐ ┌───────────┐
│Encomiendas│ │   Rutas   │ ───► Despacho y Sesiones de Chofer
└─────┬─────┘ └─────┬─────┘
      │             │
      └──────┬──────┘
             ▼
┌─────────────────────────┐
│ SmartWeb / SP2 Sync     │ ───► Consistencia en Portal de Clientes
└─────────────────────────┘
```

---

## 2. Ciclos de Vida e Invariantes de Estado

### A. Ciclo de Vida del Paquete (`Package`)
1. **`pre_alerted`**: Registrado por el cliente antes de la llegada física al casillero de Miami.
2. **`received`**: Recibido y pesado en las instalaciones de origen (Miami).
3. **`in_transit`**: Asignado a un manifiesto aéreo/marítimo en vuelo hacia Costa Rica.
4. **`customs` / `retained`**: En inspección aduanal (marcado con `requiresPermit` o `DANP`).
5. **`arrived` / `processed`**: Desaduanado y procesado físicamente en bodega fiscal.
6. **`consolidated`**: Agrupado dentro de una factura de consolidación para un cliente con `consolidationEnabled: true`.
7. **`on_route`**: Asignado a una sesión activa de chofer en `route_sessions` para entrega final.
8. **`delivered`**: Entregado físicamente con comprobante/firma capturada en `DriverRouteWizard`.
9. **`returned`**: Paquete no entregado, devuelto a bodega para reintento o reasignación a `consolidacion_transitoria`.

### B. Ciclo de Vida de Facturación e Impacto Cruzado
* **Creación de Factura**:
  - Al generar una factura en `Nova` o `Invoices`, los paquetes vinculados actualizan sus campos `invoiceId`, `invoiceNumber`, `invoiceStatus` y `invoicedAt`.
* **Anulación de Factura (`status: 'annulled'`)**:
  - **Invariante Crítico**: Los paquetes asociados no se eliminan. Se desvinculan limpiamente reseteando `invoiceId: null`, `invoiceNumber: null`, `invoiceStatus: null`, y su manifiesto de origen se preserva en `originalManifestID` mientras su `manifestNumber` pasa a `consolidacion_transitoria` si el cliente consolida.
  - Se notifica inmediatamente al servicio de sincronización `syncInvoicesToSp2` y `pushStatusToSp2` para revocar la factura en el portal del cliente.
* **Modificación de Tipo de Cambio (TC) en Factura**:
  - Si el operador actualiza el TC en una factura con la opción `editTcAlsoPackages: true`, el nuevo tipo de cambio se propaga de forma atómica a todos los documentos de paquetes enlazados en Firestore.

---

## 3. Matriz de Dependencias entre Módulos

| Módulo Origen | Módulo Destino | Datos Compartidos | Protocolo de Comunicación |
| :--- | :--- | :--- | :--- |
| **Manifest Processor** | **Customers** | Creación / Búsqueda de clientes temporales (`temp-customers`) | Invocación asíncrona `createOrGetTempCustomer` |
| **Invoices** | **Packages** | Estado de facturación (`invoiceId`, `status`) | `WriteBatch` transaccional en Firestore |
| **Invoices** | **Consolidation** | Desvinculación hacia `consolidacion_transitoria` | `writeBatch` + actualización de `manifest_consolidation` |
| **Invoices** | **SP2 / SmartWeb** | Espejo de factura, desglose de ítems, totales | Cloud Function `slSyncInvoicesFromSp1` vía `syncInvoicesToSp2` |
| **Routes** | **Invoices** | Cobro contra entrega y conciliación de pagos | `onSnapshot` selectivo por `manifestNumber` |
| **Routes** | **Driver Sessions** | Coordenadas GPS, comprobante de entrega, kilometraje | Colección `route_sessions` con persistencia atómica |
| **Scanner Bodega** | **Manifests** | Paquetes esperados vs paquetes recibidos físicamente | Consulta $O(1)$ in-memory indexada por `manifestNumber` |
| **Pre-Alertas** | **Packages** | Auto-vinculación de tracking al momento de ingesta | Búsqueda multi-clave indexada en `canonicalizeTracking` |

---

## 4. Garantías de Consistencia y Recuperación de Fallos

1. **Defensa contra Conexiones Caídas**:
   Todos los servicios de red (`syncInvoicesToSp2`, `syncPackagesToSmartWeb`, `pushStatusToSp2`) envuelven las llamadas en bloques `try/catch` con logs de auditoría estructurados (`console.info` / `console.warn`) asegurando que una caída temporal de la red externa nunca bloquee la transacción local en Firestore.
2. **Cero Dependencia de Caché Estática**:
   El estado del sistema no depende de almacenamiento volátil o caches locales persistentes que puedan desincronizarse entre pestañas o usuarios concurrentes. Todo cambio se confirma atómicamente en Firestore y se propaga en tiempo real según la necesidad de la pantalla activa.
