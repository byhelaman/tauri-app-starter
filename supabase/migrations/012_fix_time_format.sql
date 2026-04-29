-- ============================================================
-- 012: Fix formato de time en get_orders y get_queue_orders
-- ============================================================
-- TIME::TEXT en PostgreSQL produce 'HH:MM:SS'.
-- La UI espera 'HH:MM', así que usamos to_char(time, 'HH24:MI').

CREATE OR REPLACE FUNCTION public.get_orders(
    p_limit   INT     DEFAULT 25,
    p_offset  INT     DEFAULT 0,
    p_search  TEXT    DEFAULT '',
    p_status  TEXT    DEFAULT NULL,
    p_channel TEXT    DEFAULT NULL,
    p_date    TEXT    DEFAULT NULL
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
        (p_search  = '' OR p_search IS NULL OR (
            o.customer ILIKE '%' || p_search || '%' OR
            o.code     ILIKE '%' || p_search || '%' OR
            o.product  ILIKE '%' || p_search || '%'
        ))
        AND (p_status  IS NULL OR o.status  = p_status)
        AND (p_channel IS NULL OR o.channel = p_channel)
        AND (p_date    IS NULL OR o.date    = p_date::DATE);

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
            (p_search  = '' OR p_search IS NULL OR (
                o.customer ILIKE '%' || p_search || '%' OR
                o.code     ILIKE '%' || p_search || '%' OR
                o.product  ILIKE '%' || p_search || '%'
            ))
            AND (p_status  IS NULL OR o.status  = p_status)
            AND (p_channel IS NULL OR o.channel = p_channel)
            AND (p_date    IS NULL OR o.date    = p_date::DATE)
        ORDER BY o.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) r;

    RETURN json_build_object('data', v_data, 'total', v_total);
END;
$$;

-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_queue_orders()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('orders.view') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    RETURN json_build_object(
        'data', COALESCE((
            SELECT json_agg(row_to_json(r) ORDER BY r.created_at DESC)
            FROM (
                SELECT
                    id,
                    to_char(start_time, 'HH24:MI') AS start_time,
                    to_char(end_time,   'HH24:MI') AS end_time,
                    code, customer, status, channel, agent, priority, created_at
                FROM public.queue_orders
                ORDER BY created_at DESC
            ) r
        ), '[]'::JSON),
        'total', (SELECT COUNT(*) FROM public.queue_orders)
    );
END;
$$;
