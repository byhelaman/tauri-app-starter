-- ============================================================
-- 003: Audit Log + Notificaciones
-- ============================================================
-- Ejecutar después de `002_admin_rbac.sql`.
--
-- Qué configura:
--   1. Tabla audit_log — registro automático de acciones administrativas
--   2. Tabla notifications — notificaciones in-app persistentes
--   3. Funciones helper: log_audit_event, notify_user, notify_admins
--   4. RPCs de consulta: get_audit_log, get_my_notifications,
--      mark_notification_read, mark_all_notifications_read,
--      dismiss_notification
--   5. Modifica las RPCs de 002 para insertar auditoría + notificaciones
--   6. RLS + Grants

-- ============================================================
-- 1. TABLA AUDIT_LOG
-- ============================================================
CREATE TABLE public.audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    action      TEXT NOT NULL,
    description TEXT NOT NULL,
    actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    target_id   UUID,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action     ON public.audit_log(action);
CREATE INDEX idx_audit_log_actor_id   ON public.audit_log(actor_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Solo usuarios con system.view pueden leer el audit log
CREATE POLICY "audit_log_select"
ON public.audit_log
FOR SELECT
TO authenticated
USING (
    public.has_permission('system.view')
    OR public.has_permission('users.view')
    OR COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0) >= 80
);

-- Nadie puede insertar/editar/eliminar directamente — solo via funciones SECURITY DEFINER
CREATE POLICY "audit_log_deny_insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "audit_log_deny_update" ON public.audit_log FOR UPDATE TO authenticated USING (false);
CREATE POLICY "audit_log_deny_delete" ON public.audit_log FOR DELETE TO authenticated USING (false);

-- Habilitar Realtime para la tabla audit_log
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;

-- ============================================================
-- 2. TABLA NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning')),
    read       BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_notifications_user_id    ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread     ON public.notifications(user_id) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

-- Cada usuario solo ve sus propias notificaciones
CREATE POLICY "notifications_select_own"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own"
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own"
ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Insert solo via funciones SECURITY DEFINER
CREATE POLICY "notifications_deny_insert"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (false);

-- Habilitar Realtime para la tabla notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================================
-- 3. FUNCIONES HELPER (internas, no expuestas)
-- ============================================================

-- Registra un evento en el audit log
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_action      TEXT,
    p_description TEXT,
    p_actor_id    UUID DEFAULT NULL,
    p_actor_email TEXT DEFAULT NULL,
    p_target_id   UUID DEFAULT NULL,
    p_metadata    JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    _actor_id    UUID;
    _actor_email TEXT;
BEGIN
    _actor_id := COALESCE(p_actor_id, auth.uid());
    _actor_email := p_actor_email;

    -- Si no se pasó email, buscarlo
    IF _actor_email IS NULL AND _actor_id IS NOT NULL THEN
        SELECT email INTO _actor_email
        FROM public.profiles
        WHERE id = _actor_id;
    END IF;

    INSERT INTO public.audit_log (action, description, actor_id, actor_email, target_id, metadata)
    VALUES (p_action, p_description, _actor_id, COALESCE(_actor_email, 'system'), p_target_id, p_metadata);
END;
$$;

