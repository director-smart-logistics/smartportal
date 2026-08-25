---
description: Deploy frontend (hosting) or backend (functions) with mandatory release notes
---

# Deploy Smart Portal Admin

⚠️ **REGLA OBLIGATORIA**: Sigue los pasos en orden. FE y BE se versionan **independientemente**.
- **FE** (`package.json`) — el parche se incrementa **automáticamente** en cada `pnpm build` vía `prebuild` hook
- **BE** (`functions/package.json`) — se incrementa **manualmente** antes de cada deploy de functions

---

## Pre-requisitos

Directorio raíz del proyecto:
```
smart-portal-1/
```

---

## PASO 0 — Typecheck (OBLIGATORIO)

```bash
pnpm typecheck
```

Si hay errores de TypeScript, corrígelos antes de continuar.

---

## PASO 1 — Leer versiones actuales

```bash
node -e "
const fs = require('fs');
const fe = JSON.parse(fs.readFileSync('package.json','utf8'));
const be = JSON.parse(fs.readFileSync('functions/package.json','utf8'));
console.log('FE actual : ' + fe.version + '  (se bumpeará automáticamente al hacer pnpm build)');
console.log('BE actual : ' + be.version);
"
```

Muestra la salida al usuario.

---

## PASO 2 — Recopilar información del release (OBLIGATORIO)

**NUNCA saltes este paso.** Pregunta al usuario:

> "Para el release necesito:
>
> 1. **Capa** (`fe` = solo hosting, `be` = solo functions, `both` = ambas)
> 2. **Tipo** (`feature` | `fix` | `perf` | `security` | `refactor` | `breaking` | `chore`)
> 3. **Título** — una línea descriptiva del cambio principal
> 4. **Descripción** — detalle opcional
> 5. **Mensaje de commit** (ej: `feat: mejoras en scanner bodega`)"

---

## PASO 3 — Bump de versión BE (solo si capa = `be` o `both`)

Si el deploy incluye **functions**, incrementa el BE manualmente:

```bash
node scripts/increment-version-be.js
```

Verifica la nueva versión en `functions/package.json`.

> Si la capa es solo `fe`, omite este paso — el FE se bumpeará solo en el build.

---

## PASO 4 — Tests (OBLIGATORIO)

```bash
pnpm test
```

Si algún test falla, corrígelo antes de continuar.

---

## PASO 5 — Agregar entrada a client/data/changelog.ts

Lee la versión bumpeada según la capa:
- **fe / both**: la versión del changelog es la de `package.json` (se incrementará en el build del paso siguiente)
- **be**: usa la versión de `functions/package.json`

Agrega al **INICIO** del array `CHANGELOG` en `client/data/changelog.ts`:

```typescript
{
  version: '<VERSION_BUMPEADA>',
  date: '<YYYY-MM-DD de hoy>',
  layer: '<fe | be | both>',
  type: '<feature | fix | perf | security | refactor | breaking | chore>',
  title: '<TÍTULO>',
  description: '<DESCRIPCIÓN OPCIONAL>',
  author: 'SmartLogistics Team',
},
```

---

## PASO 6 — Git: add, commit y push

```bash
git add .
```

```bash
git commit -m "<MENSAJE_DEL_USUARIO>"
```

```bash
git push
```

> Si el push falla: `git push --set-upstream origin main`

---

## PASO 7 — Build de producción

> ⚡ El `prebuild` hook incrementará automáticamente la versión FE en `package.json`

```bash
pnpm build
```

Verifica que el build termine sin errores. Confirma la nueva versión FE:

```bash
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('FE → ' + p.version)"
```

---

## PASO 8 — Deploy a Firebase

Para **frontend (hosting)**:
// turbo
```bash
firebase deploy --only hosting --project smart-portal-admin
```

Para **backend (functions)**:
```bash
firebase deploy --only functions --project smart-portal-admin
```

Para **ambos**:
```bash
firebase deploy --project smart-portal-admin
```

---

## PASO 9 — Confirmación

Confirma al usuario:
- ✅ Deploy exitoso
- 📦 FE `package.json` → v`<FE_VERSION>` (auto-bumped en build)
- 📦 BE `functions/package.json` → v`<BE_VERSION>` (si aplica)
- � Entrada añadida en Release Notes
- 🔗 URL de producción del proyecto Firebase

---

## Recordatorio para la IA

- **FE** se versiona solo — `prebuild` llama a `scripts/increment-version.js` en cada `pnpm build`
- **BE** se versiona con `node scripts/increment-version-be.js` ANTES del build/deploy de functions
- **NUNCA** pidas al usuario que escriba la versión manualmente — lee los archivos y calcula
- Orden obligatorio: typecheck → leer versiones → recopilar info → bump BE si aplica → tests → changelog → commit → push → build (auto-bump FE) → deploy
- Si cualquier paso falla, detente y reporta antes de continuar
- La entrada de changelog va al INICIO del array, no al final
