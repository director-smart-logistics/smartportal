---
description: Add a new entry to the Release Notes changelog without deploying
---

# Agregar Release Note

Usa este workflow para registrar un cambio sin hacer deploy inmediato (ej: documentar trabajo en progreso, agregar notas retroactivas).

---

## PASO 1 — Recopilar datos de la entrada

Pregunta al usuario:

> "Datos para la nueva nota de versión:
>
> 1. **Versión** (ej: `2.6.0`)
> 2. **Capa** — `fe` (frontend) | `be` (backend) | `both`
> 3. **Tipo** — `feature` | `fix` | `perf` | `security` | `refactor` | `breaking` | `chore`
> 4. **Título** — una línea (ej: `Scanner Bodega — morning greeting`)
> 5. **Descripción** — detalle adicional (opcional)"

---

## PASO 2 — Editar client/data/changelog.ts

Agrega la nueva entrada al **INICIO** del array `CHANGELOG` en `client/data/changelog.ts`:

```typescript
{
  version: '<VERSION>',
  date: '<YYYY-MM-DD>',
  layer: '<fe | be | both>',
  type: '<tipo>',
  title: '<TÍTULO>',
  description: '<DESCRIPCIÓN>',
  author: 'SmartLogistics Team',
},
```

---

## PASO 3 — Verificar

Confirma al usuario que la entrada fue agregada y está visible en `/release-notes`.

---

## Recordatorio para la IA

- La entrada siempre va al **INICIO** del array (newest-first order)
- El campo `date` debe ser la fecha de hoy en formato `YYYY-MM-DD`
- No es necesario hacer deploy en este workflow — solo actualizar el archivo
