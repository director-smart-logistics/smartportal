# Quitar el ingreso con Google en SP2 sin perder clientes

2026-09-26. Objetivo: que SP2 sea solo correo + contraseña. **No se quita el botón hasta que los clientes que solo usan Google tengan contraseña.**

## Quiénes se ven afectados (producción, solo lectura)

La auditoría es `node scripts/audit/audit-google-signin.cjs --prod`. La lista con nombre, correo, teléfono y último ingreso queda en `audit-output/google-signin-prod-<fecha>.md`; tiene datos personales y **no va a git**.

| Grupo | Cuentas | Qué pasa si se quita Google |
|---|---:|---|
| **A. Solo Google (sin contraseña)** | **687** (341 ingresaron en los últimos 90 días; 7 sin perfil en `users`) | **No podrían entrar.** Necesitan crear una contraseña antes. |
| B. Google + contraseña | 219 | Siguen entrando con correo y contraseña. Solo hay que avisarles. |
| C. Solo contraseña | 1.967 | No les afecta. |

## Cómo crea su contraseña un cliente de Google (ya existe en SP2)

1. En el login, el cliente toca **"Olvidé mi contraseña"** y escribe su correo de Google.
2. SP2 llama a `slEnablePasswordForEmail` (`src/functions/src/users.ts`), que habilita la contraseña en esa cuenta, y le envía el correo para crearla (`auth-service.ts`, restablecer contraseña).
3. El cliente crea su contraseña. Entra con correo + contraseña, con la **misma cuenta**: mismo SL, paquetes y facturas. No se crea una cuenta nueva.

El admin también puede asignar una contraseña desde el panel (`slAdminSetUserPassword`) si el cliente llama a servicio al cliente.

**Antes de campañas se verifica en el emulador** con una cuenta solo-Google: "Olvidé mi contraseña" → contraseña creada → ingresa y ve sus paquetes; el SL y el uid no cambian.

## Plan propuesto (cada paso con tu aprobación)

1. **Verificar en el emulador** el flujo anterior, de punta a punta.
2. **Aviso dentro de SP2:** a quien entre con Google, mostrarle un mensaje: "Pronto el ingreso será solo con correo y contraseña. Crea tu contraseña aquí" (usa el mismo flujo).
3. **Correo y WhatsApp al grupo A**, primero a los activos de los últimos 90 días (341), con el enlace para crear la contraseña. Luego a los demás.
4. **Guion para servicio al cliente:**
   - "Toque *Olvidé mi contraseña* y use el mismo correo de Google. Le llegará un enlace para crear su contraseña. Su casillero y paquetes siguen iguales."
   - Si no le llega: revisar spam; si aún así no llega, el admin le asigna una contraseña desde el panel.
5. **Seguimiento semanal:** volver a correr la auditoría y ver cuántos del grupo A siguen sin contraseña.
6. **Quitar el botón de Google** solo cuando el grupo A activo quede en cero, o en la fecha que decidas.
   - El login mantiene un mensaje para quien intente con Google: "Ahora ingresa con tu correo y contraseña. ¿No tienes contraseña? Toca *Olvidé mi contraseña*."
   - El proveedor Google en Firebase Auth se desactiva al final, no antes.
