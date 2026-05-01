-- ============================================================
-- 001: Fundación Core — RBAC base, Perfiles, JWT Hook
-- ============================================================
-- Ejecutar primero. Sin dependencias.
--
-- Qué configura:
--   1. Roles + Permisos + Asignaciones rol-permiso (RBAC base)
--   2. Tabla de perfiles vinculada a auth.users
--   3. Auth hook: inyecta rol/permisos en los claims del JWT
--   4. Políticas RLS
--   5. Triggers de seguridad (bloquear auto-cambio de rol, edición de email)
--   6. RPCs utilitarias
--
-- Después de ejecutar:
--   → Ejecutar también `002_admin_rbac.sql` (RPCs de administración)
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
--   owner (100) : control total, no se puede eliminar
--   admin       (80)  : gestionar usuarios y configuración
--   member      (10)  : usuario autenticado estándar
--   guest       (0)   : no verificado / sin acceso a datos (asignado al registrarse)
INSERT INTO public.roles (name, description, hierarchy_level) VALUES
    ('owner',       'Control total del sistema',              100),
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
    role        TEXT REFERENCES public.roles(name) ON UPDATE CASCADE ON DELETE CASCADE,
    permission  TEXT REFERENCES public.permissions(name) ON DELETE CASCADE,
    PRIMARY KEY (role, permission)
);

CREATE INDEX idx_role_permissions_role       ON public.role_permissions(role);
CREATE INDEX idx_role_permissions_permission ON public.role_permissions(permission);

-- owner NO se inserta aquí — recibe todos los permisos dinámicamente
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
    role         TEXT        REFERENCES public.roles(name) ON UPDATE CASCADE DEFAULT 'guest' NOT NULL,
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
        -- owner recibe todos los permisos automáticamente
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
GRANT SELECT ON TABLE public.profiles         TO supabase_auth_admin;
GRANT SELECT ON TABLE public.roles            TO supabase_auth_admin;
GRANT SELECT ON TABLE public.role_permissions TO supabase_auth_admin;

-- ============================================================
-- 7. RPCs UTILITARIAS
-- ============================================================

-- Verifica un permiso desde el JWT y corrobora existencia en profiles
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
    -- 1. Verificación rápida en el JWT
    user_permissions := (auth.jwt() -> 'permissions')::jsonb;
    IF NOT COALESCE(user_permissions ? required_permission, false) THEN
        RETURN false;
    END IF;

    -- 2. Verificación de identidad real en la DB.
    --    Protege contra sesiones zombie (JWT válido pero usuario eliminado o DB reseteada).
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid()
    ) THEN
        RETURN false;
    END IF;

    RETURN true;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'has_permission(%) falló inesperadamente: %', required_permission, SQLERRM;
    RETURN false;
END;
$$;

-- Verifica permisos contra la base de datos viva, no contra claims del JWT.
-- Usar en RPCs sensibles donde una revocación debe aplicar sin esperar al refresh del token.
CREATE OR REPLACE FUNCTION public.has_permission_live(required_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_level int;
BEGIN
    SELECT p.role, r.hierarchy_level
    INTO v_role, v_level
    FROM public.profiles p
    JOIN public.roles r ON r.name = p.role
    WHERE p.id = (SELECT auth.uid());

    IF v_role IS NULL THEN
        RETURN false;
    END IF;

    IF v_level >= 100 THEN
        RETURN EXISTS (
            SELECT 1
            FROM public.permissions p
            WHERE p.name = required_permission
        );
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        WHERE rp.role = v_role
          AND rp.permission = required_permission
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'has_permission_live(%) falló inesperadamente: %', required_permission, SQLERRM;
    RETURN false;
END;
$$;

-- Devuelve el perfil propio (lee de DB, no del JWT).
-- La lógica de permisos espeja exactamente custom_access_token_hook:
--   owner (hierarchy >= 100) → todos los permisos dinámicamente
--   todos los demás          → entradas explícitas de role_permissions
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
    UPDATE public.profiles
    SET display_name = new_display_name
    WHERE id = auth.uid();
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
    FROM auth.users
    WHERE id = v_user_id;

    IF v_encrypted_password IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN v_encrypted_password = extensions.crypt(p_password, v_encrypted_password);
END;
$$;

-- ============================================================
-- 8. POLÍTICAS RLS
-- ============================================================
ALTER TABLE public.roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;

-- Fuerza RLS incluso para el owner de la tabla (role postgres).
-- Las funciones SECURITY DEFINER y service_role siguen bypasseando esto por diseño.
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer roles/permisos (necesario para la UI)
CREATE POLICY "roles_select" ON public.roles
    FOR SELECT TO authenticated
    USING (
        name = (SELECT auth.jwt() ->> 'user_role')
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

CREATE POLICY "permissions_select" ON public.permissions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.role_permissions rp
            WHERE rp.permission = permissions.name
              AND rp.role = (SELECT auth.jwt() ->> 'user_role')
        )
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

CREATE POLICY "role_permissions_select" ON public.role_permissions
    FOR SELECT TO authenticated
    USING (
        role = (SELECT auth.jwt() ->> 'user_role')
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

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

-- Solo owner puede eliminar perfiles (se propaga desde auth.users delete)
CREATE POLICY "profiles_delete" ON public.profiles
    FOR DELETE USING (
        COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 100
    );

-- ============================================================
-- 9. TRIGGERS DE SEGURIDAD
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
        FROM public.roles r
        WHERE r.name = OLD.role;

        IF target_current_level >= caller_level THEN
            RAISE EXCEPTION 'No puedes modificar un usuario con igual o mayor privilegio';
        END IF;

        SELECT r.hierarchy_level INTO new_role_level
        FROM public.roles r
        WHERE r.name = NEW.role;

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
-- 10. GRANTS (UTILITARIAS)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.has_permission(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission_live(text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_display_name(text)  TO authenticated;
REVOKE ALL ON FUNCTION public.verify_user_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_user_password(text)    TO authenticated;

-- ============================================================
-- 11. HABILITAR REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.role_permissions;

-- ============================================================
-- 12. PASO MANUAL REQUERIDO
-- ============================================================
-- En el Dashboard de Supabase → Authentication → Hooks:
--   "Customize Access Token (JWT) Claims"
--   Schema: public
--   Function: custom_access_token_hook
--   → Guardar
--
-- Luego ejecuta `supabase/migrations/002_admin_rbac.sql`.