-- Crea una notificación para un usuario específico
CREATE OR REPLACE FUNCTION public.notify_user(
    p_user_id UUID,
    p_title   TEXT,
    p_body    TEXT,
    p_type    TEXT DEFAULT 'info'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (p_user_id, p_title, p_body, p_type);
END;
$$;

-- Notifica a todos los usuarios con permiso system.view (excepto el actor actual)
CREATE OR REPLACE FUNCTION public.notify_admins(
    p_title TEXT,
    p_body  TEXT,
    p_type  TEXT DEFAULT 'info'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    _caller_id UUID := auth.uid();
    _admin_id  UUID;
BEGIN
    FOR _admin_id IN
        SELECT DISTINCT p.id
        FROM public.profiles p
        JOIN public.roles r ON p.role = r.name
        LEFT JOIN public.role_permissions rp ON rp.role = p.role
        WHERE (
            -- Owner (level >= 100 tiene todos los permisos)
            r.hierarchy_level >= 100
            -- O tiene system.view explícito
            OR rp.permission = 'system.view'
        )
        AND p.id IS DISTINCT FROM _caller_id
    LOOP
        INSERT INTO public.notifications (user_id, title, body, type)
        VALUES (_admin_id, p_title, p_body, p_type);
    END LOOP;
END;
$$;

-- ============================================================
-- 4. RPCs DE CONSULTA
-- ============================================================

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
    IF NOT public.has_permission('system.view')
       AND NOT public.has_permission('users.view')
       AND COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0) < 80 THEN
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

CREATE OR REPLACE FUNCTION public.get_my_notifications(
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    id         BIGINT,
    title      TEXT,
    body       TEXT,
    type       TEXT,
    read       BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT n.id, n.title, n.body, n.type, n.read, n.created_at
    FROM public.notifications n
    WHERE n.user_id = auth.uid()
    ORDER BY n.created_at DESC
    LIMIT GREATEST(p_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.notifications
    SET read = true
    WHERE id = p_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.notifications
    SET read = true
    WHERE user_id = auth.uid() AND read = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_notification(p_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.notifications
    WHERE id = p_id AND user_id = auth.uid();
END;
$$;

-- ============================================================
-- 5. REEMPLAZAR RPCs DE 002 CON AUDITORÍA + NOTIFICACIONES
-- ============================================================
-- Se usa CREATE OR REPLACE para reescribir las funciones existentes
-- sin romper los grants.

-- 5.1 update_user_role — ahora con audit + notificación al usuario afectado
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
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
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

    -- Audit + Notify
    PERFORM public.log_audit_event(
        'role_change',
        format('Changed %s role from %s to %s', target_email, old_role, new_role),
        caller_id, NULL, target_user_id,
        jsonb_build_object('old_role', old_role, 'new_role', new_role)
    );
    PERFORM public.notify_user(
        target_user_id,
        'Role updated',
        format('Your role has been changed to %s', new_role),
        'info'
    );
    PERFORM public.notify_admins(
        'Role change',
        format('%s role changed from %s to %s', target_email, old_role, new_role),
        'info'
    );

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_role', new_role);
END;
$$;

-- 5.2 delete_user
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
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
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

    -- Audit + Notify BEFORE delete (cascade will remove profile)
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

-- 5.3 update_user_display_name
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
    target_email         text;
BEGIN
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
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

    UPDATE public.profiles
    SET display_name = new_display_name
    WHERE id = target_user_id;

    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('display_name', new_display_name)
    WHERE id = target_user_id;

    -- Audit
    PERFORM public.log_audit_event(
        'display_name_change',
        format('Changed display name for %s to "%s"', COALESCE(target_email, target_user_id::text), new_display_name),
        caller_id, NULL, target_user_id,
        jsonb_build_object('new_display_name', new_display_name)
    );

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_display_name', new_display_name);
END;
$$;

-- 5.4 set_new_user_role (para invite flow)
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

    -- Solo aplica a usuarios guest para evitar bypass de update_user_role.
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

    -- Audit + Notify
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

-- 5.5 delete_own_account
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    _uid         UUID := auth.uid();
    _user_role   TEXT;
    _user_email  TEXT;
    _owner_count INT;
BEGIN
    IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

    SELECT role, email INTO _user_role, _user_email
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

    -- Audit + Notify BEFORE delete
    PERFORM public.log_audit_event(
        'account_deleted',
        format('User %s deleted their own account', COALESCE(_user_email, _uid::text)),
        _uid, _user_email, _uid
    );
    PERFORM public.notify_admins(
        'Account deleted',
        format('%s has deleted their account', COALESCE(_user_email, _uid::text)),
        'warning'
    );

    DELETE FROM auth.users WHERE id = _uid;
END;
$$;

-- 5.6 create_role
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

    -- Audit + Notify
    PERFORM public.log_audit_event(
        'role_created',
        format('Created role "%s" (level %s)', role_name, role_level),
        NULL, NULL, NULL,
        jsonb_build_object('role_name', role_name, 'level', role_level)
    );
    PERFORM public.notify_admins(
        'Role created',
        format('A new role "%s" has been created', role_name),
        'info'
    );

    RETURN json_build_object('success', true, 'role_name', role_name);
END;
$$;

-- 5.7 update_role
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

    UPDATE public.roles
    SET name = effective_name,
        description = effective_desc,
        hierarchy_level = effective_level
    WHERE name = role_name;

    -- Audit + Notify
    PERFORM public.log_audit_event(
        'role_updated',
        format('Updated role "%s"', role_name),
        NULL, NULL, NULL,
        jsonb_build_object(
            'old_name', role_name, 'new_name', effective_name,
            'old_level', target_role_level, 'new_level', effective_level,
            'renamed', effective_name <> role_name
        )
    );
    PERFORM public.notify_admins(
        'Role updated',
        format('Role "%s" has been updated', effective_name),
        'info'
    );

    RETURN json_build_object(
        'success', true,
        'old_role', role_name,
        'role_name', effective_name,
        'hierarchy_level', effective_level,
        'renamed', effective_name <> role_name
    );
END;
$$;

-- 5.8 delete_role
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

    -- Audit + Notify
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

-- 5.9 assign_role_permission
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

    -- Audit + Notify
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

-- 5.10 remove_role_permission
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

    -- Audit + Notify
    PERFORM public.log_audit_event(
        'permission_update',
        format('Revoked "%s" from role "%s"', permission_name, target_role),
        NULL, NULL, NULL,
        jsonb_build_object('role', target_role, 'permission', permission_name, 'action', 'revoke')
    );
    PERFORM public.notify_admins(
        'Permission revoked',
        format('Permission "%s" revoked from role "%s"', permission_name, target_role),
        'warning'
    );

    RETURN json_build_object('success', true, 'role', target_role, 'permission_removed', permission_name);
END;
$$;

-- ============================================================
-- 6. GRANTS
-- ============================================================

-- Audit log
REVOKE ALL ON FUNCTION public.get_audit_log(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_log(int, int) TO authenticated;

-- Notifications
REVOKE ALL ON FUNCTION public.get_my_notifications(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(int) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_notification_read(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
REVOKE ALL ON FUNCTION public.dismiss_notification(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_notification(bigint) TO authenticated;

-- Internal helpers (no direct access from frontend)
REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admins(text, text, text) FROM PUBLIC, anon, authenticated;

-- Tables (RLS handles row-level access, but we also restrict table-level)
GRANT SELECT ON TABLE public.audit_log TO authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.notifications TO authenticated;
