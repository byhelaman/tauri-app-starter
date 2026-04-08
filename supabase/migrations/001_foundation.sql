-- ============================================================
-- 001: Fundación — RBAC, Perfiles, JWT Hook
-- ============================================================
-- Ejecutar primero. Sin dependencias.
--
-- Qué configura:
--   1. Roles + Permisos + Asignaciones rol-permiso (RBAC)
--   2. Tabla de perfiles vinculada a auth.users
--   3. Auth hook: inyecta rol/permisos en los claims del JWT
--   4. Políticas RLS
--   5. Triggers de seguridad (bloquear auto-cambio de rol, edición de email)
--   6. RPCs de gestión de usuarios
--
-- Después de ejecutar:
--   → En el Dashboard de Supabase: Authentication → Hooks
--     → "Customize Access Token (JWT) Claims"
--     → Schema: public | Function: custom_access_token_hook
--     → Guardar

-- ============================================================
-- 1. ROLES
-- ============================================================
CREATE TABLE public.roles (
    name            TEXT PRIMARY KEY,
    description     TEXT,
    hierarchy_level INT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Seed de roles
-- Ajusta los niveles de jerarquía y agrega/elimina roles según tu app.
-- Reglas:
--   super_admin (100) : control total, no se puede eliminar
--   admin       (80)  : gestionar usuarios y configuración
--   member      (10)  : usuario autenticado estándar
--   guest       (0)   : no verificado / sin acceso a datos (asignado al registrarse)
INSERT INTO public.roles (name, description, hierarchy_level) VALUES
    ('super_admin', 'Control total del sistema',              100),
    ('admin',       'Gestionar usuarios y configuración',      80),
    ('member',      'Usuario autenticado estándar',            10),
    ('guest',       'Usuario no verificado, sin acceso',        0);

-- ============================================================
-- 2. PERMISOS
-- ============================================================
CREATE TABLE public.permissions (
    name            TEXT PRIMARY KEY,
    description     TEXT,
    min_role_level  INT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Seed de permisos
-- Agrega los permisos específicos de tu app siguiendo el mismo patrón.
INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('profile.read',    'Leer perfil propio',                    10),
    ('profile.update',  'Actualizar perfil propio',              10),
    ('users.view',      'Ver lista de usuarios',                 80),
    ('users.manage',    'Crear, editar y eliminar usuarios',     80),
    ('system.view',     'Ver configuración del sistema',         80),
    ('system.manage',   'Modificar configuración del sistema',  100);

-- ============================================================
-- 3. ASIGNACIONES ROL → PERMISO
-- ============================================================
CREATE TABLE public.role_permissions (
    role        TEXT REFERENCES public.roles(name) ON DELETE CASCADE,
    permission  TEXT REFERENCES public.permissions(name) ON DELETE CASCADE,
    PRIMARY KEY (role, permission)
);

CREATE INDEX idx_role_permissions_role       ON public.role_permissions(role);
CREATE INDEX idx_role_permissions_permission ON public.role_permissions(permission);

-- super_admin NO se inserta aquí — recibe todos los permisos dinámicamente
-- a través de custom_access_token_hook (rama hierarchy_level >= 100).
-- guest NO se inserta — no tiene permisos por diseño.
INSERT INTO public.role_permissions (role, permission) VALUES
    -- member: puede leer y actualizar su propio perfil
    ('member', 'profile.read'),
    ('member', 'profile.update'),
    -- admin: todos los permisos de member + gestión de usuarios y sistema
    ('admin',  'profile.read'),
    ('admin',  'profile.update'),
    ('admin',  'users.view'),
    ('admin',  'users.manage'),
    ('admin',  'system.view');

-- ============================================================
-- 4. PERFILES
-- ============================================================
CREATE TABLE public.profiles (
    id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email        TEXT        NOT NULL,
    display_name TEXT,
    role         TEXT        REFERENCES public.roles(name) DEFAULT 'guest' NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role  ON public.profiles(role);

-- ============================================================
-- 5. FUNCIONES UTILITARIAS
-- ============================================================

-- Actualiza automáticamente updated_at en cada modificación
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Crea el perfil automáticamente al registrarse un nuevo usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'guest'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 6. AUTH HOOK — Inyectar rol + permisos en el JWT
-- ============================================================
-- Se ejecuta en cada generación/renovación de token.
-- Claims personalizados añadidos: user_role, hierarchy_level, permissions[]
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    claims             jsonb;
    user_role          text;
    user_hierarchy     int;
    user_permissions   text[];
BEGIN
    SELECT p.role, r.hierarchy_level
    INTO user_role, user_hierarchy
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = (event ->> 'user_id')::uuid;

    claims := event -> 'claims';

    IF user_role IS NOT NULL THEN
        -- super_admin recibe todos los permisos automáticamente
        IF user_hierarchy >= 100 THEN
            SELECT array_agg(p.name)
            INTO user_permissions
            FROM public.permissions p;
        ELSE
            SELECT array_agg(rp.permission)
            INTO user_permissions
            FROM public.role_permissions rp
            WHERE rp.role = user_role;
        END IF;

        claims := jsonb_set(claims, '{user_role}',      to_jsonb(user_role));
        claims := jsonb_set(claims, '{hierarchy_level}',to_jsonb(user_hierarchy));
        claims := jsonb_set(claims, '{permissions}',    to_jsonb(COALESCE(user_permissions, ARRAY[]::text[])));
    ELSE
        -- Fallback para usuarios sin perfil aún
        claims := jsonb_set(claims, '{user_role}',       '"guest"');
        claims := jsonb_set(claims, '{hierarchy_level}', '0');
        claims := jsonb_set(claims, '{permissions}',     '[]');
    END IF;

    event := jsonb_set(event, '{claims}', claims);
    RETURN event;
END;
$$;

-- Acceso del hook al sistema de auth de Supabase
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT SELECT ON TABLE public.profiles        TO supabase_auth_admin;
GRANT SELECT ON TABLE public.roles           TO supabase_auth_admin;
GRANT SELECT ON TABLE public.role_permissions TO supabase_auth_admin;

-- ============================================================
-- 7. RPCs UTILITARIAS
-- ============================================================

-- Verifica un permiso desde el JWT (útil en RLS u otras RPCs)
CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_permissions jsonb;
BEGIN
    user_permissions := (auth.jwt() -> 'permissions')::jsonb;
    RETURN user_permissions ? required_permission;
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- Devuelve el perfil propio (lee de DB, no del JWT).
-- La lógica de permisos espeja exactamente custom_access_token_hook:
--   super_admin (hierarchy >= 100) → todos los permisos dinámicamente
--   todos los demás               → entradas explícitas de role_permissions
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id              uuid;
    v_email           text;
    v_display_name    text;
    v_role            text;
    v_hierarchy_level int;
    v_permissions     json;
BEGIN
    SELECT p.id, p.email, p.display_name, p.role, r.hierarchy_level
    INTO v_id, v_email, v_display_name, v_role, v_hierarchy_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = (SELECT auth.uid());

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_hierarchy_level >= 100 THEN
        SELECT COALESCE(json_agg(p.name ORDER BY p.name), '[]'::json)
        INTO v_permissions
        FROM public.permissions p;
    ELSE
        SELECT COALESCE(json_agg(rp.permission ORDER BY rp.permission), '[]'::json)
        INTO v_permissions
        FROM public.role_permissions rp
        WHERE rp.role = v_role;
    END IF;

    RETURN json_build_object(
        'id',              v_id,
        'email',           v_email,
        'display_name',    v_display_name,
        'role',            v_role,
        'hierarchy_level', v_hierarchy_level,
        'permissions',     v_permissions
    );
END;
$$;

-- Actualiza el display_name propio
CREATE OR REPLACE FUNCTION public.update_my_display_name(new_display_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.profiles SET display_name = new_display_name WHERE id = auth.uid();
END;
$$;

-- Verifica si un email ya existe — restringida a admins (hierarchy >= 80)
-- para evitar enumeración de usuarios por parte de usuarios no privilegiados.
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level')::int), 0);
    IF caller_level < 80 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de admin';
    END IF;
    RETURN EXISTS (SELECT 1 FROM public.profiles WHERE email = p_email);
END;
$$;

-- Verifica la contraseña propia (usar antes de operaciones sensibles como cambiar contraseña)
CREATE OR REPLACE FUNCTION public.verify_user_password(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id            UUID;
    v_encrypted_password TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT encrypted_password INTO v_encrypted_password
    FROM auth.users WHERE id = v_user_id;

    IF v_encrypted_password IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN v_encrypted_password = extensions.crypt(p_password, v_encrypted_password);
END;
$$;

-- ============================================================
-- 8. RPCs DE ADMINISTRACIÓN
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
    id               UUID,
    email            TEXT,
    display_name     TEXT,
    role             TEXT,
    hierarchy_level  INT,
    created_at       TIMESTAMPTZ,
    last_login_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('users.view') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.view';
    END IF;

    RETURN QUERY
    SELECT p.id, p.email, p.display_name, p.role, r.hierarchy_level,
           p.created_at, au.last_sign_in_at
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    LEFT JOIN auth.users au ON au.id = p.id
    ORDER BY r.hierarchy_level DESC, p.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_roles()
RETURNS TABLE (name TEXT, description TEXT, hierarchy_level INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT r.name, r.description, r.hierarchy_level
    FROM public.roles r
    ORDER BY r.hierarchy_level DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_all_permissions()
RETURNS TABLE (name TEXT, description TEXT, min_role_level INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.name, p.description, p.min_role_level
    FROM public.permissions p
    ORDER BY p.min_role_level ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_user_count()
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    user_count   int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);
    IF caller_level < 80 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de admin';
    END IF;
    SELECT COUNT(*) INTO user_count FROM public.profiles;
    RETURN user_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id UUID, new_role TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id           uuid;
    caller_level        int;
    target_level        int;
    new_role_level      int;
BEGIN
    caller_id    := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'No puedes modificar tu propio rol';
    END IF;

    SELECT r.hierarchy_level INTO target_level
    FROM public.profiles p JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_level IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
    IF target_level >= caller_level THEN
        RAISE EXCEPTION 'No puedes modificar un usuario con igual o mayor privilegio';
    END IF;

    SELECT hierarchy_level INTO new_role_level FROM public.roles WHERE name = new_role;
    IF new_role_level IS NULL THEN RAISE EXCEPTION 'Rol inválido: %', new_role; END IF;
    IF new_role_level >= caller_level THEN
        RAISE EXCEPTION 'No puedes asignar un rol con igual o mayor nivel que el tuyo';
    END IF;

    UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_role', new_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id    uuid;
    caller_level int;
    target_level int;
BEGIN
    caller_id    := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'No puedes eliminar tu propia cuenta';
    END IF;

    SELECT r.hierarchy_level INTO target_level
    FROM public.profiles p JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_level IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
    IF target_level >= 100 THEN RAISE EXCEPTION 'No puedes eliminar a otro super_admin'; END IF;
    IF target_level >= caller_level THEN
        RAISE EXCEPTION 'No puedes eliminar un usuario con igual o mayor privilegio';
    END IF;

    DELETE FROM auth.users WHERE id = target_user_id;
    RETURN json_build_object('success', true, 'deleted_user_id', target_user_id);
END;
$$;

-- Admin actualiza el display_name de otro usuario (también sincroniza auth.users metadata)
CREATE OR REPLACE FUNCTION public.update_user_display_name(
    target_user_id UUID,
    new_display_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id            uuid;
    caller_level         int;
    target_current_level int;
BEGIN
    caller_id    := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permiso denegado: usa update_my_display_name para tu propia cuenta';
    END IF;

    SELECT r.hierarchy_level INTO target_current_level
    FROM public.profiles p JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_current_level IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
    IF target_current_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes modificar un usuario con igual o mayor privilegio';
    END IF;

    UPDATE public.profiles SET display_name = new_display_name WHERE id = target_user_id;
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('display_name', new_display_name)
    WHERE id = target_user_id;

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_display_name', new_display_name);
END;
$$;

-- Asigna un rol a un usuario (sin verificar jerarquía del rol actual — para usuarios nuevos/guest)
CREATE OR REPLACE FUNCTION public.set_new_user_role(
    target_user_id UUID,
    target_role    TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level      int;
    target_role_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', target_role; END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes asignar un rol con igual o mayor nivel';
    END IF;

    UPDATE public.profiles SET role = target_role WHERE id = target_user_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no encontrado: %', target_user_id; END IF;

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'role', target_role);
END;
$$;

-- Elimina la propia cuenta.
-- Bloqueado si el usuario es el único super_admin del sistema.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    _uid         UUID := auth.uid();
    _user_role   TEXT;
    _super_count INT;
BEGIN
    IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

    SELECT role INTO _user_role FROM public.profiles WHERE id = _uid;

    IF _user_role = 'super_admin' THEN
        SELECT COUNT(*) INTO _super_count
        FROM public.profiles WHERE role = 'super_admin';

        IF _super_count <= 1 THEN
            RAISE EXCEPTION 'No puedes eliminar tu cuenta: eres el único super_admin del sistema';
        END IF;
    END IF;

    DELETE FROM auth.users WHERE id = _uid;
END;
$$;

-- ============================================================
-- 9. RPCs DE GESTIÓN DE ROLES
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_role(
    role_name        TEXT,
    role_description TEXT,
    role_level       INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de super_admin';
    END IF;
    IF role_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes crear un rol con igual o mayor nivel que el tuyo';
    END IF;
    IF EXISTS (SELECT 1 FROM public.roles WHERE name = role_name) THEN
        RAISE EXCEPTION 'El rol ya existe: %', role_name;
    END IF;

    INSERT INTO public.roles (name, description, hierarchy_level)
    VALUES (role_name, role_description, role_level);

    RETURN json_build_object('success', true, 'role_name', role_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_role(
    role_name       TEXT,
    new_description TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level      int;
    target_role_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de super_admin';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = role_name;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', role_name; END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes editar un rol con igual o mayor nivel';
    END IF;

    UPDATE public.roles SET description = new_description WHERE name = role_name;
    RETURN json_build_object('success', true, 'role_name', role_name);
END;
$$;

-- 'super_admin' y 'guest' son roles del sistema y no se pueden eliminar
CREATE OR REPLACE FUNCTION public.delete_role(role_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level      int;
    target_role_level int;
    users_with_role   int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de super_admin';
    END IF;
    IF role_name IN ('super_admin', 'guest') THEN
        RAISE EXCEPTION 'No se puede eliminar el rol del sistema: %', role_name;
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = role_name;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', role_name; END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes eliminar un rol con igual o mayor nivel';
    END IF;

    SELECT COUNT(*) INTO users_with_role FROM public.profiles WHERE role = role_name;
    IF users_with_role > 0 THEN
        RAISE EXCEPTION 'No se puede eliminar el rol: % usuarios están asignados a él', users_with_role;
    END IF;

    DELETE FROM public.roles WHERE name = role_name;
    RETURN json_build_object('success', true, 'deleted_role', role_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_role_permissions(target_role TEXT)
RETURNS TABLE (permission TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT rp.permission
    FROM public.role_permissions rp
    WHERE rp.role = target_role
    ORDER BY rp.permission;
$$;

-- Los permisos de 'super_admin' y 'guest' son inmutables
CREATE OR REPLACE FUNCTION public.assign_role_permission(
    target_role     TEXT,
    permission_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level      int;
    target_role_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de super_admin';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', target_role; END IF;
    IF target_role IN ('super_admin', 'guest') THEN
        RAISE EXCEPTION 'No se pueden modificar los permisos del rol del sistema: %', target_role;
    END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes modificar un rol con igual o mayor nivel';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE name = permission_name) THEN
        RAISE EXCEPTION 'Permiso no encontrado: %', permission_name;
    END IF;

    INSERT INTO public.role_permissions (role, permission)
    VALUES (target_role, permission_name)
    ON CONFLICT (role, permission) DO NOTHING;

    RETURN json_build_object('success', true, 'role', target_role, 'permission', permission_name);
END;
$$;

-- Los permisos de 'super_admin' y 'guest' son inmutables
CREATE OR REPLACE FUNCTION public.remove_role_permission(
    target_role     TEXT,
    permission_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level      int;
    target_role_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de super_admin';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', target_role; END IF;
    IF target_role IN ('super_admin', 'guest') THEN
        RAISE EXCEPTION 'No se pueden modificar los permisos del rol del sistema: %', target_role;
    END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes modificar un rol con igual o mayor nivel';
    END IF;

    DELETE FROM public.role_permissions
    WHERE role = target_role AND permission = permission_name;

    RETURN json_build_object('success', true, 'role', target_role, 'permission_removed', permission_name);
END;
$$;

-- ============================================================
-- 10. POLÍTICAS RLS
-- ============================================================
ALTER TABLE public.roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;

-- Fuerza RLS incluso para el owner de la tabla (role postgres).
-- Las funciones SECURITY DEFINER y service_role siguen bypasseando esto por diseño.
ALTER TABLE public.profiles         FORCE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer roles/permisos (necesario para la UI)
CREATE POLICY "roles_select" ON public.roles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "permissions_select" ON public.permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "role_permissions_select" ON public.role_permissions
    FOR SELECT TO authenticated USING (true);

-- Perfiles: fila propia O admin (nivel >= 80)
CREATE POLICY "profiles_select" ON public.profiles
    FOR SELECT USING (
        id = (SELECT auth.uid())
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

-- El rol debe ser 'guest' en inserts propios; service_role bypasea RLS para el trigger
CREATE POLICY "profiles_insert" ON public.profiles
    FOR INSERT WITH CHECK (
        id = (SELECT auth.uid())
        AND role = 'guest'
    );

CREATE POLICY "profiles_update" ON public.profiles
    FOR UPDATE USING (
        id = (SELECT auth.uid())
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

-- Solo super_admin puede eliminar perfiles (se propaga desde auth.users delete)
CREATE POLICY "profiles_delete" ON public.profiles
    FOR DELETE USING (
        COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 100
    );

-- ============================================================
-- 11. TRIGGERS DE SEGURIDAD
-- ============================================================

-- Bloquea cambios de email mediante UPDATE directo
CREATE OR REPLACE FUNCTION public.prevent_email_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    IF OLD.email IS DISTINCT FROM NEW.email THEN
        RAISE EXCEPTION 'No se permite modificar el email mediante update directo';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER check_email_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_email_modification();

-- Bloquea el auto-cambio de rol y hace cumplir las reglas de jerarquía.
-- Si auth.uid() es NULL (contexto service_role / migración), permite el cambio.
CREATE OR REPLACE FUNCTION public.prevent_role_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level         int;
    caller_id            uuid;
    target_current_level int;
    new_role_level       int;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN RETURN NEW; END IF;

    caller_level := COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0);

    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF OLD.id = caller_id THEN
            RAISE EXCEPTION 'No puedes modificar tu propio rol';
        END IF;
        IF caller_level < 80 THEN
            RAISE EXCEPTION 'No puedes cambiar roles sin privilegios de admin';
        END IF;

        SELECT r.hierarchy_level INTO target_current_level
        FROM public.roles r WHERE r.name = OLD.role;

        IF target_current_level >= caller_level THEN
            RAISE EXCEPTION 'No puedes modificar un usuario con igual o mayor privilegio';
        END IF;

        SELECT r.hierarchy_level INTO new_role_level
        FROM public.roles r WHERE r.name = NEW.role;

        IF new_role_level >= caller_level THEN
            RAISE EXCEPTION 'No puedes asignar un rol con igual o mayor nivel que el tuyo';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER check_role_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_update();

-- ============================================================
-- 12. GRANTS
-- ============================================================

-- RPCs utilitarias
GRANT EXECUTE ON FUNCTION public.has_permission(text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_display_name(text)     TO authenticated;
REVOKE ALL ON FUNCTION public.verify_user_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_user_password(text)       TO authenticated;

-- RPCs de administración
REVOKE ALL ON FUNCTION public.get_all_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_users()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_roles()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_permissions()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_count()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_display_name(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_new_user_role(uuid, text)    TO authenticated;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_own_account()             TO authenticated;

-- RPCs de gestión de roles (solo super_admin — verificado dentro de cada función)
GRANT EXECUTE ON FUNCTION public.create_role(text, text, int)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_role(text, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_role(text)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_permissions(text)       TO authenticated;
REVOKE ALL ON FUNCTION public.assign_role_permission(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_role_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_role_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_role_permission(text, text) TO authenticated;

-- ============================================================
-- 13. PASO MANUAL REQUERIDO
-- ============================================================
-- En el Dashboard de Supabase → Authentication → Hooks:
--   "Customize Access Token (JWT) Claims"
--   Schema: public
--   Function: custom_access_token_hook
--   → Guardar
