-- ============================================================
-- 007: Correcciones de seguridad y auditoría
-- ============================================================
-- Ejecutar después de `006_ai_chat.sql`.
--
-- Qué corrige:
--   1. execute_ai_query — LIMIT efectivo, statement_timeout, VOLATILE
--   2. delete_role — restaura auditoría y notificación
--   3. set_new_user_role — restaura guard "solo guests"
--   4. is_system_admin — helper común para evitar repetir el patrón
--   5. assign_role_permission — enforce permissions.min_role_level

-- ============================================================
-- 1. execute_ai_query — LIMIT real + statement_timeout
-- ============================================================
-- Cambios respecto a 006:
--   * VOLATILE: la función ejecuta SQL arbitrario, no debe declararse STABLE
--   * SECURITY INVOKER explícito (coincide con el comentario)
--   * statement_timeout local: corta queries largas a 5s
--   * LIMIT 500 dentro del subquery: aplica al scan, no al wrapper aggregado
CREATE OR REPLACE FUNCTION public.execute_ai_query(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
    result JSONB;
BEGIN
    IF NOT has_permission('ai.chat') THEN
        RAISE EXCEPTION 'Permission denied: requires ai.chat';
    END IF;

    -- Garantía de BD: bloquea escrituras a nivel de executor de PostgreSQL.
    PERFORM set_config('transaction_read_only', 'on', true);
    -- Corta queries que excedan 5 segundos para evitar saturar el pool de conexiones.
    PERFORM set_config('statement_timeout', '5000', true);

    -- LIMIT 500 dentro del subquery: aplica al scan, no a la fila única que devuelve jsonb_agg.
    EXECUTE format(
        'SELECT jsonb_agg(row_to_json(q)) FROM (SELECT * FROM (%s) inner_q LIMIT 500) q',
        query
    ) INTO result;

    RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_ai_query(text) TO authenticated;

-- ============================================================
-- 2. is_system_admin — helper para checks repetidos
-- ============================================================
-- Reemplaza el patrón:
--   has_permission('system.view') OR has_permission('users.view')
--   OR COALESCE((auth.jwt() ->> 'hierarchy_level')::int, 0) >= 80
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('system.view')
        OR public.has_permission('users.view')
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80;
$$;

GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;

-- Refactoriza las RPCs que repetían el patrón
CREATE OR REPLACE FUNCTION public.get_all_roles()
RETURNS TABLE (name TEXT, description TEXT, hierarchy_level INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_system_admin() THEN
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
    IF NOT public.is_system_admin() THEN
        RAISE EXCEPTION 'Permiso denegado: requiere system.view o users.view';
    END IF;

    RETURN QUERY
    SELECT p.name, p.description, p.min_role_level
    FROM public.permissions p
    ORDER BY p.min_role_level ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_role_permission_matrix()
RETURNS TABLE (role TEXT, permission TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_system_admin() THEN
        RAISE EXCEPTION 'Permiso denegado: requiere system.view o users.view';
    END IF;

    RETURN QUERY
    SELECT rp.role, rp.permission
    FROM public.role_permissions rp;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_audit_log(
    p_limit  INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id          BIGINT,
    action      TEXT,
    description TEXT,
    actor_email TEXT,
    target_id   UUID,
    metadata    JSONB,
    created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_system_admin() THEN
        RAISE EXCEPTION 'Permiso denegado: requiere system.view o users.view';
    END IF;

    RETURN QUERY
    SELECT a.id, a.action, a.description, a.actor_email, a.target_id, a.metadata, a.created_at
    FROM public.audit_log a
    ORDER BY a.created_at DESC
    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

-- ============================================================
-- 3. delete_role — restaura auditoría y notificación
-- ============================================================
-- La 005 simplificó esta función pero perdió las llamadas a log_audit_event
-- y notify_admins que la 003 había añadido. Esta versión recupera el audit
-- trail manteniendo la lógica de fallback al rol más bajo (intencional).
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

    -- Fallback al rol más bajo disponible (típicamente 'guest').
    -- Decisión intencional: caer al mínimo evita promover usuarios accidentalmente
    -- si el rol borrado tenía permisos restringidos respecto al inmediato inferior.
    SELECT r.name
    INTO fallback_role
    FROM public.roles r
    WHERE r.name <> role_name
    ORDER BY r.hierarchy_level ASC
    LIMIT 1;

    IF fallback_role IS NULL THEN
        RAISE EXCEPTION 'No se encontró un rol de fallback para reasignar usuarios';
    END IF;

    UPDATE public.profiles
    SET role = fallback_role
    WHERE role = role_name;
    GET DIAGNOSTICS downgraded_users = ROW_COUNT;

    DELETE FROM public.roles WHERE name = role_name;

    PERFORM public.log_audit_event(
        'role_deleted',
        format('Deleted role "%s" (%s users moved to "%s")', role_name, downgraded_users, fallback_role),
        NULL, NULL, NULL,
        jsonb_build_object('role_name', role_name, 'fallback_role', fallback_role, 'downgraded_users', downgraded_users)
    );
    PERFORM public.notify_admins(
        'Role deleted',
        format('Role "%s" has been deleted. %s users moved to "%s"', role_name, downgraded_users, fallback_role),
        'warning'
    );

    RETURN json_build_object(
        'success', true,
        'deleted_role', role_name,
        'fallback_role', fallback_role,
        'downgraded_users', downgraded_users
    );
END;
$$;

-- ============================================================
-- 4. set_new_user_role — restaura guard "solo guests"
-- ============================================================
-- La 003 eliminó el guard `target_current_level > 0` que la 002 incluía.
-- Sin este check, la función puede usarse sobre cualquier usuario, no solo
-- recién invitados. El trigger prevent_role_self_update todavía bloquea
-- demote-a-peer, pero esta defensa en profundidad ancla la semántica
-- "esta RPC es solo para el flujo de invite".
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
    target_email         text;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;

    SELECT p.role, r.hierarchy_level
    INTO target_current_role, target_current_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_current_role IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', target_user_id;
    END IF;

    -- Guard original de 002: solo aplica a usuarios guest (hierarchy = 0).
    -- Para cambiar el rol de usuarios existentes usar update_user_role().
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

    SELECT email INTO target_email FROM public.profiles WHERE id = target_user_id;

    PERFORM public.log_audit_event(
        'user_created',
        format('New user %s invited with role %s', COALESCE(target_email, target_user_id::text), target_role),
        NULL, NULL, target_user_id,
        jsonb_build_object('role', target_role)
    );
    PERFORM public.notify_admins(
        'New user invited',
        format('%s was invited with role %s', COALESCE(target_email, target_user_id::text), target_role),
        'success'
    );

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'role', target_role);
END;
$$;

-- ============================================================
-- 5. assign_role_permission — enforce min_role_level
-- ============================================================
-- La columna permissions.min_role_level se sembraba pero nunca se validaba.
-- Ahora bloquea asignar un permiso de nivel alto a un rol de nivel inferior.
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
    perm_min_level    int;
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

    SELECT min_role_level INTO perm_min_level
    FROM public.permissions
    WHERE name = permission_name;

    IF perm_min_level IS NULL THEN
        RAISE EXCEPTION 'Permiso no encontrado: %', permission_name;
    END IF;
    IF target_role_level < perm_min_level THEN
        RAISE EXCEPTION
            'El rol "%" (nivel %) no cumple el nivel mínimo % requerido por el permiso "%"',
            target_role, target_role_level, perm_min_level, permission_name;
    END IF;

    INSERT INTO public.role_permissions (role, permission)
    VALUES (target_role, permission_name)
    ON CONFLICT (role, permission) DO NOTHING;

    PERFORM public.log_audit_event(
        'permission_update',
        format('Granted "%s" to role "%s"', permission_name, target_role),
        NULL, NULL, NULL,
        jsonb_build_object('role', target_role, 'permission', permission_name, 'action', 'grant')
    );
    PERFORM public.notify_admins(
        'Permission granted',
        format('Permission "%s" granted to role "%s"', permission_name, target_role),
        'info'
    );

    RETURN json_build_object('success', true, 'role', target_role, 'permission', permission_name);
END;
$$;
