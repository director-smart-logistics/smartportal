# QA local de SP1 + SP2 juntos (emulador)

Sirve para probar **entre sistemas**, como en producción, pero sin tocar producción:
- manifiesto en Nova → pre-alertas de SP2 → factura en SP1 → sync a SP2;
- los clientes de SP2 → SP1.

---

## 1. Qué corre y dónde

Una sola sesión de emuladores, proyecto de prueba **`demo-sp-qa`**:

| Pieza | Dónde |
|---|---|
| Datos de **SP2** | Firestore, base `(default)` |
| Datos de **SP1** | Firestore, base `portal` |
| Funciones de **SP1 y SP2** | `http://127.0.0.1:5001/demo-sp-qa/us-central1/...` |
| Login (los dos sistemas) | Auth en el puerto 9099 |
| Interfaz del emulador | http://localhost:4000 |
| **App de SP1 (Nova)** | http://localhost:5174 |
| App de SP2 (opcional) | http://localhost:5173 (ver §3) |

Los disparadores de cada sistema escuchan **solo su base**. Verificado: una escritura en `portal`
dispara `onPackageWritten` de SP1, y la misma escritura en `(default)` no lo dispara.

---

## 2. Garantías de que no se toca producción

| Riesgo | Protección | Cómo se verificó |
|---|---|---|
| Llamar a un proyecto real de Google/Firebase | Proyecto `demo-*`: Google lo rechaza | — |
| Credenciales de Google en la máquina (`~/.config/gcloud`) | El emulador corre con una carpeta personal (`HOME`) **vacía**. Si al arrancar encuentra credenciales, **no arranca** | El primer intento se negó a arrancar; con `HOME` vacío la librería de Google no encuentra ninguna |
| Claves de producción en `.env` | Las funciones se cargan desde una carpeta generada con un `.env` **solo de QA**: sin Resend, sin Workspace, sin secretos reales, carriers bloqueados | `start.sh` §3 |
| SP1 escribiendo en el SP2 real | En el emulador, `SP2_PROJECT_ID` apunta al proyecto de prueba (`functions/src/config/sp2-target.ts`). **Fuera del emulador siempre es `smart-portal-2`** | `functions/test/sp2-target.spec.ts` |
| Nova leyendo pre-alertas del SP2 real | En modo emulador, `dbSP2` y las funciones también van al emulador (`client/lib/firebase/config.ts`). **Antes de este cambio, "modo emulador" seguía leyendo SP2 de producción** | Build de producción revisado: `DEV` es `false` → nunca entra al modo emulador |
| La app de SP1 llamando a servicios externos | `web-sp1.sh` reemplaza todas las `VITE_*` externas: sync a SP2 = local, Gemini/API/Supabase apagados | En la prueba de login, el navegador bloqueó y registró todo lo que no fuera local. Solo pasaron archivos públicos (fuentes y el cargador de la ventana de Google). **Ninguna** petición a Firestore, al login real ni a funciones reales |

**Límites conocidos:**
- `slMLockerProxy` y `slSendPasswordReset` de SP2 no se cargan: tienen el mismo nombre que las de
  SP1.
- Los usuarios de SP1 (staff) y de SP2 (clientes) comparten el emulador de login. En producción son
  proyectos distintos.
- Las reglas de seguridad de Firestore no se aplican: el emulador no permite reglas por base
  cuando hay dos bases.
- `functions/src/prealerts/sync.ts` tiene credenciales de ML Cargo y del portal mayorista escritas
  en el código. **No llamar `triggerPreAlertSync` en QA**: solo leería datos de tracking de esos
  proveedores.
- El manifiesto de ML Cargo no se descarga (ML Cargo está bloqueado). En Nova se carga **desde un
  archivo**.

---

## 3. Cómo se usa

```bash
# Terminal 1 — emuladores (SP1 + SP2)
scripts/qa-emulator/start.sh

# Terminal 2 — datos de prueba (con los emuladores ya listos)
scripts/qa-emulator/seed.sh

# Terminal 3 — Nova (SP1)
scripts/qa-emulator/web-sp1.sh          # http://localhost:5174

# Opcional — SP2 contra el mismo emulador
cd ../smart-portal-2 && VITE_USE_FIREBASE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-sp-qa npx vite --port 5173
```

**Entrar a Nova:**
1. "Continuar con Google". Se abre la pantalla de Google **del emulador**.
2. "Add new account", correo `admin@prueba.local`.

El sembrado crea la invitación ADMIN en `portal/pending_registrations`, que es el mismo
mecanismo que usa producción.

**Datos del sembrado:**
- Clientes SP2 `SL90001` (cédula 100090001) y `SL90002` (100090002). SP2 los sincroniza solo a SP1
  (`portal/customers`).
- Pre-alertas y paquetes con los casos reales:
  - FedEx de 12 dígitos dentro de un código de barras de 34;
  - USPS 420+ZIP;
  - paquetes entregados;
  - pre-alertas viejas y canceladas;
  - pre-alertas de otra cuenta.

---

## 4. Pruebas ya hechas entre sistemas

| Prueba | Resultado |
|---|---|
| Cliente creado en SP2 → SP2 lo empuja → aparece en `portal/customers` de SP1 | ✅ |
| Disparador de clientes de SP1 → consulta SP2 (emulado) | ✅ Sin credenciales y sin errores |
| Pre-alerta `877098560696` (SL90001) en SP2 → factura de SP1 con el código de barras `9632001960806794376300877098560696` → disparador de SP1 → `slSyncInvoicesFromSp1` de SP2 | ✅ Se liga al paquete pre-alertado por búsqueda en reversa: **un solo paquete** con la factura. SP1 la envió dos veces (crear + actualizar) y no se duplicó |
| Login de admin en Nova (5174) | ✅ Entra al panel |
