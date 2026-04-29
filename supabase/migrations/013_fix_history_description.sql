-- ============================================================
-- 013: Fix redundancia en descripción del audit trigger
-- ============================================================
-- Cuando hay 1 campo cambiado, el título mostraba:
--   "Updated quantity on ORD-XXX: 19 → 17"
-- Y los detalles repetían: "Quantity: 19 → 17"
--
-- Fix: la descripción solo nombra qué campo cambió.
-- Los valores old/new quedan exclusivamente en details.

CREATE OR REPLACE FUNCTION public.orders_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_email   TEXT;
    v_action        TEXT;
    v_description   TEXT;
    v_details       JSONB := '[]'::JSONB;
    v_order_id      UUID;
    excluded_fields TEXT[] := ARRAY['id', 'created_at', 'updated_at', 'updated_by'];
    field_name      TEXT;
    old_val         TEXT;
    new_val         TEXT;
BEGIN
    SELECT email INTO v_actor_email
    FROM public.profiles
    WHERE id = auth.uid();

    v_actor_email := COALESCE(v_actor_email, 'system');

    IF TG_OP = 'INSERT' THEN
        v_action      := 'create';
        v_description := 'Created order ' || NEW.code;
        v_order_id    := NEW.id;

    ELSIF TG_OP = 'UPDATE' THEN
        v_action   := 'update';
        v_order_id := NEW.id;

        FOR field_name IN
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'orders'
              AND column_name != ALL(excluded_fields)
        LOOP
            EXECUTE format('SELECT ($1).%I::TEXT', field_name) INTO old_val USING OLD;
            EXECUTE format('SELECT ($1).%I::TEXT', field_name) INTO new_val USING NEW;

            IF old_val IS DISTINCT FROM new_val THEN
                v_details := v_details || jsonb_build_object(
                    'field',    field_name,
                    'oldValue', old_val,
                    'newValue', new_val
                );
            END IF;
        END LOOP;

        IF jsonb_array_length(v_details) = 0 THEN
            RETURN NEW;
        ELSIF jsonb_array_length(v_details) = 1 THEN
            -- Solo el nombre del campo — los valores están en details
            v_description := format(
                'Updated %s on %s',
                v_details->0->>'field',
                NEW.code
            );
        ELSE
            v_description := format(
                'Updated %s fields on %s',
                jsonb_array_length(v_details),
                NEW.code
            );
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        v_action      := 'delete';
        v_description := 'Deleted order ' || OLD.code;
        v_order_id    := OLD.id;
    END IF;

    INSERT INTO public.order_history (action, description, actor_email, order_id, details)
    VALUES (v_action, v_description, v_actor_email, v_order_id, NULLIF(v_details, '[]'::JSONB));

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
