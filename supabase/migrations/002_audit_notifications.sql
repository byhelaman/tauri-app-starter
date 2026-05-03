-- ============================================================
-- 002: Audit Log + Notificaciones
-- ============================================================
-- Ejecutar después de `001_foundation.sql`.
--
-- Qué configura:
--   1. Tabla audit_log + RLS
--   2. Tabla notifications + RLS
--   3. Helpers internos de auditoría/notificaciones
--   4. RPCs de consulta y gestión de notificaciones
--   5. Grants específicos

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
    (SELECT public.has_current_permission('system.view'))
    OR (SELECT public.has_current_permission('users.view'))
    OR (SELECT public.get_current_user_level()) >= 80
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
-- 4. RPCs DE AUDITORÍA Y NOTIFICACIONES
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
DECLARE
    v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF NOT (SELECT public.has_current_permission('system.view'))
       AND NOT (SELECT public.has_current_permission('users.view')) THEN
        RAISE EXCEPTION 'Permiso denegado: requiere system.view o users.view';
    END IF;

    RETURN QUERY
    SELECT a.id, a.action, a.description, a.actor_email, a.target_id, a.metadata, a.created_at
    FROM public.audit_log a
    ORDER BY a.created_at DESC
    LIMIT v_limit
    OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_notifications(
    p_limit  INT DEFAULT 20,
    p_offset INT DEFAULT 0
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
DECLARE
    v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
    v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    RETURN QUERY
    SELECT n.id, n.title, n.body, n.type, n.read, n.created_at
    FROM public.notifications n
    WHERE n.user_id = auth.uid()
    ORDER BY n.created_at DESC
    LIMIT v_limit
    OFFSET v_offset;
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
-- 5. GRANTS
-- ============================================================

-- Audit log
REVOKE ALL ON FUNCTION public.get_audit_log(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_log(int, int) TO authenticated;

-- Notifications
REVOKE ALL ON FUNCTION public.get_my_notifications(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(int, int) TO authenticated;
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
