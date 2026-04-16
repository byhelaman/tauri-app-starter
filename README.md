# Tauri App Starter

Template de aplicación de escritorio con autenticación completa, RBAC y actualizaciones automáticas.

**Stack:** Tauri 2 · React 19 · TypeScript · Vite · TailwindCSS 4 · shadcn/ui · Supabase

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

> Si no configuras el `.env`, la app abrirá una pantalla de setup donde puedes ingresar las credenciales de Supabase. Se guardan en localStorage y puedes cambiarlas en cualquier momento.

---

## Supabase — Configuración inicial

Ver la guía completa en [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

Pasos requeridos en orden:

1. Crear proyecto y copiar credenciales al `.env`
2. Ejecutar `supabase/migrations/001_foundation.sql` y luego `supabase/migrations/002_admin_rbac.sql` en el SQL Editor
3. Activar el Auth Hook (`Authentication → Hooks → custom_access_token_hook`) ⚠️
4. Desplegar `supabase/functions/admin-reset-user-password` (para reset de contraseña por admin)
5. Promover el primer `owner` con SQL directo

---

## Scripts

```bash
pnpm dev          # Servidor Vite (frontend only, sin ventana nativa)
pnpm tauri dev    # App completa con ventana Tauri
pnpm build        # Build de producción (frontend)
pnpm tauri build  # Build de escritorio (genera instalador)
```

---

## Estructura del proyecto

```
src/
├── components/
│   ├── ui/                 # Componentes shadcn/ui
│   ├── auth-guard.tsx      # Protección de rutas autenticadas
│   ├── update-dialog.tsx   # Diálogo de actualización automática
│   └── updater-context.tsx
├── contexts/
│   └── auth-context.tsx    # Sesión, signIn, signOut
├── features/
│   └── auth/               # SignIn, SignUp, Recovery
├── hooks/
│   └── use-updater.tsx     # Lógica de actualizaciones
├── lib/
│   ├── supabase.ts         # Cliente Supabase optimizado para desktop
│   └── utils.ts
└── pages/
    ├── dashboard.tsx       # Página principal (punto de partida)
    └── setup.tsx           # Configuración de credenciales

src-tauri/
├── src/
│   ├── lib.rs              # Plugins y setup de Tauri
│   └── main.rs
├── capabilities/
│   └── default.json        # Permisos de la app
└── tauri.conf.json         # Configuración de Tauri

supabase/
├── functions/
│   └── admin-reset-user-password/
│       └── index.ts           # Reset seguro por admin + notificación
└── migrations/
  ├── 001_foundation.sql  # RBAC base, perfiles, JWT hook, RLS, triggers, RPCs utilitarias
  └── 002_admin_rbac.sql  # RPCs/grants de administración y gestión de roles
```

---

## Autenticación

El template incluye:

- **Sign in** — email + contraseña con validación Zod
- **Sign up** — email + contraseña + verificación OTP (código 6 dígitos)
- **Recovery** — reset de contraseña en 2 pasos (OTP → nueva contraseña)
- **Sesión persistente** — token en localStorage con refresh automático
- **Redirect post-login** — redirige a la ruta original que intentó acceder

### Roles disponibles

| Rol | Nivel | Descripción |
|-----|-------|-------------|
| `owner` | 100 | Control total del sistema |
| `admin` | 80 | Gestionar usuarios y configuración |
| `member` | 10 | Usuario autenticado estándar |
| `guest` | 0 | No verificado, asignado al registrarse |

Los claims `user_role`, `hierarchy_level` y `permissions[]` se inyectan automáticamente en el JWT a través del Auth Hook.

---

## Actualizaciones automáticas

El sistema verifica actualizaciones al iniciar y cada 4 horas. Si hay una versión nueva, muestra un diálogo con barra de progreso de descarga.

### Configuración

**1. Generar clave de firma:**

```bash
pnpm tauri signer generate -w ~/.tauri/tu-app.key
```

Guarda la **public key** que imprime en consola.

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

| Secreto | Valor |
|---------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contenido del archivo `.key` generado |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Contraseña elegida al generar la clave |

**4. Publicar una release:**

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions compilará, firmará y publicará el instalador automáticamente.

> Ver [docs/RELEASES.md](docs/RELEASES.md) para el workflow completo de CI/CD.

---

## Variables de entorno

```env
# .env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Si no se definen, la app muestra la pantalla de setup para ingresarlas manualmente.

---

## Personalización

| Qué cambiar | Dónde |
|-------------|-------|
| Nombre de la app | `tauri.conf.json` → `productName` y `Cargo.toml` → `name` |
| Identificador | `tauri.conf.json` → `identifier` |
| Versión | `tauri.conf.json` → `version` y `Cargo.toml` → `version` |
| Tamaño de ventana | `tauri.conf.json` → `app.windows` |
| Roles y permisos base | `supabase/migrations/001_foundation.sql` → secciones 1, 2 y 3 |
| RPCs/admin RBAC | `supabase/migrations/002_admin_rbac.sql` |
| Página principal | `src/pages/dashboard.tsx` |
