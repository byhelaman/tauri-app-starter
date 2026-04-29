# Tauri App Starter

Template de aplicación de escritorio con autenticación completa, RBAC dinámico,
panel de administración y actualizaciones automáticas.

**Stack:** Tauri 2 · React 19 · TypeScript · Vite · TailwindCSS 4 · shadcn/ui ·
Supabase

---

## Requisitos

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Rust](https://rustup.rs/) (stable)
- Cuenta en [Supabase](https://supabase.com/)

---

## Inicio rápido

```bash
# 1. Instalar dependencias
pnpm install

# 2. Copiar variables de entorno
cp .env.example .env

# 3. Llenar las variables en .env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key

# 4. Ejecutar en modo desarrollo
pnpm tauri dev
```

> Si no configuras el `.env`, la app abrirá una pantalla de setup donde puedes
> ingresar las credenciales de Supabase. Se guardan en localStorage y puedes
> cambiarlas en cualquier momento.

---

## Supabase — Configuración inicial

Ver la guía completa en [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

Pasos requeridos en orden:

1. Crear proyecto y copiar credenciales al `.env`
2. Ejecutar las 6 migraciones disponibles en el SQL Editor
  (`001`, `002`, `003`, `004`, `006`, `009`)
3. Activar el Auth Hook (`Authentication → Hooks → custom_access_token_hook`) ⚠️
4. Desplegar las 4 edge functions (`admin-reset-user-password`,
   `admin-update-user-email`, `admin-invite-user`, `ai-chat`)
5. Promover el primer `owner` con SQL directo

Nota: los fixes históricos de seguridad/consistencia ya están integrados en las
migraciones base actuales.

---

## Scripts

```bash
pnpm dev          # Servidor Vite (frontend only, sin ventana nativa)
pnpm tauri dev    # App completa con ventana Tauri
pnpm build        # Build de producción (frontend)
pnpm tauri build  # Build de escritorio (genera instalador)
pnpm lint         # Linting
pnpm test         # Tests
```

---

## Funcionalidades

### Autenticación

- **Sign in** — email + contraseña con validación Zod
- **Sign up** — email + contraseña + verificación OTP (código 6 dígitos)
- **Recovery** — reset de contraseña en 2 pasos (OTP → nueva contraseña)
- **Invite** — flujo de aceptación de invitación por admin (OTP → nueva
  contraseña)
- **Sesión persistente** — token en localStorage con refresh automático en
  focus/visibility
- **Redirect post-login** — redirige a la ruta original que intentó acceder

### Panel de administración (System Modal)

Accesible para roles con `users.manage` o jerarquía ≥ 80.

**Pestaña Usuarios:**

- Listado con búsqueda, filtro por rol y estado (activo / invite pendiente)
- Cambio de rol inline con actualización optimista
- Ver perfil: editar nombre y email por separado en sub-modales
- Restricción: el email de usuarios con invite pendiente no puede modificarse
- Invitar usuarios nuevos con rol asignado
- Reset de contraseña por admin (invalida todas las sesiones activas)
- Eliminar usuario

**Pestaña Roles & Permisos:**

- Crear, editar, duplicar y eliminar roles dinámicamente
- Duplicar rol copia permisos de forma atómica (un solo round-trip)
- Eliminar rol reasigna sus usuarios al rol más bajo disponible
- Matriz de permisos con toggles inline
- Roles del sistema (`owner`, `guest`) protegidos — no se pueden eliminar ni
  modificar permisos

**Pestaña Audit Log:**

- Registro inmutable de todas las acciones administrativas con actor, target y
  metadata

### RBAC

| Rol      | Nivel | Descripción                            |
| -------- | ----- | -------------------------------------- |
| `owner`  | 100   | Control total del sistema              |
| `admin`  | 80    | Gestionar usuarios y configuración     |
| `member` | 10    | Usuario autenticado estándar           |
| `guest`  | 0     | Sin verificar, asignado al registrarse |

Los claims `user_role`, `hierarchy_level` y `permissions[]` se inyectan en el
JWT vía Auth Hook. Los roles y permisos son dinámicos — se crean y modifican
desde el panel sin tocar código.

### Notificaciones

Sistema de notificaciones in-app persistentes con badge en el nav, marcado
individual y masivo, y descarte.

### AI Chat

- Widget flotante con historial local por usuario, edición de mensajes y
  reintento rápido
- Respuestas por streaming SSE con indicadores de estado de herramientas
- Renderizado Markdown (GFM), copiar mensaje y copiar conversación completa
- Herramientas de datos: `get_schema`, `query_table` y `execute_query` (solo
  lectura garantizada en BD)
- Control de abuso: rate limit server-side (`ai_chat`: 30 solicitudes por minuto
  por usuario)

### Seguridad endurecida

- `has_permission` en modo fail-closed (`COALESCE(..., false)`) para evitar
  bypass por claims faltantes en JWT
- Endurecimiento RLS de catálogos RBAC (`roles`, `permissions`,
  `role_permissions`) con patrón fila propia o admin
- Sanitización de errores de herramientas SQL en `ai-chat` para evitar filtrar
  estructura interna
- CSP de Tauri alineado con Supabase (`https` y `wss`) y superficie de
  capacidades mínima

### Actualizaciones automáticas

Verifica actualizaciones al iniciar y cada 4 horas. Muestra diálogo con progreso
de descarga. Ver [docs/RELEASES.md](docs/RELEASES.md).

---

## Estructura del proyecto

```
src/
├── components/
│   ├── ui/                    # Componentes shadcn/ui + primitivos propios
│   ├── avatar-field.tsx       # Campo de avatar reutilizable
│   ├── auth-guard.tsx         # Protección de rutas autenticadas
│   ├── profile-modal.tsx      # Modal de perfil del usuario actual
│   ├── system-modal.tsx       # Panel de administración completo
│   ├── update-dialog.tsx      # Diálogo de actualización automática
│   └── user-nav.tsx           # Navegación de usuario (avatar + modales)
├── contexts/
│   └── auth-context.tsx       # Sesión, signIn, signOut, claims
├── features/
│   ├── auth/                  # SignIn, SignUp, Recovery, InviteAccept
│   └── system/                # UsersTab, RolesTab, AuditTab, diálogos
├── hooks/
│   └── use-updater.tsx        # Lógica de actualizaciones automáticas
├── lib/
│   ├── supabase.ts            # Cliente Supabase optimizado para desktop
│   └── utils.ts
└── pages/
    ├── dashboard.tsx          # Página principal (punto de partida)
    └── setup.tsx              # Configuración de credenciales

src-tauri/
├── src/
│   ├── lib.rs                 # Plugins y setup de Tauri
│   └── main.rs
├── capabilities/
│   └── default.json           # Permisos de la app
└── tauri.conf.json            # Configuración de Tauri

supabase/
├── functions/
│   ├── _shared/
│   │   └── admin-handler.ts   # Middleware compartido (auth, jerarquía, CORS)
│   ├── ai-chat/               # Chat IA con herramientas de consulta y streaming SSE
│   ├── admin-invite-user/     # Invitar usuario con rol asignado
│   ├── admin-reset-user-password/  # Reset + invalidación de sesiones
│   └── admin-update-user-email/    # Cambio de email con audit
└── migrations/
    ├── 001_foundation.sql     # Core RBAC, profiles, JWT hook, RLS base
    ├── 002_admin_rbac.sql     # RPCs admin y gestión de roles/permisos
    ├── 003_audit_and_notifications.sql  # Audit log + notificaciones + overrides con auditoría
    ├── 004_admin_sync_email.sql         # Trigger sync email + helpers admin de auditoría
    ├── 006_ai_chat.sql                  # permiso ai.chat + schema + execute_ai_query endurecida
    └── 009_rate_limiting.sql            # rate limit genérico + gates en RPCs sensibles
```

---

## Actualizaciones automáticas

**1. Generar clave de firma:**

```bash
pnpm tauri signer generate -w ~/.tauri/tu-app.key
```

**2. Actualizar `src-tauri/tauri.conf.json`:**

```json
"plugins": {
  "updater": {
    "pubkey": "TU_PUBLIC_KEY_AQUÍ",
    "endpoints": [
      "https://github.com/TU_USUARIO/TU_REPO/releases/latest/download/latest.json"
    ]
  }
}
```

**3. Agregar secretos en GitHub** (`Settings → Secrets → Actions`):

| Secreto                              | Valor                                  |
| ------------------------------------ | -------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Contenido del archivo `.key` generado  |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Contraseña elegida al generar la clave |

**4. Publicar una release:**

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions compilará, firmará y publicará el instalador automáticamente.

---

## Variables de entorno

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Si no se definen, la app muestra la pantalla de setup para ingresarlas
manualmente.

---

## Personalización

| Qué cambiar           | Dónde                                                         |
| --------------------- | ------------------------------------------------------------- |
| Nombre de la app      | `tauri.conf.json` → `productName` y `Cargo.toml` → `name`     |
| Identificador         | `tauri.conf.json` → `identifier`                              |
| Versión               | `tauri.conf.json` → `version` y `Cargo.toml` → `version`      |
| Tamaño de ventana     | `tauri.conf.json` → `app.windows`                             |
| Roles y permisos base | `supabase/migrations/001_foundation.sql` → secciones 1, 2 y 3 |
| Página principal      | `src/pages/dashboard.tsx`                                     |

---

## Páginas stub y elementos de demostración

El starter incluye páginas y componentes de demostración que **deben eliminarse o completarse** antes de lanzar a producción.

### Páginas stub

| Archivo | Estado | Acción |
|---|---|---|
| `src/pages/projects.tsx` | Placeholder vacío (`<div>Projects</div>`) | Implementar o eliminar del router |
| `src/pages/dashboard.tsx` | Funcional, pero con botón de demo | Eliminar el componente `ThrowError` y el botón `[Demo] Throw error` |

### Componentes de demostración

| Componente | Descripción |
|---|---|
| `IntegrationsTab` | La conectividad OAuth (Microsoft, Zoom, Slack) es simulada — el estado no persiste. Requiere implementar los flujos reales de OAuth o eliminar las integraciones no necesarias. |
| `[Demo] Simulate update` (Settings) | Botón solo visible en `DEV` para simular el diálogo de actualización. Se excluye automáticamente del build de producción. |

### Datos de ejemplo (MSW)

En modo desarrollo sin Supabase configurado, la app usa **MSW (Mock Service Worker)** para simular el backend:

- Los datos de órdenes, queue e historial son generados aleatoriamente en memoria.
- Para desarrollar contra el backend real, define `VITE_SUPABASE_URL` en `.env` (MSW se desactiva automáticamente).
- Para forzar el uso de mocks aunque tengas Supabase, agrega `VITE_USE_MOCKS=true` al `.env`.

---

## Variables de entorno

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Opcional: forzar mocks en dev aunque VITE_SUPABASE_URL esté definida
# VITE_USE_MOCKS=true
```

Si no se definen las variables de Supabase, la app muestra la pantalla de setup para ingresarlas
manualmente.

