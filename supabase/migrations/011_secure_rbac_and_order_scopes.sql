-- ============================================================
-- 011: RBAC live, permisos granulares de orders y scopes masivos
-- ============================================================

-- Búsqueda ILIKE eficiente para customer/code/product.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DROP INDEX IF EXISTS public.idx_orders_search_trgm;
CREATE INDEX idx_orders_search_trgm ON public.orders USING gin (
    ((coalesce(customer,'') || ' ' || coalesce(code,'') || ' ' || coalesce(product,'')) extensions.gin_trgm_ops)
) WHERE deleted_at IS NULL;

-- Jerarquía live desde DB. El JWT queda como caché para UI.
CREATE OR REPLACE FUNCTION public.get_current_user_level()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE((
        SELECT r.hierarchy_level
        FROM public.profiles p
        JOIN public.roles r ON r.name = p.role
        WHERE p.id = (SELECT auth.uid())
    ), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_current_user_level() TO authenticated;

-- Permisos granulares para orders. Mantener orders.manage solo como legado.
INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('orders.create',      'Crear órdenes',                  10),
    ('orders.update',      'Editar órdenes',                 10),
    ('orders.delete',      'Eliminar una orden',             80),
    ('orders.bulk_delete', 'Eliminar órdenes masivamente',   80),
    ('orders.copy',        'Copiar datos de órdenes',        80)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, permission) VALUES
    ('member', 'orders.view'),
    ('member', 'orders.create'),
    ('member', 'orders.update'),
    ('admin',  'orders.view'),
    ('admin',  'orders.create'),
    ('admin',  'orders.update'),
    ('admin',  'orders.delete'),
    ('admin',  'orders.bulk_delete'),
    ('admin',  'orders.export'),
    ('admin',  'orders.copy')
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions
WHERE role = 'member'
  AND permission IN ('orders.manage', 'orders.export', 'orders.delete', 'orders.bulk_delete', 'orders.copy');

-- RLS orders/queue con permisos específicos.
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_update" ON public.orders;
DROP POLICY IF EXISTS "orders_delete" ON public.orders;
DROP POLICY IF EXISTS "queue_insert" ON public.queue_orders;
DROP POLICY IF EXISTS "queue_update" ON public.queue_orders;
DROP POLICY IF EXISTS "queue_delete" ON public.queue_orders;

CREATE POLICY "orders_insert" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.has_permission_live('orders.create')));

CREATE POLICY "orders_update" ON public.orders
    FOR UPDATE TO authenticated
    USING  ((SELECT public.has_permission_live('orders.update')))
    WITH CHECK ((SELECT public.has_permission_live('orders.update')));

CREATE POLICY "orders_delete" ON public.orders
    FOR DELETE TO authenticated
    USING ((SELECT public.has_permission_live('orders.delete')));

CREATE POLICY "queue_insert" ON public.queue_orders
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.has_permission_live('orders.create')));

CREATE POLICY "queue_update" ON public.queue_orders
    FOR UPDATE TO authenticated
    USING  ((SELECT public.has_permission_live('orders.update')))
    WITH CHECK ((SELECT public.has_permission_live('orders.update')));

CREATE POLICY "queue_delete" ON public.queue_orders
    FOR DELETE TO authenticated
    USING ((SELECT public.has_permission_live('orders.delete')));

-- Evitar jerarquía obsoleta en helpers/RPCs base.
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (SELECT public.get_current_user_level()) < 80 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de admin';
    END IF;
    RETURN EXISTS (SELECT 1 FROM public.profiles WHERE email = p_email);
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
    user_count INT;
BEGIN
    IF (SELECT public.get_current_user_level()) < 80 THEN
        RAISE EXCEPTION 'Permiso denegado: requiere privilegios de admin';
    END IF;

    SELECT COUNT(*) INTO user_count FROM public.profiles;
    RETURN user_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_role_permissions(target_role TEXT)
RETURNS TABLE (permission TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_role TEXT;
BEGIN
    SELECT p.role INTO caller_role
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid());

    IF caller_role IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    IF target_role <> caller_role
       AND NOT (SELECT public.has_permission_live('system.view'))
       AND NOT (SELECT public.has_permission_live('users.view')) THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes consultar permisos de otro rol';
    END IF;

    RETURN QUERY
    SELECT rp.permission
    FROM public.role_permissions rp
    WHERE rp.role = target_role
    ORDER BY rp.permission;
END;
$$;

-- Triggers de perfiles con jerarquía live.
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

    caller_level := (SELECT public.get_current_user_level());

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

-- RLS de RBAC: mantener lectura para UI, pero evaluar admin/owner en vivo.
DROP POLICY IF EXISTS "roles_select" ON public.roles;
DROP POLICY IF EXISTS "permissions_select" ON public.permissions;
DROP POLICY IF EXISTS "role_permissions_select" ON public.role_permissions;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "roles_select" ON public.roles
    FOR SELECT TO authenticated
    USING (
        name = (SELECT auth.jwt() ->> 'user_role')
        OR (SELECT public.get_current_user_level()) >= 80
    );

