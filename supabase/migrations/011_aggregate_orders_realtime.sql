-- ============================================================
-- 011_aggregate_orders_realtime.sql
-- Reemplaza realtime fila-a-fila de orders/order_history por eventos agregados.
-- Una sentencia INSERT de 500k orders emite 1 evento realtime, no 500k/1M.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_change_events (
    id          BIGSERIAL   PRIMARY KEY,
    table_name  TEXT        NOT NULL CHECK (table_name IN ('orders','queue_orders','order_history')),
    action      TEXT        NOT NULL CHECK (action IN ('insert','update','delete','bulk')),
    actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    row_count   INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_change_events_created_at
    ON public.order_change_events(created_at DESC);

ALTER TABLE public.order_change_events
    ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.order_change_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_change_events_select" ON public.order_change_events;
CREATE POLICY "order_change_events_select" ON public.order_change_events
    FOR SELECT TO authenticated
    USING (public.has_permission_live('orders.view'));

DROP POLICY IF EXISTS "order_change_events_insert_deny" ON public.order_change_events;
CREATE POLICY "order_change_events_insert_deny" ON public.order_change_events
    FOR INSERT TO authenticated
    WITH CHECK (false);

GRANT SELECT ON public.order_change_events TO authenticated;

CREATE OR REPLACE FUNCTION public.orders_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_action TEXT;
    v_desc TEXT;
    v_email TEXT;
    v_details JSONB := '[]'::jsonb;
    v_col TEXT;
    v_is_soft_delete BOOLEAN := false;
    v_order_id UUID;
BEGIN
    IF current_setting('app.bulk_op', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_email := COALESCE(auth.jwt() ->> 'email', 'system');

    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action   := 'update';
        v_desc     := 'Order updated';
        v_order_id := NEW.id;

        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            v_action := 'delete';
            v_desc   := 'Order sent to trash';
            v_is_soft_delete := true;
        END IF;

        IF NOT v_is_soft_delete THEN
            FOR v_col IN SELECT * FROM jsonb_object_keys(to_jsonb(NEW))
            LOOP
                IF v_col IN ('updated_at', 'updated_by') THEN
                    CONTINUE;
                END IF;

                IF to_jsonb(OLD)->>v_col IS DISTINCT FROM to_jsonb(NEW)->>v_col THEN
                    v_details := v_details || jsonb_build_array(jsonb_build_object(
                        'field', v_col,
                        'oldValue', to_jsonb(OLD)->v_col,
                        'newValue', to_jsonb(NEW)->v_col
                    ));
                END IF;
            END LOOP;
        END IF;

        IF v_details = '[]'::jsonb AND NOT v_is_soft_delete THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_action   := 'delete';
        v_desc     := 'Deleted order ' || OLD.code;
        v_order_id := NULL;
    END IF;

    INSERT INTO public.order_history (
        action, description, actor_email, order_id, details
    ) VALUES (
        v_action, v_desc, v_email, v_order_id,
        NULLIF(v_details, '[]'::jsonb)
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_orders_insert_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM new_rows;
    IF v_count > 0 THEN
        INSERT INTO public.order_history (action, description, actor_email, details)
        VALUES (
            'create',
            CASE
                WHEN v_count = 1 THEN 'Created 1 order'
                ELSE 'Bulk created ' || v_count::TEXT || ' orders'
            END,
            COALESCE(auth.jwt() ->> 'email', 'system'),
            jsonb_build_object('row_count', v_count)
        );

        INSERT INTO public.order_change_events (table_name, action, actor_id, row_count)
        VALUES ('orders', 'insert', auth.uid(), v_count);
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_orders_update_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM new_rows;
    IF v_count > 0 THEN
        INSERT INTO public.order_change_events (table_name, action, actor_id, row_count)
        VALUES ('orders', 'update', auth.uid(), v_count);
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_orders_delete_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM old_rows;
    IF v_count > 0 THEN
        INSERT INTO public.order_change_events (table_name, action, actor_id, row_count)
        VALUES ('orders', 'delete', auth.uid(), v_count);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS orders_insert_realtime_event ON public.orders;
CREATE TRIGGER orders_insert_realtime_event
    AFTER INSERT ON public.orders
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION public.record_orders_insert_event();

DROP TRIGGER IF EXISTS orders_update_realtime_event ON public.orders;
CREATE TRIGGER orders_update_realtime_event
    AFTER UPDATE ON public.orders
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION public.record_orders_update_event();

DROP TRIGGER IF EXISTS orders_delete_realtime_event ON public.orders;
CREATE TRIGGER orders_delete_realtime_event
    AFTER DELETE ON public.orders
    REFERENCING OLD TABLE AS old_rows
    FOR EACH STATEMENT EXECUTE FUNCTION public.record_orders_delete_event();

REVOKE ALL ON FUNCTION public.record_orders_insert_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_orders_update_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_orders_delete_event() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'order_history'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.order_history;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'order_change_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.order_change_events;
    END IF;
END $$;
