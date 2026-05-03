# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server only (browser, port 1420)
pnpm dev

# Full desktop app with native Tauri window (preferred for development)
pnpm tauri dev

# Type-check + build frontend
pnpm build

# Build desktop installer
pnpm tauri build
```

Available quality scripts in package.json:
- `pnpm lint`
- `pnpm test`

## Environment Setup

Copy `.env.example` to `.env` and fill in Supabase credentials:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If neither env var is set, the app renders `SetupPage` (`src/pages/setup.tsx`) on first launch, which lets the user enter credentials that are then persisted to `localStorage`. Env vars always take precedence over `localStorage`.

Prerequisites: Node 20+, pnpm 9+, Rust toolchain, Supabase account.

## Architecture

This is a **Tauri 2 desktop app template** with React 19 + TypeScript frontend backed by Supabase for auth and database. The Rust backend (`src-tauri/`) is intentionally thin — it only registers three plugins (opener, updater, process) with no custom commands. All business logic lives in the frontend via Supabase RPC calls.

### Frontend (`src/`)

**Routing** (React Router v7): Two main routes — `/login` (unauthenticated only) and `/` (protected by `AuthGuard`). Everything else redirects to `/`.

**State management** is context-based:
- `auth-context.tsx` — session, user, `signIn`, `signOut`
- `updater-context.tsx` — auto-update status and download progress

**Auth flow**: Email/password login with optional OTP sign-up and password recovery. All forms use React Hook Form + Zod. Post-login redirects to the originally requested route. Supabase tokens are stored in localStorage with auto-refresh; session refresh is also triggered on window focus/visibility events (important for long-running desktop apps).

**Adding features**: New pages go in `src/pages/`, new feature modules in `src/features/<name>/`. UI components use shadcn/ui (components in `src/components/ui/`). Path alias `@/` maps to `src/`.

**Custom UI primitives** (not in shadcn — do not try to install them):
- `Field` / `FieldGroup` / `FieldLabel` / `FieldDescription` / `FieldError` / `FieldContent` — form layout primitives used in all forms and modals. `Field` supports `orientation="vertical"` (default) or `"horizontal"` (label + control side-by-side).
- `Item` / `ItemGroup` / `ItemMedia` / `ItemContent` / `ItemTitle` / `ItemDescription` / `ItemActions` — list/card-row primitives used in notification and profile views.

**User nav modals**: `user-nav.tsx` controls `ProfileModal`, `SettingsModal`, and `NotificationsModal` via a single `ModalType` state (`"profile" | "settings" | "notifications" | null`). Add new user-nav modals by extending this union and following the same open/onOpenChange prop pattern.

**Theming**: `next-themes` wraps the app; toggle is in `user-nav.tsx`.

**Notifications**: Sonner (`<Toaster />` in `App.tsx`).

**App version**: Displayed in the dashboard footer via `getVersion()` from `@tauri-apps/api/app`. Renders nothing in browser dev mode (where the Tauri API is unavailable).

### Supabase / Database

The foundation migrations (`supabase/migrations/001_foundation.sql` + `supabase/migrations/002_audit_notifications.sql` + `supabase/migrations/003_admin_rbac.sql`) create:
- `profiles` table — linked to `auth.users`, stores role assignment
- `roles`, `permissions`, `role_permissions` — RBAC tables

**Role hierarchy**: `owner` (100) → `admin` (80) → `member` (10) → `guest` (0)

**Critical**: The `custom_access_token_hook` function must be activated in the Supabase dashboard (Auth → Hooks) for JWT claims (role/permissions) to be injected into tokens. Without this, RBAC won't work. See `docs/SUPABASE_SETUP.md` for the full setup procedure.

Helper RPCs: `has_permission()`, `get_my_profile()`, `get_all_users()`, `update_user_role()`.

Security constraints baked into the RPCs:
- `check_email_exists` — restricted to `hierarchy_level >= 80` (prevents user enumeration)
- `delete_own_account` — blocked if the caller is the only `owner` in the system

### Tauri security

- **CSP** configured in `tauri.conf.json`: allows `self`, `*.supabase.co` (https + wss), inline styles (required by Tailwind), and `data:`/`blob:` images.
- **Capabilities** (`src-tauri/capabilities/default.json`): `process:allow-restart` only — not `process:default`.
- **Updater signing key**: `tauri.conf.json` contains a placeholder (`REPLACE_WITH_YOUR_PUBKEY`). Generate the real key with `pnpm tauri signer generate` before building for production. See `docs/RELEASES.md`.

### Auto-updater

The `use-updater.tsx` hook polls for updates every 4 hours using `tauri-plugin-updater`. Update endpoints and signing keys are configured in `tauri.conf.json`. The CI/CD workflow is at `.github/workflows/release.yml` — it triggers on any `v*` tag and builds a Windows x64 installer. See `docs/RELEASES.md` for the full release procedure.

### Agent Skills

`.agents/skills/` contains guidance documents for:
- `shadcn/` — component usage, base-vs-radix choices, composition patterns, form integration
- `supabase-postgres-best-practices/` — RLS, indexing, batch inserts, connection pooling, pagination
