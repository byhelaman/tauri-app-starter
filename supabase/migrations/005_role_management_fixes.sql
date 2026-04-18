-- ============================================================
-- 005: Correcciones de gestión de roles
--   1. delete_role  — fallback al rol más bajo en lugar de exigir nivel estrictamente inferior
--   2. duplicate_role — duplica un rol con sus permisos de forma atómica
-- ============================================================


-- ------------------------------------------------------------
-- 1. delete_role — usar el rol con nivel mínimo como fallback
-- ------------------------------------------------------------
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

    -- Fallback: el rol con el nivel más bajo disponible (excluyendo el que se elimina).
    -- Siempre existirá 'guest' (protegido como builtin) así que este query nunca retorna NULL.
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

    RETURN json_build_object(
        'success', true,
        'deleted_role', role_name,
        'fallback_role', fallback_role,
        'downgraded_users', downgraded_users
    );
END;
$$;


-- ------------------------------------------------------------
-- 2. duplicate_role — crea un rol con sus permisos de forma atómica
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.duplicate_role(p_source_role TEXT, p_new_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    source_level int;
    source_desc  text;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner';
    END IF;

    SELECT hierarchy_level, description
    INTO source_level, source_desc
    FROM public.roles
    WHERE name = p_source_role;

    IF source_level IS NULL THEN
        RAISE EXCEPTION 'Rol origen no encontrado: %', p_source_role;
    END IF;

    IF EXISTS (SELECT 1 FROM public.roles WHERE name = p_new_name) THEN
        RAISE EXCEPTION 'Ya existe un rol con el nombre: %', p_new_name;
    END IF;

    INSERT INTO public.roles (name, hierarchy_level, description)
    VALUES (p_new_name, source_level, source_desc);

    -- Copia los permisos del rol origen en una sola operación atómica.
    INSERT INTO public.role_permissions (role, permission)
    SELECT p_new_name, permission
    FROM public.role_permissions
    WHERE role = p_source_role;

    RETURN json_build_object('success', true, 'name', p_new_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.duplicate_role(text, text) TO authenticated;
