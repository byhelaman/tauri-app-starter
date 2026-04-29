-- ============================================================
-- 020: Fix audit trigger — order_id NULL en eventos DELETE
-- ============================================================
-- El trigger AFTER DELETE intentaba insertar en order_history con
-- order_id = OLD.id, pero en ese punto la fila ya no existe en
-- orders, lo que viola la FK. Para eventos DELETE usamos NULL
-- (el code ya queda en la columna description, no se pierde info).

CREATE OR REPLACE FUNCTION public.orders_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_email TEXT;
    v_action      TEXT;
    v_description TEXT;
    v_details     JSONB := '[]'::JSONB;
    v_order_id    UUID;

    -- Campos que NO se incluyen en el diff de detalles
    excluded_fields TEXT[] := ARRAY[
        'id', 'created_at', 'updated_at', 'updated_by'
    ];
    field_name TEXT;
    old_val    TEXT;
    new_val    TEXT;
BEGIN
    -- Resolver email del actor desde profiles
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

        -- Detectar campos modificados y construir array de detalles
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

        -- Construir descripción legible
        IF jsonb_array_length(v_details) = 1 THEN
            v_description := format(
                'Updated %s on %s: %s → %s',
                v_details->0->>'field',
                NEW.code,
                v_details->0->>'oldValue',
                v_details->0->>'newValue'
            );
        ELSIF jsonb_array_length(v_details) > 1 THEN
            v_description := format(
                'Updated %s field(s) on %s',
                jsonb_array_length(v_details),
                NEW.code
            );
        ELSE
            -- Sin cambios reales (e.g. solo updated_at tocado) — no registrar
            RETURN NEW;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        v_action      := 'delete';
        v_description := 'Deleted order ' || OLD.code;
        -- ↓ NULL: el orden ya no existe al ejecutarse AFTER DELETE;
        --   la FK ON DELETE SET NULL lo pondría a NULL de todas formas
        --   en los registros existentes. El code queda en description.
        v_order_id    := NULL;
    END IF;

    INSERT INTO public.order_history (
        action, description, actor_email, order_id, details
    ) VALUES (
        v_action, v_description, v_actor_email, v_order_id,
        NULLIF(v_details, '[]'::JSONB)
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
