-- ============================================================
-- 002: Administración RBAC — RPCs y Grants
-- ============================================================
-- Ejecutar después de `001_foundation.sql`.
--
-- Qué configura:
--   1. RPCs de administración de usuarios
--   2. RPCs de gestión de roles y permisos
--   3. Grants de ejecución para funciones administrativas

-- ============================================================
-- 1. RPCs DE ADMINISTRACIÓN
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('system.view')
       AND NOT public.has_permission('users.view')
       AND COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0) < 80 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere system.view o users.view';
    END IF;

    RETURN QUERY
    SELECT r.name, r.description, r.hierarchy_level
    FROM public.roles r
    ORDER BY r.hierarchy_level DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_permissions()
RETURNS TABLE (name TEXT, description TEXT, min_role_level INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('system.view')
       AND NOT public.has_permission('users.view')
       AND COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0) < 80 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere system.view o users.view';
    END IF;

    RETURN QUERY
    SELECT p.name, p.description, p.min_role_level
    FROM public.permissions p
    ORDER BY p.min_role_level ASC;
END;
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
    caller_id      uuid;
    caller_level   int;
    target_level   int;
    new_role_level int;
BEGIN
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'No puedes modificar tu propio rol';
    END IF;

    SELECT r.hierarchy_level INTO target_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_level IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
    IF target_level >= caller_level THEN
        RAISE EXCEPTION 'No puedes modificar un usuario con igual o mayor privilegio';
    END IF;

    SELECT hierarchy_level INTO new_role_level
    FROM public.roles
    WHERE name = new_role;

    IF new_role_level IS NULL THEN RAISE EXCEPTION 'Rol inválido: %', new_role; END IF;
    IF new_role_level >= caller_level THEN
        RAISE EXCEPTION 'No puedes asignar un rol con igual o mayor nivel que el tuyo';
    END IF;

    UPDATE public.profiles
    SET role = new_role
    WHERE id = target_user_id;

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
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'No puedes eliminar tu propia cuenta';
    END IF;

    SELECT r.hierarchy_level INTO target_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_level IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
    IF target_level >= 100 THEN RAISE EXCEPTION 'No puedes eliminar a otro owner'; END IF;
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
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permiso denegado: usa update_my_display_name para tu propia cuenta';
    END IF;

    SELECT r.hierarchy_level INTO target_current_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_current_level IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
    IF target_current_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes modificar un usuario con igual o mayor privilegio';
    END IF;

    UPDATE public.profiles
    SET display_name = new_display_name
    WHERE id = target_user_id;

    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('display_name', new_display_name)
    WHERE id = target_user_id;

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_display_name', new_display_name);
END;
$$;

-- Asigna un rol inicial a un usuario recién creado (solo aplica a usuarios con rol 'guest').
-- Para cambiar el rol de usuarios existentes usar update_user_role().
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
    caller_level         int;
    target_role_level    int;
    target_current_role  text;
    target_current_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;

    -- Verificar que el usuario objetivo existe y obtener su rol actual
    SELECT p.role, r.hierarchy_level
    INTO target_current_role, target_current_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_current_role IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', target_user_id;
    END IF;

    -- Esta función es exclusiva para usuarios guest (hierarchy_level = 0).
    -- Previene el bypass de jerarquía: sin esta validación se podría usar esta función
    -- sobre usuarios existentes saltándose las comprobaciones de update_user_role().
    IF target_current_level > 0 THEN
        RAISE EXCEPTION
            'set_new_user_role solo aplica a usuarios guest. Usa update_user_role() para el usuario %',
            target_user_id;
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles
    WHERE name = target_role;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', target_role; END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes asignar un rol con igual o mayor nivel';
    END IF;

    UPDATE public.profiles
    SET role = target_role
    WHERE id = target_user_id;

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'role', target_role);
END;
$$;

-- Elimina la propia cuenta.
-- Bloqueado si el usuario es el único owner del sistema.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    _uid         UUID := auth.uid();
    _user_role   TEXT;
    _owner_count INT;
BEGIN
    IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

    SELECT role INTO _user_role
    FROM public.profiles
    WHERE id = _uid;

    IF _user_role = 'owner' THEN
        SELECT COUNT(*) INTO _owner_count
        FROM public.profiles
        WHERE role = 'owner';

        IF _owner_count <= 1 THEN
            RAISE EXCEPTION 'No puedes eliminar tu cuenta: eres el único owner del sistema';
        END IF;
    END IF;

    DELETE FROM auth.users WHERE id = _uid;
END;
$$;

