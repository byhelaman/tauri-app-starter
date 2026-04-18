# Configuración de Supabase

Todos los pasos manuales necesarios para que el template funcione correctamente. Sigue el orden exacto.

---

## 1. Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea un nuevo proyecto
2. Guarda la **contraseña de la base de datos** — la necesitarás si usas Supabase CLI
3. Espera a que el proyecto termine de inicializarse (~2 min)

---

## 2. Obtener las credenciales

`Project Settings → API`

| Campo | Variable |
|-------|----------|
| Project URL | `VITE_SUPABASE_URL` |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` |

Cópialas en tu `.env`:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> La `anon key` es pública y segura para exponer en el frontend. El acceso a los datos está controlado por RLS, no por esta clave.

---

## 3. Ejecutar las migraciones

`SQL Editor → New query`

Ejecuta los archivos **en orden**. Abre cada uno, copia el contenido completo y ejecútalo en una query nueva.

1. `supabase/migrations/001_foundation.sql`
2. `supabase/migrations/002_admin_rbac.sql`
3. `supabase/migrations/003_audit_and_notifications.sql`
4. `supabase/migrations/004_admin_sync_email.sql`
5. `supabase/migrations/005_role_management_fixes.sql`

Si la ejecución tiene éxito verás `Success. No rows returned` al final de cada script.

**Qué crea cada migración:**

| Migración | Objetos principales |
|-----------|---------------------|
| `001` | `profiles`, `handle_new_user` trigger, `custom_access_token_hook`, `has_permission`, `get_my_profile`, `verify_user_password`, `check_email_exists`, RLS |
| `002` | `roles`, `permissions`, `role_permissions`, `get_all_users`, `update_user_role`, `update_user_display_name`, `delete_user`, `delete_own_account`, `create_role`, `update_role`, `delete_role`, `duplicate_role`, `assign_role_permission`, `remove_role_permission`, `get_all_roles`, `get_all_permissions`, `get_role_permission_matrix`, `set_new_user_role` |
| `003` | `audit_log`, `notifications`, `log_audit_event`, `log_audit_event_as_admin`, `notify_user`, `notify_admins`, `get_audit_log`, `get_my_notifications`, `mark_notification_read`, `mark_all_notifications_read`, `dismiss_notification` |
| `004` | Trigger `on_auth_user_email_updated` (sincroniza `profiles.email`), `admin_audit_email_change`, `log_audit_event_as_admin` |
| `005` | Corrige `delete_role` (fallback al rol más bajo), añade `duplicate_role` atómico |

---

## 4. Activar el Auth Hook ⚠️

**Este paso es crítico.** Sin él, el JWT no incluirá el rol ni los permisos, y toda la autorización fallará silenciosamente.

`Authentication → Hooks`

1. Haz clic en **"Add new hook"** en la sección **"Customize Access Token (JWT) Claims"**
2. Configura:
   - **Hook type:** `Customize Access Token (JWT) Claims`
   - **Schema:** `public`
   - **Function:** `custom_access_token_hook`
3. Haz clic en **Save**

**Cómo verificar que funciona:**

Regístrate o inicia sesión, luego ejecuta en el SQL Editor:

```sql
-- Debería mostrar tu rol y permisos
SELECT auth.jwt();
```

El resultado debe incluir `user_role`, `hierarchy_level` y `permissions`.

---

## 5. Asignar el primer owner

Los usuarios se registran como `guest` por defecto. Debes promoverte manualmente desde el SQL Editor la primera vez.

`SQL Editor → New query`

```sql
UPDATE public.profiles
SET role = 'owner'
WHERE email = 'tu@email.com';
```

> Después de ejecutar, **cierra sesión y vuelve a iniciarla** para que el JWT se regenere con el nuevo rol.

**Verificar:**

```sql
SELECT id, email, role FROM public.profiles WHERE email = 'tu@email.com';
```

---

## 6. Configurar autenticación de email

Por defecto Supabase requiere confirmación de email. El flujo de registro del template usa OTP (código de 6 dígitos).

`Authentication → Email Templates`

### Verificación en Sign Up

Asegúrate de que el template de **"Confirm signup"** esté configurado con tipo `OTP`, no `Magic Link`. Supabase lo envía automáticamente al llamar a `signUp()`.

### Email de recuperación de contraseña

El template usa OTP para recovery también. Verifica que el template **"Reset Password"** envíe el token como código numérico:

`Authentication → Email Templates → Reset Password`

El template por defecto funciona. Si personalizas el email, usa `{{ .Token }}` (no `{{ .ConfirmationURL }}`).

### Email de invitación

La función `admin-invite-user` usa `inviteUserByEmail`. El template de **"Invite user"** debe enviar el OTP como código numérico para que el flujo de aceptación de invitación funcione:

`Authentication → Email Templates → Invite user`

Asegúrate de que el template incluya `{{ .Token }}` en el cuerpo del email.

---

## 7. Configurar SMTP (producción)

Supabase incluye un servidor SMTP de prueba con límite de **2 emails por hora**. Para producción debes configurar uno propio.

`Project Settings → Authentication → SMTP Settings`

Proveedores recomendados: [Resend](https://resend.com), [Brevo](https://www.brevo.com), [SendGrid](https://sendgrid.com), [Postmark](https://postmarkapp.com)

```
Host:     smtp.resend.com
Port:     465
User:     resend
Password: tu-api-key
```

Ejemplo con Brevo:

```
Host:     smtp-relay.brevo.com
Port:     587
User:     tu-email@dominio.com
Password: tu-smtp-key
```

---

## 8. Verificar RLS

Confirma que RLS está activo en todas las tablas:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'roles', 'permissions', 'role_permissions');
```