CREATE POLICY "permissions_select" ON public.permissions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.role_permissions rp
            WHERE rp.permission = permissions.name
              AND rp.role = (SELECT auth.jwt() ->> 'user_role')
        )
        OR (SELECT public.get_current_user_level()) >= 80
    );

CREATE POLICY "role_permissions_select" ON public.role_permissions
    FOR SELECT TO authenticated
    USING (
        role = (SELECT auth.jwt() ->> 'user_role')
        OR (SELECT public.get_current_user_level()) >= 80
    );

CREATE POLICY "profiles_select" ON public.profiles
    FOR SELECT USING (
        id = (SELECT auth.uid())
        OR (SELECT public.get_current_user_level()) >= 80
    );

CREATE POLICY "profiles_update" ON public.profiles
    FOR UPDATE USING (
        id = (SELECT auth.uid())
        OR (SELECT public.get_current_user_level()) >= 80
    );

CREATE POLICY "profiles_delete" ON public.profiles
    FOR DELETE USING ((SELECT public.get_current_user_level()) >= 100);

-- Administración de usuarios/roles con jerarquía live.
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
    target_email   text;
    old_role       text;
BEGIN
    caller_id := auth.uid();
    caller_level := (SELECT public.get_current_user_level());

    IF NOT (SELECT public.has_permission_live('users.manage')) THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'No puedes modificar tu propio rol';
    END IF;

    SELECT p.email, p.role, r.hierarchy_level INTO target_email, old_role, target_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
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

    PERFORM public.log_audit_event(
        'role_change',
        format('Changed %s role from %s to %s', target_email, old_role, new_role),
        caller_id, NULL, target_user_id,
        jsonb_build_object('old_role', old_role, 'new_role', new_role)
    );
    PERFORM public.notify_user(target_user_id, 'Role updated', format('Your role has been changed to %s', new_role), 'info');
    PERFORM public.notify_admins('Role change', format('%s role changed from %s to %s', target_email, old_role, new_role), 'info');

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
    target_email text;
