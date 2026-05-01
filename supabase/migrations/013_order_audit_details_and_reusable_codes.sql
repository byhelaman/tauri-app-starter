-- ============================================================
-- 013_order_audit_details_and_reusable_codes.sql
-- Corrige details de auditoria y permite reutilizar code tras soft delete.
-- ============================================================

ALTER TABLE public.queue_orders
    DROP CONSTRAINT IF EXISTS queue_orders_code_fkey;

ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS orders_code_active_key
    ON public.orders(code)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_queue_code ON public.queue_orders(code);

DELETE FROM public.queue_orders q
WHERE NOT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.code = q.code
      AND o.deleted_at IS NULL
);

DROP TRIGGER IF EXISTS on_order_soft_delete_cleanup_queue ON public.orders;

CREATE OR REPLACE FUNCTION public.sync_queue_orders_for_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        DELETE FROM public.queue_orders WHERE code = NEW.code;
    ELSIF OLD.code IS DISTINCT FROM NEW.code AND NEW.deleted_at IS NULL THEN
        UPDATE public.queue_orders SET code = NEW.code WHERE code = OLD.code;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_sync_queue ON public.orders;
CREATE TRIGGER on_order_sync_queue
    AFTER UPDATE OF code, deleted_at ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.sync_queue_orders_for_order_change();

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
