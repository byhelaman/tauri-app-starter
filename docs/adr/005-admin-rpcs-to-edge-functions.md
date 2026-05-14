# ADR-005: Migración de RPCs Administrativas a Edge Functions

**Estado:** Aceptado  
**Fecha:** 2026-05-14  
**Contexto:** Warnings del linter de Supabase (`authenticated_security_definer_function_executable`)

## Contexto

El linter de seguridad de Supabase detecta funciones `SECURITY DEFINER` en el esquema `public` que son ejecutables por el rol `authenticated`. Estas funciones elevan temporalmente los privilegios del usuario al nivel del owner de la función (rol `postgres`), lo cual es un patrón legítimo pero que genera advertencias preventivas.

Las funciones administrativas de gestión de usuarios (`003_admin_rbac.sql`) presentan un riesgo adicional: acceden directamente a `auth.users` (tabla interna de Supabase) para operaciones como eliminar usuarios, leer `last_sign_in_at`, o actualizar `raw_user_meta_data`. Estas operaciones requieren privilegios que van más allá del RLS estándar.

## Decisión

Migrar las funciones administrativas que **tocan `auth.users`** a Supabase Edge Functions, manteniendo las funciones de solo lectura sobre tablas públicas como RPCs.

### Funciones migradas (5)

| Función SQL (eliminada) | Edge Function `admin-users` action |
|---|---|
| `get_all_users()` | `action: "list"` |
| `update_user_role(uuid, text)` | `action: "update_role"` |
| `update_user_display_name(uuid, text)` | `action: "update_display_name"` |
| `delete_user(uuid)` | `action: "delete"` |
| `delete_own_account()` | `action: "delete_own_account"` |

### Funciones que permanecen como RPCs

Las siguientes funciones no tocan `auth.users` y operan sobre tablas públicas con RLS. Sus warnings se gestionan con "Ignore" en el panel de Supabase:

- `get_all_roles()`, `get_all_permissions()`, `get_role_permission_matrix()`
- `create_role()`, `update_role()`, `delete_role()`, `duplicate_role()`
- `assign_role_permission()`, `remove_role_permission()`
- `set_new_user_role()`, `get_user_count()`, `get_role_permissions()`

## Motivación

1. **Seguridad reforzada:** Las Edge Functions validan el token JWT contra `auth.getUser()` (verificación viva), eliminando el riesgo de tokens zombie (JWT criptográficamente válido pero usuario ya eliminado).

2. **Eliminación de warnings:** Al mover la lógica fuera de funciones `SECURITY DEFINER` expuestas en `public`, el linter deja de emitir `authenticated_security_definer_function_executable` para estas operaciones.

3. **Aislamiento del `service_role_key`:** La llave maestra solo vive en la memoria del servidor Deno de Supabase (variables de entorno). Nunca llega al cliente.

4. **Patrón consistente:** Las operaciones sobre `auth.users` ya usaban Edge Functions para invitar usuarios (`admin-invite-user`), cambiar emails (`admin-update-user-email`) y resetear contraseñas (`admin-reset-user-password`). Esta migración unifica el patrón.

## Arquitectura

```
┌──────────────┐    JWT Bearer     ┌─────────────────────┐   service_role_key   ┌──────────────┐
│   Frontend   │ ────────────────► │  Edge Function      │ ──────────────────► │  Supabase DB │
│  (React/TS)  │                   │  admin-users        │                     │  + Auth API  │
│              │ ◄──────────────── │  (Deno, --no-jwt)   │ ◄────────────────── │              │
│  functions.  │    JSON response  │  buildAuthContext()  │   Query results     │  auth.users  │
│  invoke()    │                   │  + permission check  │                     │  profiles    │
└──────────────┘                   └─────────────────────┘                     └──────────────┘
```

### Flujo de una petición

1. Frontend llama `supabase.functions.invoke("admin-users", { body: { action: "delete", targetUserId: "..." } })`
2. Supabase Gateway reenvía la petición al servidor Deno (la función está desplegada con `--no-verify-jwt`)
3. `buildAuthContext()` extrae el Bearer token del header Authorization
4. Valida el token contra `supabase.auth.getUser(token)` — verificación **viva** contra la DB
5. Resuelve el perfil del actor desde `profiles` + `roles` para obtener `actorLevel`
6. El router despacha al handler según `action`
7. El handler verifica permisos específicos (e.g., `users.manage` para delete)
8. Ejecuta la operación usando `supabaseAdmin` (service_role)
9. Registra auditoría vía `log_audit_event_as_admin` (RPC restringida a service_role)
10. Retorna JSON al frontend

## Consecuencias

### Positivas
- Base de datos más limpia: menos funciones `SECURITY DEFINER` expuestas
- Validación de sesión más estricta (tokens zombie eliminados inmediatamente)
- Mejor trazabilidad: las Edge Functions tienen logs nativos en el dashboard

### Negativas
- Latencia ligeramente mayor (~50-150ms) por el hop extra a Deno
- Lógica de negocio dividida entre SQL (RPCs de lectura) y TypeScript (mutaciones admin)
- Las Edge Functions requieren despliegue separado (`supabase functions deploy`)

## Archivos relacionados

- `supabase/functions/admin-users/index.ts` — Edge Function principal
- `supabase/functions/_shared/admin-handler.ts` — `buildAuthContext()` compartido
- `supabase/migrations/003_admin_rbac.sql` — RPCs migradas eliminadas de este archivo
- `src/features/system/api.ts` — Frontend actualizado para llamar a la Edge Function
- `src/components/profile-modal.tsx` — `delete_own_account` migrado a `action: "delete_own_account"`