BEGIN
    caller_id := auth.uid();
    caller_level := (SELECT public.get_current_user_level());

    IF NOT (SELECT public.has_permission_live('users.manage')) THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'No puedes eliminar tu propia cuenta';
    END IF;

    SELECT p.email, r.hierarchy_level INTO target_email, target_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_level IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
    IF target_level >= 100 THEN RAISE EXCEPTION 'No puedes eliminar a otro owner'; END IF;
    IF target_level >= caller_level THEN
        RAISE EXCEPTION 'No puedes eliminar un usuario con igual o mayor privilegio';
    END IF;

    PERFORM public.log_audit_event(
        'user_removed',
        format('Removed user %s', COALESCE(target_email, target_user_id::text)),
        caller_id, NULL, target_user_id,
        jsonb_build_object('email', target_email)
    );
    PERFORM public.notify_admins(
        'User removed',
        format('%s has been removed from the workspace', COALESCE(target_email, target_user_id::text)),
        'warning'
    );

    DELETE FROM auth.users WHERE id = target_user_id;
    RETURN json_build_object('success', true, 'deleted_user_id', target_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_display_name(target_user_id UUID, new_display_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id            uuid;
    caller_level         int;
    target_current_level int;
    target_email         text;
BEGIN
    caller_id := auth.uid();
    caller_level := (SELECT public.get_current_user_level());

    IF NOT (SELECT public.has_permission_live('users.manage')) THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permiso denegado: usa update_my_display_name para tu propia cuenta';
    END IF;

    SELECT p.email, r.hierarchy_level INTO target_email, target_current_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_current_level IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
    IF target_current_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes modificar un usuario con igual o mayor privilegio';
    END IF;

    UPDATE public.profiles SET display_name = new_display_name WHERE id = target_user_id;
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('display_name', new_display_name)
    WHERE id = target_user_id;

    PERFORM public.log_audit_event(
        'display_name_change',
        format('Changed display name for %s to "%s"', COALESCE(target_email, target_user_id::text), new_display_name),
        caller_id, NULL, target_user_id,
        jsonb_build_object('new_display_name', new_display_name)
    );

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_display_name', new_display_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_new_user_role(target_user_id UUID, target_role TEXT)
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
    caller_level := (SELECT public.get_current_user_level());

    IF NOT (SELECT public.has_permission_live('users.manage')) THEN
        RAISE EXCEPTION 'Permiso denegado: requiere users.manage';
    END IF;

    SELECT p.role, r.hierarchy_level, p.email
    INTO target_current_role, target_current_level, target_email
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_current_role IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado: %', target_user_id; END IF;
    IF target_current_level > 0 THEN
        RAISE EXCEPTION 'set_new_user_role solo aplica a usuarios guest. Usa update_user_role() para el usuario %', target_user_id;
    END IF;

    SELECT hierarchy_level INTO target_role_level FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', target_role; END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permiso denegado: no puedes asignar un rol con igual o mayor nivel';
    END IF;

    UPDATE public.profiles SET role = target_role WHERE id = target_user_id;

    PERFORM public.log_audit_event(
        'role_assigned',
        format('Assigned %s role to %s', target_role, COALESCE(target_email, target_user_id::text)),
        auth.uid(), NULL, target_user_id,
        jsonb_build_object('role', target_role, 'email', target_email)
    );

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'role', target_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_role(role_name TEXT, role_description TEXT, role_level INT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
BEGIN
    caller_level := (SELECT public.get_current_user_level());

    IF caller_level < 100 THEN RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner'; END IF;
    IF role_level >= caller_level THEN RAISE EXCEPTION 'Permiso denegado: no puedes crear un rol con igual o mayor nivel que el tuyo'; END IF;
    IF EXISTS (SELECT 1 FROM public.roles WHERE name = role_name) THEN RAISE EXCEPTION 'El rol ya existe: %', role_name; END IF;

    INSERT INTO public.roles (name, description, hierarchy_level)
    VALUES (role_name, role_description, role_level);

    PERFORM public.log_audit_event('role_created', format('Created role "%s"', role_name), auth.uid(), NULL, NULL, jsonb_build_object('role_name', role_name, 'hierarchy_level', role_level));
    PERFORM public.notify_admins('Role created', format('Role "%s" has been created', role_name), 'info');

    RETURN json_build_object('success', true, 'role_name', role_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_role(role_name TEXT, new_name TEXT DEFAULT NULL, new_description TEXT DEFAULT NULL, new_level INT DEFAULT NULL)
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
    caller_level := (SELECT public.get_current_user_level());

    IF caller_level < 100 THEN RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner'; END IF;

    SELECT r.name, r.description, r.hierarchy_level
    INTO target_role_name, target_role_desc, target_role_level
    FROM public.roles r
    WHERE r.name = role_name;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', role_name; END IF;
    IF target_role_level >= caller_level THEN RAISE EXCEPTION 'Permiso denegado: no puedes editar un rol con igual o mayor nivel'; END IF;

    effective_name  := COALESCE(NULLIF(btrim(new_name), ''), target_role_name);
    effective_desc  := COALESCE(new_description, target_role_desc);
    effective_level := COALESCE(new_level, target_role_level);

    IF role_name IN ('owner', 'guest') THEN
        IF effective_name <> role_name THEN RAISE EXCEPTION 'No se puede renombrar el rol del sistema: %', role_name; END IF;
        IF effective_level <> target_role_level THEN RAISE EXCEPTION 'No se puede cambiar la jerarquía del rol del sistema: %', role_name; END IF;
    END IF;

    IF effective_level >= caller_level THEN RAISE EXCEPTION 'Permiso denegado: no puedes asignar un nivel igual o mayor al tuyo'; END IF;
    IF effective_name <> role_name AND EXISTS (SELECT 1 FROM public.roles r WHERE r.name = effective_name) THEN
        RAISE EXCEPTION 'El rol ya existe: %', effective_name;
    END IF;

    UPDATE public.roles
    SET name = effective_name, description = effective_desc, hierarchy_level = effective_level
    WHERE name = role_name;

    PERFORM public.log_audit_event('role_updated', format('Updated role "%s"', role_name), auth.uid(), NULL, NULL, jsonb_build_object('old_role', role_name, 'new_role', effective_name, 'hierarchy_level', effective_level));
    PERFORM public.notify_admins('Role updated', format('Role "%s" has been updated', effective_name), 'info');

    RETURN json_build_object('success', true, 'old_role', role_name, 'role_name', effective_name, 'hierarchy_level', effective_level, 'renamed', effective_name <> role_name);
END;
$$;

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
    caller_level := (SELECT public.get_current_user_level());

    IF caller_level < 100 THEN RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner'; END IF;
    IF role_name IN ('owner', 'guest') THEN RAISE EXCEPTION 'No se puede eliminar el rol del sistema: %', role_name; END IF;

    SELECT hierarchy_level INTO target_role_level FROM public.roles WHERE name = role_name;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', role_name; END IF;
    IF target_role_level >= caller_level THEN RAISE EXCEPTION 'Permiso denegado: no puedes eliminar un rol con igual o mayor nivel'; END IF;

    SELECT r.name INTO fallback_role
    FROM public.roles r
    WHERE r.name <> role_name
    ORDER BY r.hierarchy_level ASC
    LIMIT 1;

    IF fallback_role IS NULL THEN RAISE EXCEPTION 'No se encontró un rol de fallback para reasignar usuarios'; END IF;

    UPDATE public.profiles SET role = fallback_role WHERE role = role_name;
    GET DIAGNOSTICS downgraded_users = ROW_COUNT;
    DELETE FROM public.roles WHERE name = role_name;

    PERFORM public.log_audit_event('role_deleted', format('Deleted role "%s" (%s users moved to "%s")', role_name, downgraded_users, fallback_role), auth.uid(), NULL, NULL, jsonb_build_object('role_name', role_name, 'fallback_role', fallback_role, 'downgraded_users', downgraded_users));
    PERFORM public.notify_admins('Role deleted', format('Role "%s" has been deleted. %s users moved to "%s"', role_name, downgraded_users, fallback_role), 'warning');

    RETURN json_build_object('success', true, 'deleted_role', role_name, 'fallback_role', fallback_role, 'downgraded_users', downgraded_users);
END;
$$;

CREATE OR REPLACE FUNCTION public.duplicate_role(p_source_role TEXT, p_new_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level      int;
    source_role_desc  text;
    source_role_level int;
    perms_copied      int := 0;
BEGIN
    caller_level := (SELECT public.get_current_user_level());

    IF caller_level < 100 THEN RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner'; END IF;

    SELECT r.description, r.hierarchy_level
    INTO source_role_desc, source_role_level
    FROM public.roles r
    WHERE r.name = p_source_role;

    IF source_role_level IS NULL THEN RAISE EXCEPTION 'Rol origen no encontrado: %', p_source_role; END IF;
    IF source_role_level >= caller_level THEN RAISE EXCEPTION 'Permiso denegado: no puedes duplicar un rol con igual o mayor nivel'; END IF;
    IF EXISTS (SELECT 1 FROM public.roles r WHERE r.name = p_new_name) THEN RAISE EXCEPTION 'Ya existe un rol con el nombre: %', p_new_name; END IF;

    INSERT INTO public.roles (name, description, hierarchy_level)
    VALUES (p_new_name, format('%s (Copia de %s)', COALESCE(source_role_desc, ''), p_source_role), source_role_level);

    INSERT INTO public.role_permissions (role, permission)
    SELECT p_new_name, rp.permission
    FROM public.role_permissions rp
    WHERE rp.role = p_source_role
    ON CONFLICT (role, permission) DO NOTHING;

    GET DIAGNOSTICS perms_copied = ROW_COUNT;

    PERFORM public.log_audit_event('role_duplicated', format('Duplicated role "%s" into "%s" (%s permissions copied)', p_source_role, p_new_name, perms_copied), auth.uid(), NULL, NULL, jsonb_build_object('source_role', p_source_role, 'new_name', p_new_name, 'permissions_copied', perms_copied));
    PERFORM public.notify_admins('Role duplicated', format('Role "%s" has been duplicated as "%s"', p_source_role, p_new_name), 'info');

    RETURN json_build_object('success', true, 'source_role', p_source_role, 'new_role', p_new_name, 'permissions_copied', perms_copied);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_role_permission(target_role TEXT, permission_name TEXT)
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
    caller_level := (SELECT public.get_current_user_level());

    IF caller_level < 100 THEN RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner'; END IF;

    SELECT hierarchy_level INTO target_role_level FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', target_role; END IF;
    IF target_role IN ('owner', 'guest') THEN RAISE EXCEPTION 'No se pueden modificar los permisos del rol del sistema: %', target_role; END IF;
    IF target_role_level >= caller_level THEN RAISE EXCEPTION 'Permiso denegado: no puedes modificar un rol con igual o mayor nivel'; END IF;

    SELECT min_role_level INTO perm_min_level FROM public.permissions WHERE name = permission_name;

    IF perm_min_level IS NULL THEN RAISE EXCEPTION 'Permiso no encontrado: %', permission_name; END IF;
    IF target_role_level < perm_min_level THEN
        RAISE EXCEPTION 'El rol "%" (nivel %) no cumple el nivel mínimo % requerido por el permiso "%"', target_role, target_role_level, perm_min_level, permission_name;
    END IF;

    INSERT INTO public.role_permissions (role, permission)
    VALUES (target_role, permission_name)
    ON CONFLICT (role, permission) DO NOTHING;

    PERFORM public.log_audit_event('permission_update', format('Granted "%s" to role "%s"', permission_name, target_role), auth.uid(), NULL, NULL, jsonb_build_object('role', target_role, 'permission', permission_name, 'action', 'grant'));
    PERFORM public.notify_admins('Permission granted', format('Permission "%s" granted to role "%s"', permission_name, target_role), 'info');

    RETURN json_build_object('success', true, 'role', target_role, 'permission', permission_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_role_permission(target_role TEXT, permission_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level      int;
    target_role_level int;
BEGIN
    caller_level := (SELECT public.get_current_user_level());

    IF caller_level < 100 THEN RAISE EXCEPTION 'Permiso denegado: requiere privilegios de owner'; END IF;

    SELECT hierarchy_level INTO target_role_level FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN RAISE EXCEPTION 'Rol no encontrado: %', target_role; END IF;
    IF target_role IN ('owner', 'guest') THEN RAISE EXCEPTION 'No se pueden modificar los permisos del rol del sistema: %', target_role; END IF;
    IF target_role_level >= caller_level THEN RAISE EXCEPTION 'Permiso denegado: no puedes modificar un rol con igual o mayor nivel'; END IF;

    DELETE FROM public.role_permissions WHERE role = target_role AND permission = permission_name;

    PERFORM public.log_audit_event('permission_update', format('Revoked "%s" from role "%s"', permission_name, target_role), auth.uid(), NULL, NULL, jsonb_build_object('role', target_role, 'permission', permission_name, 'action', 'revoke'));
    PERFORM public.notify_admins('Permission revoked', format('Permission "%s" revoked from role "%s"', permission_name, target_role), 'warning');

    RETURN json_build_object('success', true, 'role', target_role, 'permission_removed', permission_name);
END;
$$;

-- RPC paginadas con clamps y búsqueda trigram-compatible.
CREATE OR REPLACE FUNCTION public.get_orders(
    p_limit      INT      DEFAULT 25,
    p_offset     INT      DEFAULT 0,
    p_search     TEXT     DEFAULT '',
    p_status     TEXT[]   DEFAULT NULL,
    p_channel    TEXT[]   DEFAULT NULL,
    p_date       DATE     DEFAULT NULL,
    p_start_hour TEXT[]   DEFAULT NULL,
    p_sort_col   TEXT     DEFAULT NULL,
    p_sort_dir   TEXT     DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total      INT;
    v_data       JSON;
    v_sql        TEXT;
    v_sort_c     TEXT := 'created_at';
    v_sort_d     TEXT := 'DESC';
    v_hours      INT[];
    v_limit      INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 1000);
    v_offset     INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF NOT (SELECT public.has_permission_live('orders.view')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    v_sort_c := CASE p_sort_col
        WHEN 'id' THEN 'id' WHEN 'date' THEN 'date' WHEN 'customer' THEN 'customer'
        WHEN 'product' THEN 'product' WHEN 'category' THEN 'category' WHEN 'time' THEN 'start_time'
        WHEN 'start_time' THEN 'start_time' WHEN 'end_time' THEN 'end_time' WHEN 'code' THEN 'code'
        WHEN 'status' THEN 'status' WHEN 'channel' THEN 'channel' WHEN 'quantity' THEN 'quantity'
        WHEN 'amount' THEN 'amount' WHEN 'region' THEN 'region' WHEN 'payment' THEN 'payment'
        WHEN 'priority' THEN 'priority' WHEN 'created_at' THEN 'created_at' ELSE 'created_at'
    END;

    IF lower(p_sort_dir) = 'asc' THEN v_sort_d := 'ASC';
    ELSIF lower(p_sort_dir) = 'desc' THEN v_sort_d := 'DESC';
    END IF;

    IF p_start_hour IS NOT NULL THEN
        SELECT array_agg(x::INT) INTO v_hours FROM unnest(p_start_hour) x WHERE x ~ '^\d+$';
    END IF;

    v_sql := format($query$
        WITH filtered AS (
            SELECT o.*
            FROM public.orders o
            WHERE o.deleted_at IS NULL
                AND ($1 = '' OR $1 IS NULL OR ((coalesce(o.customer,'') || ' ' || coalesce(o.code,'') || ' ' || coalesce(o.product,'')) ILIKE '%%' || $1 || '%%'))
                AND ($2 IS NULL OR array_length($2, 1) IS NULL OR o.status  = ANY($2))
                AND ($3 IS NULL OR array_length($3, 1) IS NULL OR o.channel = ANY($3))
                AND ($4 IS NULL OR o.date = $4)
                AND ($5 IS NULL OR array_length($5, 1) IS NULL OR EXTRACT(HOUR FROM o.start_time)::INT = ANY($5))
        )
        SELECT
            (SELECT COUNT(*) FROM filtered),
            (
                SELECT COALESCE(json_agg((to_jsonb(r) - '__row_order') ORDER BY r.__row_order), '[]'::json)
                FROM (
                    SELECT ROW_NUMBER() OVER (ORDER BY %I %s NULLS LAST, created_at DESC, id DESC) AS __row_order,
                           id, date::TEXT, customer, product, category,
                           to_char(start_time, 'HH24:MI') AS start_time,
                           to_char(end_time, 'HH24:MI') AS end_time,
                           code, status, channel, quantity, amount, region, payment, priority, created_at
                    FROM filtered
                    ORDER BY %I %s NULLS LAST, created_at DESC, id DESC
                    LIMIT $6 OFFSET $7
                ) r
            )
    $query$, v_sort_c, v_sort_d, v_sort_c, v_sort_d);

    EXECUTE v_sql USING p_search, p_status, p_channel, p_date, v_hours, v_limit, v_offset INTO v_total, v_data;

    RETURN json_build_object('data', v_data, 'total', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_order_history(p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
    v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF NOT (SELECT public.has_permission_live('orders.view')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    RETURN COALESCE((
        SELECT json_agg(row_to_json(r) ORDER BY r.created_at DESC)
        FROM (
            SELECT h.id, h.action, h.description, h.actor_email, h.order_id,
                   COALESCE(h.details->0->>'recordCode', h.details->>'recordCode', o.code) AS record_code,
                   h.details, h.created_at
            FROM public.order_history h
            LEFT JOIN public.orders o ON o.id = h.order_id
            ORDER BY h.created_at DESC
            LIMIT v_limit OFFSET v_offset
        ) r
    ), '[]'::JSON);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_audit_log(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (
    id BIGINT,
    action TEXT,
    description TEXT,
    actor_email TEXT,
    target_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF NOT (SELECT public.has_permission_live('system.view'))
       AND NOT (SELECT public.has_permission_live('users.view')) THEN
        RAISE EXCEPTION 'Permission denied: requires system.view or users.view';
    END IF;

    RETURN QUERY
    SELECT a.id, a.action, a.description, COALESCE(actor.email, 'system') AS actor_email,
           a.target_id, a.metadata, a.created_at
    FROM public.audit_log a
    LEFT JOIN public.profiles actor ON actor.id = a.actor_id
    ORDER BY a.created_at DESC
    LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE (
    id BIGINT,
    title TEXT,
    body TEXT,
    type TEXT,
    read BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
    v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    RETURN QUERY
    SELECT n.id, n.title, n.body, n.type, n.read, n.created_at
    FROM public.notifications n
    WHERE n.user_id = auth.uid()
    ORDER BY n.created_at DESC
    LIMIT v_limit OFFSET v_offset;
END;
$$;

-- Helpers de export/copy server-side.
CREATE OR REPLACE FUNCTION public.order_export_value(
    p_field TEXT,
    p_id UUID,
    p_date DATE,
    p_customer TEXT,
    p_product TEXT,
    p_category TEXT,
    p_start_time TIME,
    p_end_time TIME,
    p_code TEXT,
    p_status TEXT,
    p_channel TEXT,
    p_quantity INT,
    p_amount NUMERIC,
    p_region TEXT,
    p_payment TEXT,
    p_priority TEXT,
    p_created_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT CASE p_field
        WHEN 'id' THEN p_id::text
        WHEN 'date' THEN p_date::text
        WHEN 'customer' THEN p_customer
        WHEN 'product' THEN p_product
        WHEN 'category' THEN p_category
        WHEN 'time' THEN to_char(p_start_time, 'HH24:MI') || ' - ' || to_char(p_end_time, 'HH24:MI')
        WHEN 'start_time' THEN to_char(p_start_time, 'HH24:MI')
        WHEN 'end_time' THEN to_char(p_end_time, 'HH24:MI')
        WHEN 'code' THEN p_code
        WHEN 'status' THEN p_status
        WHEN 'channel' THEN p_channel
        WHEN 'quantity' THEN p_quantity::text
        WHEN 'amount' THEN p_amount::text
        WHEN 'region' THEN p_region
        WHEN 'payment' THEN p_payment
        WHEN 'priority' THEN p_priority
        WHEN 'created_at' THEN p_created_at::text
        ELSE NULL
    END;
$$;

CREATE OR REPLACE FUNCTION public.text_csv_escape(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_value IS NULL THEN ''
        WHEN p_value ~ '[,"\r\n]' THEN '"' || replace(p_value, '"', '""') || '"'
        ELSE p_value
    END;
$$;

CREATE OR REPLACE FUNCTION public.export_orders_by_filter(
    p_search       TEXT    DEFAULT '',
    p_status       TEXT[]  DEFAULT NULL,
    p_channel      TEXT[]  DEFAULT NULL,
    p_date         DATE    DEFAULT NULL,
    p_start_hour   TEXT[]  DEFAULT NULL,
    p_excluded_ids UUID[]  DEFAULT ARRAY[]::UUID[],
    p_sort_col     TEXT    DEFAULT NULL,
    p_sort_dir     TEXT    DEFAULT NULL,
    p_format       TEXT    DEFAULT 'csv',
    p_fields       TEXT[]  DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sql        TEXT;
    v_sort_c     TEXT := 'created_at';
    v_sort_d     TEXT := 'DESC';
    v_hours      INT[];
    v_fields     TEXT[];
    v_content    TEXT;
    v_count      INT;
    v_delim      TEXT;
    v_format     TEXT := lower(COALESCE(p_format, 'csv'));
BEGIN
    IF NOT (SELECT public.has_permission_live('orders.export')) AND NOT (SELECT public.has_permission_live('orders.copy')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.export or orders.copy';
    END IF;

    v_fields := COALESCE(p_fields, ARRAY['date','customer','product','category','time','code','status','channel','quantity','amount','region','payment','priority']);
    SELECT array_agg(field)
    INTO v_fields
    FROM unnest(v_fields) field
    WHERE field = ANY(ARRAY['id','date','customer','product','category','time','start_time','end_time','code','status','channel','quantity','amount','region','payment','priority','created_at']);

    IF array_length(v_fields, 1) IS NULL THEN
        RAISE EXCEPTION 'No exportable fields selected';
    END IF;

    v_sort_c := CASE p_sort_col
        WHEN 'id' THEN 'id' WHEN 'date' THEN 'date' WHEN 'customer' THEN 'customer'
        WHEN 'product' THEN 'product' WHEN 'category' THEN 'category' WHEN 'time' THEN 'start_time'
        WHEN 'start_time' THEN 'start_time' WHEN 'end_time' THEN 'end_time' WHEN 'code' THEN 'code'
        WHEN 'status' THEN 'status' WHEN 'channel' THEN 'channel' WHEN 'quantity' THEN 'quantity'
        WHEN 'amount' THEN 'amount' WHEN 'region' THEN 'region' WHEN 'payment' THEN 'payment'
        WHEN 'priority' THEN 'priority' WHEN 'created_at' THEN 'created_at' ELSE 'created_at'
    END;

    IF lower(p_sort_dir) = 'asc' THEN v_sort_d := 'ASC';
    ELSIF lower(p_sort_dir) = 'desc' THEN v_sort_d := 'DESC';
    END IF;

    IF p_start_hour IS NOT NULL THEN
        SELECT array_agg(x::INT) INTO v_hours FROM unnest(p_start_hour) x WHERE x ~ '^\d+$';
    END IF;

    v_delim := CASE WHEN v_format = 'tsv' THEN E'\t' ELSE ',' END;

    v_sql := format($query$
        WITH filtered AS (
            SELECT o.*
            FROM public.orders o
            WHERE o.deleted_at IS NULL
                AND ($1 = '' OR $1 IS NULL OR ((coalesce(o.customer,'') || ' ' || coalesce(o.code,'') || ' ' || coalesce(o.product,'')) ILIKE '%%' || $1 || '%%'))
                AND ($2 IS NULL OR array_length($2, 1) IS NULL OR o.status = ANY($2))
                AND ($3 IS NULL OR array_length($3, 1) IS NULL OR o.channel = ANY($3))
                AND ($4 IS NULL OR o.date = $4)
                AND ($5 IS NULL OR array_length($5, 1) IS NULL OR EXTRACT(HOUR FROM o.start_time)::INT = ANY($5))
                AND (array_length($6, 1) IS NULL OR o.id != ALL($6))
        ),
        ordered AS (
            SELECT row_number() OVER () AS rn, ordered_rows.*
            FROM (
                SELECT *
                FROM filtered
                ORDER BY %I %s NULLS LAST, created_at DESC, id DESC
            ) ordered_rows
        ),
        row_lines AS (
            SELECT o.rn,
                   o.id,
                   string_agg(
                       CASE
                           WHEN $9 = 'csv' THEN public.text_csv_escape(public.order_export_value(f.field, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time, o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment, o.priority, o.created_at))
                           ELSE COALESCE(replace(public.order_export_value(f.field, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time, o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment, o.priority, o.created_at), E'\t', ' '), '')
                       END,
                       $8 ORDER BY f.ordinality
                   ) AS line
            FROM ordered o
            CROSS JOIN unnest($7::text[]) WITH ORDINALITY AS f(field, ordinality)
            GROUP BY o.rn, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time,
                     o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment,
                     o.priority, o.created_at
        )
        SELECT
            (SELECT COUNT(*) FROM ordered),
            CASE
                WHEN $9 = 'json' THEN (
                    SELECT COALESCE(jsonb_agg(obj ORDER BY rn)::text, '[]')
                    FROM (
                        SELECT o.rn,
                               jsonb_object_agg(f.field, public.order_export_value(f.field, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time, o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment, o.priority, o.created_at) ORDER BY f.ordinality) AS obj
                        FROM ordered o
                        CROSS JOIN unnest($7::text[]) WITH ORDINALITY AS f(field, ordinality)
                        GROUP BY o.rn, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time,
                                 o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment,
                                 o.priority, o.created_at
                    ) j
                )
                WHEN $9 = 'md' THEN (
                    '| ' || array_to_string($7, ' | ') || ' |' || E'\n' ||
                    '| ' || array_to_string(ARRAY(SELECT '---' FROM unnest($7)), ' | ') || ' |' || E'\n' ||
                    COALESCE((SELECT string_agg('| ' || replace(line, $8, ' | ') || ' |', E'\n' ORDER BY rn) FROM row_lines), '')
                )
                ELSE (
                    CASE WHEN $9 IN ('csv','tsv') THEN array_to_string($7, $8) || E'\n' ELSE '' END ||
                    COALESCE((SELECT string_agg(line, E'\n' ORDER BY rn) FROM row_lines), '')
                )
            END
    $query$, v_sort_c, v_sort_d);

    EXECUTE v_sql
    USING p_search, p_status, p_channel, p_date, v_hours, p_excluded_ids, v_fields, v_delim, v_format
    INTO v_count, v_content;

    RETURN json_build_object('content', COALESCE(v_content, ''), 'row_count', COALESCE(v_count, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_delete_orders_by_filter(
    p_search       TEXT    DEFAULT '',
    p_status       TEXT[]  DEFAULT NULL,
    p_channel      TEXT[]  DEFAULT NULL,
    p_date         DATE    DEFAULT NULL,
    p_start_hour   TEXT[]  DEFAULT NULL,
    p_excluded_ids UUID[]  DEFAULT ARRAY[]::UUID[]
)
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
    v_hours INT[];
    v_records JSONB;
BEGIN
    IF NOT (SELECT public.has_permission_live('orders.bulk_delete')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.bulk_delete';
    END IF;

    IF p_start_hour IS NOT NULL THEN
        SELECT array_agg(x::INT) INTO v_hours FROM unnest(p_start_hour) x WHERE x ~ '^\d+$';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('recordId', r.id, 'recordCode', r.code)), '[]'::jsonb)
    INTO v_records
    FROM (
        SELECT o.id, o.code
        FROM public.orders o
        WHERE o.deleted_at IS NULL
            AND (p_search = '' OR p_search IS NULL OR ((coalesce(o.customer,'') || ' ' || coalesce(o.code,'') || ' ' || coalesce(o.product,'')) ILIKE '%' || p_search || '%'))
            AND (p_status IS NULL OR array_length(p_status, 1) IS NULL OR o.status = ANY(p_status))
            AND (p_channel IS NULL OR array_length(p_channel, 1) IS NULL OR o.channel = ANY(p_channel))
            AND (p_date IS NULL OR o.date = p_date)
            AND (v_hours IS NULL OR array_length(v_hours, 1) IS NULL OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(v_hours))
            AND (array_length(p_excluded_ids, 1) IS NULL OR o.id != ALL(p_excluded_ids))
        ORDER BY o.created_at DESC
        LIMIT 100
    ) r;

    PERFORM set_config('app.bulk_op', 'true', true);

    UPDATE public.orders o
    SET deleted_at = NOW()
    WHERE o.deleted_at IS NULL
        AND (p_search = '' OR p_search IS NULL OR ((coalesce(o.customer,'') || ' ' || coalesce(o.code,'') || ' ' || coalesce(o.product,'')) ILIKE '%' || p_search || '%'))
        AND (p_status IS NULL OR array_length(p_status, 1) IS NULL OR o.status = ANY(p_status))
        AND (p_channel IS NULL OR array_length(p_channel, 1) IS NULL OR o.channel = ANY(p_channel))
        AND (p_date IS NULL OR o.date = p_date)
        AND (v_hours IS NULL OR array_length(v_hours, 1) IS NULL OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(v_hours))
        AND (array_length(p_excluded_ids, 1) IS NULL OR o.id != ALL(p_excluded_ids));

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO public.order_history (action, description, actor_email, details)
        VALUES (
            'delete',
            'Bulk deleted ' || v_count::TEXT || ' orders via filter',
            COALESCE(auth.jwt() ->> 'email', 'system'),
            jsonb_build_object(
                'rowCount', v_count,
                'sampleRecords', v_records,
                'omittedCount', GREATEST(v_count - 100, 0),
                'search', p_search,
                'status', p_status,
                'excludedIds', p_excluded_ids
            )
        );
    END IF;

    PERFORM set_config('app.bulk_op', 'false', true);
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_delete_orders_by_ids(p_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
    v_records JSONB;
BEGIN
    IF NOT (SELECT public.has_permission_live('orders.bulk_delete')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.bulk_delete';
    END IF;

    IF COALESCE(array_length(p_ids, 1), 0) > 10000 THEN
        RAISE EXCEPTION 'Too many orders selected at once';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('recordId', r.id, 'recordCode', r.code)), '[]'::jsonb)
    INTO v_records
    FROM (
        SELECT id, code
        FROM public.orders
        WHERE id = ANY(p_ids) AND deleted_at IS NULL
        ORDER BY array_position(p_ids, id)
        LIMIT 100
    ) r;

    PERFORM set_config('app.bulk_op', 'true', true);
    UPDATE public.orders SET deleted_at = NOW() WHERE id = ANY(p_ids) AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO public.order_history (action, description, actor_email, details)
        VALUES (
            'delete',
            'Bulk deleted ' || v_count::TEXT || ' orders manually',
            COALESCE(auth.jwt() ->> 'email', 'system'),
            jsonb_build_object('rowCount', v_count, 'sampleRecords', v_records, 'omittedCount', GREATEST(v_count - 100, 0), 'deletedIds', p_ids)
        );
    END IF;

    PERFORM set_config('app.bulk_op', 'false', true);
    RETURN v_count;
END;
$$;

-- SQL libre para AI queda bloqueado. El Edge Function debe usar get_schema/query_table allowlist.
REVOKE ALL ON FUNCTION public.execute_ai_query(TEXT) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.execute_ai_query(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'execute_ai_query is disabled. Use allowlisted AI tools/RPCs.';
END;
$$;
REVOKE ALL ON FUNCTION public.execute_ai_query(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.export_orders_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],UUID[],TEXT,TEXT,TEXT,TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_orders_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_orders_by_ids(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders(INT,INT,TEXT,TEXT[],TEXT[],DATE,TEXT[],TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_history(INT,INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_log(INT,INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(INT,INT) TO authenticated;
