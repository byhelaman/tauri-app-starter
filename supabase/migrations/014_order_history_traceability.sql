-- ============================================================
-- 014_order_history_traceability.sql
-- Enriquecimiento de auditoria con recordId/recordCode.
-- ============================================================

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
    v_record_id UUID;
    v_record_code TEXT;
BEGIN
    IF current_setting('app.bulk_op', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_email := COALESCE(auth.jwt() ->> 'email', 'system');
    v_record_id := COALESCE(NEW.id, OLD.id);
    v_record_code := COALESCE(NEW.code, OLD.code);

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
            v_details := jsonb_build_array(jsonb_build_object(
                'recordId', v_record_id,
                'recordCode', v_record_code,
                'field', 'deleted_at',
                'oldValue', OLD.deleted_at,
                'newValue', NEW.deleted_at
            ));
        END IF;

        IF NOT v_is_soft_delete THEN
            FOR v_col IN SELECT * FROM jsonb_object_keys(to_jsonb(NEW))
            LOOP
                IF v_col IN ('updated_at', 'updated_by') THEN
                    CONTINUE;
                END IF;

                IF to_jsonb(OLD)->>v_col IS DISTINCT FROM to_jsonb(NEW)->>v_col THEN
                    v_details := v_details || jsonb_build_array(jsonb_build_object(
                        'recordId', v_record_id,
                        'recordCode', v_record_code,
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
        v_details := jsonb_build_array(jsonb_build_object(
            'recordId', v_record_id,
            'recordCode', v_record_code,
            'field', 'record',
            'oldValue', 'active',
            'newValue', 'deleted'
        ));
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
    v_order_id UUID;
    v_code TEXT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM new_rows;
    IF v_count = 1 THEN
        SELECT id, code INTO v_order_id, v_code FROM new_rows LIMIT 1;

        INSERT INTO public.order_history (action, description, actor_email, order_id, details)
        VALUES (
            'create',
            'Created order ' || v_code,
            COALESCE(auth.jwt() ->> 'email', 'system'),
            v_order_id,
            jsonb_build_array(jsonb_build_object(
                'recordId', v_order_id,
                'recordCode', v_code,
                'field', 'record',
                'oldValue', NULL,
                'newValue', 'created'
            ))
        );
    ELSIF v_count > 1 THEN
        INSERT INTO public.order_history (action, description, actor_email, details)
        VALUES (
            'create',
            'Bulk created ' || v_count::TEXT || ' orders',
            COALESCE(auth.jwt() ->> 'email', 'system'),
            jsonb_build_object(
                'rowCount', v_count,
                'sampleRecords', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'recordId', r.id,
                        'recordCode', r.code
                    )), '[]'::jsonb)
                    FROM (
                        SELECT id, code
                        FROM new_rows
                        ORDER BY created_at DESC
                        LIMIT 100
                    ) r
                ),
                'omittedCount', GREATEST(v_count - 100, 0)
            )
        );
    END IF;

    IF v_count > 0 THEN
        INSERT INTO public.order_change_events (table_name, action, actor_id, row_count)
        VALUES ('orders', 'insert', auth.uid(), v_count);
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_order_history(
    p_limit  INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission_live('orders.view') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    RETURN COALESCE((
        SELECT json_agg(row_to_json(r) ORDER BY r.created_at DESC)
        FROM (
            SELECT
                h.id,
                h.action,
                h.description,
                h.actor_email,
                h.order_id,
                COALESCE(h.details->0->>'recordCode', h.details->>'recordCode', o.code) AS record_code,
                h.details,
                h.created_at
            FROM public.order_history h
            LEFT JOIN public.orders o ON o.id = h.order_id
            ORDER BY h.created_at DESC
            LIMIT p_limit OFFSET p_offset
        ) r
    ), '[]'::JSON);
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
    IF NOT public.has_permission_live('orders.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.manage';
    END IF;

    IF p_start_hour IS NOT NULL THEN
        SELECT array_agg(x::INT)
        INTO v_hours
        FROM unnest(p_start_hour) x
        WHERE x ~ '^\d+$';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.orders o
    WHERE
        o.deleted_at IS NULL
        AND (p_search = '' OR p_search IS NULL OR (
            o.customer ILIKE '%' || p_search || '%' OR
            o.code     ILIKE '%' || p_search || '%' OR
            o.product  ILIKE '%' || p_search || '%'
        ))
        AND (p_status IS NULL      OR array_length(p_status, 1) IS NULL      OR o.status = ANY(p_status))
        AND (p_channel IS NULL     OR array_length(p_channel, 1) IS NULL     OR o.channel = ANY(p_channel))
        AND (p_date IS NULL        OR o.date = p_date)
        AND (v_hours IS NULL       OR array_length(v_hours, 1) IS NULL
            OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(v_hours))
        AND (array_length(p_excluded_ids, 1) IS NULL OR o.id != ALL(p_excluded_ids));

    IF v_count > 10000 THEN
        RAISE EXCEPTION 'Too many orders selected at once';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('recordId', r.id, 'recordCode', r.code)), '[]'::jsonb)
    INTO v_records
    FROM (
        SELECT o.id, o.code
        FROM public.orders o
        WHERE
            o.deleted_at IS NULL
            AND (p_search = '' OR p_search IS NULL OR (
                o.customer ILIKE '%' || p_search || '%' OR
                o.code     ILIKE '%' || p_search || '%' OR
                o.product  ILIKE '%' || p_search || '%'
            ))
            AND (p_status IS NULL      OR array_length(p_status, 1) IS NULL      OR o.status = ANY(p_status))
            AND (p_channel IS NULL     OR array_length(p_channel, 1) IS NULL     OR o.channel = ANY(p_channel))
            AND (p_date IS NULL        OR o.date = p_date)
            AND (v_hours IS NULL       OR array_length(v_hours, 1) IS NULL
                OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(v_hours))
            AND (array_length(p_excluded_ids, 1) IS NULL OR o.id != ALL(p_excluded_ids))
        ORDER BY o.created_at DESC
        LIMIT 100
    ) r;

    PERFORM set_config('app.bulk_op', 'true', true);

    UPDATE public.orders o
    SET deleted_at = NOW()
    WHERE
        o.deleted_at IS NULL
        AND (p_search = '' OR p_search IS NULL OR (
            o.customer ILIKE '%' || p_search || '%' OR
            o.code     ILIKE '%' || p_search || '%' OR
            o.product  ILIKE '%' || p_search || '%'
        ))
        AND (p_status IS NULL     OR array_length(p_status, 1) IS NULL     OR o.status  = ANY(p_status))
        AND (p_channel IS NULL    OR array_length(p_channel, 1) IS NULL    OR o.channel = ANY(p_channel))
        AND (p_date IS NULL       OR o.date = p_date)
        AND (v_hours IS NULL      OR array_length(v_hours, 1) IS NULL
            OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(v_hours))
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
    IF NOT public.has_permission_live('orders.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.manage';
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
            jsonb_build_object(
                'rowCount', v_count,
                'sampleRecords', v_records,
                'omittedCount', GREATEST(v_count - 100, 0),
                'deletedIds', p_ids
            )
        );
    END IF;

    PERFORM set_config('app.bulk_op', 'false', true);

    RETURN v_count;
END;
$$;
