    -- ============================================================
    -- 022: Multi-select filters — TEXT[] en todos los RPCs de orders
    -- ============================================================
    -- Los filtros de la UI son multi-select: el usuario puede seleccionar
    -- varios status, channels y horas simultáneamente. Los parámetros
    -- anteriores eran TEXT (un solo valor), ignorando cualquier selección
    -- de 2+ opciones. Se cambian a TEXT[] con ANY() para soportar multi-select.

    -- ── get_orders ──────────────────────────────────────────────────────────────

    DROP FUNCTION IF EXISTS public.get_orders(INT,INT,TEXT,TEXT,TEXT,TEXT,TEXT);

    CREATE OR REPLACE FUNCTION public.get_orders(
        p_limit      INT      DEFAULT 25,
        p_offset     INT      DEFAULT 0,
        p_search     TEXT     DEFAULT '',
        p_status     TEXT[]   DEFAULT NULL,
        p_channel    TEXT[]   DEFAULT NULL,
        p_date       TEXT     DEFAULT NULL,
        p_start_hour TEXT[]   DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $$
    DECLARE
        v_total INT;
        v_data  JSON;
    BEGIN
        IF NOT public.has_permission('orders.view') THEN
            RAISE EXCEPTION 'Permission denied: requires orders.view';
        END IF;

        SELECT COUNT(*) INTO v_total
        FROM public.orders o
        WHERE
            (p_search = '' OR p_search IS NULL OR (
                o.customer ILIKE '%' || p_search || '%' OR
                o.code     ILIKE '%' || p_search || '%' OR
                o.product  ILIKE '%' || p_search || '%'
            ))
            AND (p_status IS NULL     OR array_length(p_status, 1) IS NULL     OR o.status  = ANY(p_status))
            AND (p_channel IS NULL    OR array_length(p_channel, 1) IS NULL    OR o.channel = ANY(p_channel))
            AND (p_date IS NULL       OR o.date = p_date::DATE)
            AND (p_start_hour IS NULL OR array_length(p_start_hour, 1) IS NULL
                OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(
                    ARRAY(SELECT unnest(p_start_hour)::INT)
                ));

        SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]') INTO v_data
        FROM (
            SELECT
                o.id,
                o.date::TEXT,
                o.customer,
                o.product,
                o.category,
                to_char(o.start_time, 'HH24:MI') AS start_time,
                to_char(o.end_time,   'HH24:MI') AS end_time,
                o.code,
                o.status,
                o.channel,
                o.quantity,
                o.amount,
                o.region,
                o.payment,
                o.priority,
                o.created_at
            FROM public.orders o
            WHERE
                (p_search = '' OR p_search IS NULL OR (
                    o.customer ILIKE '%' || p_search || '%' OR
                    o.code     ILIKE '%' || p_search || '%' OR
                    o.product  ILIKE '%' || p_search || '%'
                ))
                AND (p_status IS NULL     OR array_length(p_status, 1) IS NULL     OR o.status  = ANY(p_status))
                AND (p_channel IS NULL    OR array_length(p_channel, 1) IS NULL    OR o.channel = ANY(p_channel))
                AND (p_date IS NULL       OR o.date = p_date::DATE)
                AND (p_start_hour IS NULL OR array_length(p_start_hour, 1) IS NULL
                    OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(
                        ARRAY(SELECT unnest(p_start_hour)::INT)
                    ))
            ORDER BY o.created_at DESC
            LIMIT p_limit OFFSET p_offset
        ) r;

        RETURN json_build_object('data', v_data, 'total', v_total);
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.get_orders(INT,INT,TEXT,TEXT[],TEXT[],TEXT,TEXT[]) TO authenticated;

    -- ── bulk_delete_orders_by_filter ────────────────────────────────────────────

    DROP FUNCTION IF EXISTS public.bulk_delete_orders_by_filter(TEXT,TEXT,TEXT,TEXT,TEXT,UUID[]);

    CREATE OR REPLACE FUNCTION public.bulk_delete_orders_by_filter(
        p_search       TEXT    DEFAULT '',
        p_status       TEXT[]  DEFAULT NULL,
        p_channel      TEXT[]  DEFAULT NULL,
        p_date         TEXT    DEFAULT NULL,
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
    BEGIN
        IF NOT public.has_permission('orders.view') THEN
            RAISE EXCEPTION 'Permission denied: requires orders.view';
        END IF;

        DELETE FROM public.orders o
        WHERE
            (p_search = '' OR p_search IS NULL OR (
                o.customer ILIKE '%' || p_search || '%' OR
                o.code     ILIKE '%' || p_search || '%' OR
                o.product  ILIKE '%' || p_search || '%'
            ))
            AND (p_status IS NULL     OR array_length(p_status, 1) IS NULL     OR o.status  = ANY(p_status))
            AND (p_channel IS NULL    OR array_length(p_channel, 1) IS NULL    OR o.channel = ANY(p_channel))
            AND (p_date IS NULL       OR o.date = p_date::DATE)
            AND (p_start_hour IS NULL OR array_length(p_start_hour, 1) IS NULL
                OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(
                    ARRAY(SELECT unnest(p_start_hour)::INT)
                ))
            AND (array_length(p_excluded_ids, 1) IS NULL OR o.id != ALL(p_excluded_ids));

        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN v_count;
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.bulk_delete_orders_by_filter(TEXT,TEXT[],TEXT[],TEXT,TEXT[],UUID[]) TO authenticated;

    -- ── get_orders_by_filter ────────────────────────────────────────────────────

    DROP FUNCTION IF EXISTS public.get_orders_by_filter(TEXT,TEXT,TEXT,TEXT,TEXT,UUID[]);

    CREATE OR REPLACE FUNCTION public.get_orders_by_filter(
        p_search       TEXT    DEFAULT '',
        p_status       TEXT[]  DEFAULT NULL,
        p_channel      TEXT[]  DEFAULT NULL,
        p_date         TEXT    DEFAULT NULL,
        p_start_hour   TEXT[]  DEFAULT NULL,
        p_excluded_ids UUID[]  DEFAULT ARRAY[]::UUID[]
    )
    RETURNS JSON
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $$
    DECLARE
        v_data JSON;
    BEGIN
        IF NOT public.has_permission('orders.view') THEN
            RAISE EXCEPTION 'Permission denied: requires orders.view';
        END IF;

        SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]') INTO v_data
        FROM (
            SELECT
                o.id,
                o.date::TEXT,
                o.customer,
                o.product,
                o.category,
                to_char(o.start_time, 'HH24:MI') AS start_time,
                to_char(o.end_time,   'HH24:MI') AS end_time,
                o.code,
                o.status,
                o.channel,
                o.quantity,
                o.amount,
                o.region,
                o.payment,
                o.priority,
                o.created_at
            FROM public.orders o
            WHERE
                (p_search = '' OR p_search IS NULL OR (
                    o.customer ILIKE '%' || p_search || '%' OR
                    o.code     ILIKE '%' || p_search || '%' OR
                    o.product  ILIKE '%' || p_search || '%'
                ))
                AND (p_status IS NULL     OR array_length(p_status, 1) IS NULL     OR o.status  = ANY(p_status))
                AND (p_channel IS NULL    OR array_length(p_channel, 1) IS NULL    OR o.channel = ANY(p_channel))
                AND (p_date IS NULL       OR o.date = p_date::DATE)
                AND (p_start_hour IS NULL OR array_length(p_start_hour, 1) IS NULL
                    OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(
                        ARRAY(SELECT unnest(p_start_hour)::INT)
                    ))
                AND (array_length(p_excluded_ids, 1) IS NULL OR o.id != ALL(p_excluded_ids))
            ORDER BY o.created_at DESC
        ) r;

        RETURN v_data;
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.get_orders_by_filter(TEXT,TEXT[],TEXT[],TEXT,TEXT[],UUID[]) TO authenticated;