-- ============================================================
-- 2. RPCs DE GESTIÓN DE ROLES
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
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner';
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
    new_name        TEXT DEFAULT NULL,
    new_description TEXT DEFAULT NULL,
    new_level       INT  DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level      int;
    target_role_name  text;
    target_role_desc  text;
    target_role_level int;
    effective_name    text;
    effective_desc    text;
    effective_level   int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner';
    END IF;

    SELECT r.name, r.description, r.hierarchy_level
    INTO target_role_name, target_role_desc, target_role_level
    FROM public.roles r
    WHERE r.name = role_name;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', role_name; END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes editar un rol con igual o mayor nivel';
    END IF;

    effective_name  := COALESCE(NULLIF(btrim(new_name), ''), target_role_name);
    effective_desc  := COALESCE(new_description, target_role_desc);
    effective_level := COALESCE(new_level, target_role_level);

    IF role_name IN ('owner', 'guest') THEN
        IF effective_name <> role_name THEN
            RAISE EXCEPTION 'No se puede renombrar el rol del sistema: %', role_name;
        END IF;
        IF effective_level <> target_role_level THEN
            RAISE EXCEPTION 'No se puede cambiar la jerarquía del rol del sistema: %', role_name;
        END IF;
    END IF;

    IF effective_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes asignar un nivel igual o mayor al tuyo';
    END IF;

    IF effective_name <> role_name
       AND EXISTS (SELECT 1 FROM public.roles r WHERE r.name = effective_name) THEN
        RAISE EXCEPTION 'El rol ya existe: %', effective_name;
    END IF;

    -- Gracias a ON UPDATE CASCADE en profiles/role_permissions, el rename
    -- se propaga de forma automática y consistente.
    UPDATE public.roles
    SET name = effective_name,
        description = effective_desc,
        hierarchy_level = effective_level
    WHERE name = role_name;

    RETURN json_build_object(
        'success', true,
        'old_role', role_name,
        'role_name', effective_name,
        'hierarchy_level', effective_level,
        'renamed', effective_name <> role_name
    );
END;
$$;

-- 'owner' y 'guest' son roles del sistema y no se pueden eliminar
CREATE OR REPLACE FUNCTION public.delete_role(role_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level      int;
    target_role_level int;
    fallback_role     text;
    downgraded_users  int := 0;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner';
    END IF;
    IF role_name IN ('owner', 'guest') THEN
        RAISE EXCEPTION 'No se puede eliminar el rol del sistema: %', role_name;
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles
    WHERE name = role_name;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', role_name; END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes eliminar un rol con igual o mayor nivel';
    END IF;

    -- Downgrade automático: busca el rol más alto inmediatamente inferior.
    SELECT r.name
    INTO fallback_role
    FROM public.roles r
    WHERE r.name <> role_name
      AND r.hierarchy_level < target_role_level
    ORDER BY r.hierarchy_level DESC
    LIMIT 1;

    IF fallback_role IS NULL THEN
        RAISE EXCEPTION 'No existe un rol inferior para reasignar usuarios antes de eliminar: %', role_name;
    END IF;

    UPDATE public.profiles
    SET role = fallback_role
    WHERE role = role_name;
    GET DIAGNOSTICS downgraded_users = ROW_COUNT;

    DELETE FROM public.roles WHERE name = role_name;

    RETURN json_build_object(
        'success', true,
        'deleted_role', role_name,
        'fallback_role', fallback_role,
        'downgraded_users', downgraded_users
    );
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

CREATE OR REPLACE FUNCTION public.get_role_permission_matrix()
RETURNS TABLE (role TEXT, permission TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('system.view')
       AND NOT public.has_permission('users.view')
       AND COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0) < 80 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere system.view o users.view';
    END IF;

    RETURN QUERY
    SELECT rp.role, rp.permission
    FROM public.role_permissions rp;
END;
$$;

-- Los permisos de 'owner' y 'guest' son inmutables
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
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles
    WHERE name = target_role;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', target_role; END IF;
    IF target_role IN ('owner', 'guest') THEN
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

-- Los permisos de 'owner' y 'guest' son inmutables
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
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles
    WHERE name = target_role;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', target_role; END IF;
    IF target_role IN ('owner', 'guest') THEN
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
-- 3. GRANTS (ADMIN + GESTIÓN DE ROLES)
-- ============================================================

-- RPCs de administración
REVOKE ALL ON FUNCTION public.get_all_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_display_name(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_new_user_role(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

-- RPCs de gestión de roles (solo owner — verificado dentro de cada función)
GRANT EXECUTE ON FUNCTION public.create_role(text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_role(text, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_permissions(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_permission_matrix() TO authenticated;
REVOKE ALL ON FUNCTION public.assign_role_permission(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_role_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_role_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_role_permission(text, text) TO authenticated;
