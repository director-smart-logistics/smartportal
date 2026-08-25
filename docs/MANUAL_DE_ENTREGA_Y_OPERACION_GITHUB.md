# 📘 Manual de Entrega de Código, Flujo de Desarrollo y Administración de GitHub

Este documento describe la arquitectura de repositorios, el flujo de trabajo continuo para desarrolladores (`jbricenoz`), el proceso de sincronización automática hacia la cuenta oficial de la empresa (`director-smart-logistics`), y la gestión de colaboradores y accesos en GitHub.

---

## 1. Mapeo y Arquitectura de Repositorios

El ecosistema de SmartLogistics se divide en dos componentes principales: el **Portal Administrativo (SP1)** y el **Portal de Clientes / Web (SP2)**.

| Componente | Repositorio Oficial (Entrega) | Repositorio de Desarrollo | Versión Base Entregada |
| :--- | :--- | :--- | :---: |
| **SP1 (Admin / Nova)** | [director-smart-logistics/smartportal](https://github.com/director-smart-logistics/smartportal) | `jbricenoz/smart-portal-1` | `v0.0.1584` |
| **SP2 (Portal Clientes)** | [director-smart-logistics/smartweb](https://github.com/director-smart-logistics/smartweb) | `jbricenoz/smart-portal-2` | `v1.0.2080` |

---

## 2. Flujo de Trabajo para el Desarrollador (`jbricenoz`)

El desarrollador trabaja en sus carpetas locales habituales para mantener su flujo de ramas, pruebas locales y commits detallados sin alterar los repositorios limpios de la empresa.

### Ciclo Diario de Trabajo

1. **Desarrollo y Pruebas Locales:**
   * Trabajas en `smart-portal-1` o `smart-portal-2`.
   * Creas ramas, ejecutas `npm run dev` y corres pruebas con `npm test`.

2. **Commit en el Repositorio de Desarrollo:**
   ```bash
   git add .
   git commit -m "feat/fix: descripción de la mejora"
   git push origin <tu-rama>
   ```

3. **Sincronización Automática al Repositorio Oficial:**
   Cuando los cambios estén listos y validados para entregar a la empresa:
   
   * **Para SP1 (Portal Administrativo):**
     ```bash
     cd /Users/jbricenoz/Workspace/smartlogistics/smart-portal-1
     npm run sync:smartportal "Descripción de la actualización entregada"
     ```
   
   * **Para SP2 (Portal de Clientes):**
     ```bash
     cd /Users/jbricenoz/Workspace/smartlogistics/smart-portal-2
     npm run sync:smartweb "Descripción de la actualización entregada"
     ```

---

## 3. Gestión de Colaboradores y Permisos en GitHub

### A. Cómo Agregar un Nuevo Colaborador

1. Iniciar sesión en GitHub con la cuenta propietaria de **`director-smart-logistics`**.
2. Navegar al repositorio correspondiente:
   * **SP1:** `https://github.com/director-smart-logistics/smartportal`
   * **SP2:** `https://github.com/director-smart-logistics/smartweb`
3. Ir a la pestaña **Settings** (Configuración) ➔ menú lateral izquierdo **Collaborators** (o **Access**).
4. Hacer clic en el botón verde **Add people** (Agregar personas).
5. Escribir el nombre de usuario de GitHub o correo electrónico del desarrollador (ej. `jbricenoz`).
6. Seleccionar el nivel de rol:
   * **Write (Recomendado para desarrolladores):** Permite hacer push, crear ramas y abrir pull requests.
   * **Admin (Para líderes técnicos):** Permite administrar configuración de secretos y colaboradores.
7. El desarrollador recibirá una invitación por correo o en:
   * `https://github.com/director-smart-logistics/smartportal/invitations`
   * `https://github.com/director-smart-logistics/smartweb/invitations`

### B. Cómo Remover un Colaborador

1. En el mismo menú **Settings ➔ Collaborators**.
2. Localizar al usuario en la lista de colaboradores activos.
3. Hacer clic en el botón de opciones `...` junto al nombre y seleccionar **Remove**.
4. Confirmar la eliminación.

---

## 4. Métodos de Acceso a la Cuenta de `director-smart-logistics`

### Opción 1: Acceso Directo a la Cuenta / Organización (Propietario)
* **URL de acceso:** [https://github.com/login](https://github.com/login)
* **Usuario:** `director-smart-logistics`
* **Seguridad:** Requiere Autenticación de Dos Factores (2FA) activa.

### Opción 2: Acceso por Clave SSH o Personal Access Token (Desarrollo)
* **Clave SSH (Configuración Actual):** La llave pública del equipo de desarrollo está autorizada en la cuenta para sincronizar por SSH (`git@github.com:director-smart-logistics/...`).
* **Personal Access Token (PAT):** Generado desde `Settings ➔ Developer settings ➔ Personal access tokens` para pipelines CI/CD o conexiones HTTPS.

---

## 5. Política de Seguridad y Blindaje de Secretos

* **Variables de Entorno:** Todas las llaves privadas residen en `.env` (ignorado en git).
* **Push Protection:** No incluir API keys hardcodeadas en archivos fuente para evitar bloqueos de GitHub Secret Scanning.