Todos deben mostrar `rowsecurity = true`.

---

## 9. Desplegar Edge Functions

El sistema incluye tres edge functions que ejecutan operaciones privilegiadas con la `service_role` key. Todas deben desplegarse con `--no-verify-jwt`.

```bash
supabase functions deploy admin-reset-user-password --no-verify-jwt
supabase functions deploy admin-update-user-email --no-verify-jwt
supabase functions deploy admin-invite-user --no-verify-jwt
```

> **¿Por qué `--no-verify-jwt`?**
> Supabase usa claves asimétricas (ES256) para firmar JWTs. La verificación built-in de Edge Functions no soporta ES256 y rechaza el request con `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM`. Al desactivarla, cada función valida el token **manualmente** con `supabase.auth.getUser(accessToken)`, que sí soporta ES256.

| Función | Qué hace |
|---------|----------|
| `admin-reset-user-password` | Resetea la contraseña de un usuario e invalida todas sus sesiones activas |
| `admin-update-user-email` | Cambia el email de un usuario (bloqueado si tiene invite pendiente) |
| `admin-invite-user` | Invita a un nuevo usuario y le asigna un rol |

Todas validan jerarquía/permisos (`users.manage`) antes de aplicar el cambio.

---

## Roles y permisos del sistema

### Roles por defecto

| Rol | Nivel | Asignado automáticamente |
|-----|-------|--------------------------|
| `guest` | 0 | Sí, al registrarse |
| `member` | 10 | No, requiere admin |
| `admin` | 80 | No, requiere admin |
| `owner` | 100 | No, requiere SQL directo |

### Permisos por defecto

| Permiso | Nivel mínimo | Roles que lo tienen |
|---------|-------------|---------------------|
| `profile.read` | 10 | member, admin |
| `profile.update` | 10 | member, admin |
| `users.view` | 80 | admin |
| `users.manage` | 80 | admin |
| `system.view` | 80 | admin |
| `system.manage` | 100 | owner (dinámico) |

> `owner` recibe **todos** los permisos dinámicamente — no requiere entradas en `role_permissions`.

> Al eliminar un rol con `delete_role`, los usuarios asignados se reasignan automáticamente al rol con el nivel más bajo disponible (normalmente `guest`). Los roles del sistema `owner` y `guest` no pueden eliminarse.

> `duplicate_role` crea una copia exacta de un rol con todos sus permisos en una sola operación atómica.

### Añadir roles o permisos propios

Edita las secciones 1, 2 y 3 de `001_foundation.sql` antes de ejecutar las migraciones:

```sql
-- Agregar un nuevo rol
INSERT INTO public.roles (name, description, hierarchy_level) VALUES
    ('moderator', 'Moderar contenido', 50);

-- Agregar un nuevo permiso
INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('content.moderate', 'Moderar publicaciones', 50);

-- Asignarlo al rol
INSERT INTO public.role_permissions (role, permission) VALUES
    ('moderator', 'content.moderate');
```

---

## Solución de problemas

### El JWT no incluye `user_role`
→ El Auth Hook no está activado. Repite el [paso 4](#4-activar-el-auth-hook-️).

### Al iniciar sesión, `user_role` es `guest` aunque cambié el rol en la DB
→ El JWT se generó antes del cambio. Cierra sesión y vuelve a iniciarla.

### La migración falla con `extension "pgcrypto" does not exist`
→ Activa la extensión en Supabase: `Database → Extensions → pgcrypto → Enable`.
La función `verify_user_password` requiere `extensions.crypt`.

### Error `Permission denied` al llamar una RPC
→ El usuario no tiene el permiso requerido o es `guest`. Verifica el rol con:
```sql
SELECT role FROM public.profiles WHERE email = 'tu@email.com';
```

### El email de verificación no llega
→ En desarrollo, revisa el límite de 2 emails/hora del SMTP de prueba de Supabase. Usa el [Inbucket](https://supabase.com/docs/guides/auth/auth-email-templates#inbucket) local para desarrollo.
