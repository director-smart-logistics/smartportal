# Arquitectura de Entrega de Correos, Trazabilidad y Seguridad con Resend

Este documento describe la arquitectura técnica, los mecanismos de seguridad, las reglas de prevención de falsos positivos y la integración de webhooks entre **SmartLogistics Admin Portal (SP1)** y la **API de Resend**.

---

## 1. Arquitectura de Envío y Trazabilidad

```
[ Frontend: Facturas UI ] 
        │  (1) Click "Enviar" / "Reenviar"
        ▼
[ Cloud Function: sendInvoiceEmailFunction ]
        │  (2) resend.emails.send()
        ▼
[ Resend API Server ] ──(3) Retorna HTTP 200 con email_id ──► [ Cloud Function ]
        │                                                           │
        │ (4) Entrega a Servidor Destino                           │ (5) Retorna { success: true, messageId }
        │     (Gmail / Outlook / Hotmail)                          ▼
        │                                              [ Firestore "portal" / invoices ]
        │                                              - emailSent: true (solo si hay ID)
        │                                              - lastResendMessageId: "id"
        │                                              - emailStatus: "sent"
        │                                              - emailSendLogs: [...]
        │
        ▼ (6) Webhook Event (email.delivered, email.bounced, email.complained)
[ Cloud Function: resendWebhook ] (POST /resendWebhook)
        │
        ▼ (7) Actualización Atómica en DB "portal"
[ Firestore "portal" / invoices ]
        - emailStatus: "delivered" | "bounced" | "complained"
        - emailStatusUpdatedAt: Timestamp
        - emailStatusLogs: [...]
```

---

## 2. Prevención Estricta de Falsos Positivos

### Regla Fundamental: No Hay Envío Sin ID de Transacción
Históricamente, cualquier respuesta del servidor marcaba la factura con `emailSent: true` y `emailStatus: 'sent'` de forma optimista. Si la llamada no retornaba un ID de Resend válido, la interfaz mostraba falsamente el icono azul de "Enviado".

**Nueva Implementación**:
- Si `resendMessageId` es `null`, `undefined` o vacío:
  - `emailSent` se establece en `false`.
  - `emailStatus` se establece en `'failed'`.
  - El icono en la tabla se colorea en **🔴 Rojo** con alerta explícita: *"Sin confirmación de Resend (Fallo)"*.

---

## 3. Código de Colores y Trazabilidad en la UI (`InvoicesSpreadsheetRow.tsx`)

| Estado | Color del Botón | Outline del Tooltip | Criterio de Activación | Contenido del Tooltip (Hover) |
|---|---|---|---|---|
| **Confirmado** | 🟢 **Verde** (`emerald`) | `border-2 border-emerald-500` | Tiene `lastResendMessageId` válido, no rebotado y no marcado como spam. | - `✓ Correo entregado y verificado`<br>- 📅 Fecha y hora de envío<br>- 🔑 ID de Transacción Resend<br>- ✉️ Correo destinatario<br>- *"Haz clic para reenviar"* |
| **Fallo / Rebote** | 🔴 **Rojo** (`rose`) | `border-2 border-rose-500` | Correo rebotado (`bounced`), spam (`complained`), fallido (`failed`) o intento sin ID (`isFalsePositive`). | - `✕ Correo rebotado / Error en envío`<br>- Motivo claro del rechazo<br>- 📅 Fecha y hora del intento<br>- ✉️ Correo destinatario<br>- *"Haz clic para reintentar envío"* |
| **No Enviado** | ⚪ **Gris** (`muted`) | `border border-gray-300` | Factura nueva, borrador o sin historial de envíos. | - `Enviar correo`<br>- `La factura no ha sido enviada`<br>- Destino o alerta de correo no registrado |

---

## 4. Conexión del Webhook y Aislamiento Multi-Database

En Firebase Functions, la llamada `getFirestore()` sin argumentos apunta a la base de datos por defecto `(default)`. Sin embargo, los datos de producción de SP1 residen en la base de datos con nombre `"portal"` (`projects/smart-portal-admin/databases/portal`).

### Corrección en `resend-webhook.ts`:
```typescript
import { getApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Conexión explícita a la base de datos "portal"
const getPortalDb = () => getFirestore(getApp(), "portal");
```

### Máquina de Estados con Protección de Jerarquía (Anti Out-of-Order):
Los eventos de webhook pueden llegar desordenados por latencias de red (ej. `sent` llegando después de `delivered`). Para evitar regresiones de estado:

```typescript
const HIERARCHY: Record<string, number> = {
  sent: 10,
  opened: 20,
  clicked: 25,
  delivered: 30,
  bounced: 40,
  failed: 40,
  complained: 50,
};

// Si el evento entrante tiene menor jerarquía que el estado actual,
// se preserva el estado mayor en emailStatus y solo se agrega el log a emailStatusLogs.
const targetStatus = newRank >= currentRank ? statusLog.status : currentStatus;
```

---

## 5. Medidas de Seguridad Informática en Producción

1. **Aislamiento Total de API Keys**:
   - `RESEND_API_KEY` reside exclusivamente en `functions/.env` (en el entorno seguro de Cloud Functions) y está incluido en `.gitignore`.
   - **Cero fugas al bundle web**: El código cliente (`client/`) nunca importa ni conoce la API Key de Resend. Todas las operaciones pasan por Cloud Functions protegidas por Firebase Auth.
2. **Autenticación en Callable Functions**:
   - `slRefreshEmailStatus` y `syncEmailStatuses` requieren autenticación obligatoria (`request.auth`). Las tareas masivas exigen rol `ADMIN`.
3. **Verificación de Firmas de Webhook**:
   - Cuando se configura `RESEND_WEBHOOK_SECRET`, el webhook valida las cabeceras `resend-signature` con HMAC SHA-256 para prevenir ataques de suplantación.
