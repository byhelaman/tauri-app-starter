-- ============================================================
-- 014: Añadir filtro por hora de inicio a get_orders
-- ============================================================
-- El filtro de Interval en la UI pasa la hora de inicio (e.g. "08")
-- como filtro de columna. La RPC debe filtrarlo server-side.

CREATE OR REPLACE FUNCTION public.get_orders(
    p_limit      INT     DEFAULT 25,
    p_offset     INT     DEFAULT 0,
    p_search     TEXT    DEFAULT '',
    p_status     TEXT    DEFAULT NULL,
    p_channel    TEXT    DEFAULT NULL,
    p_date       TEXT    DEFAULT NULL,
    p_start_hour TEXT    DEFAULT NULL   -- 'HH' e.g. '08', '14'
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
        AND (p_status     IS NULL OR o.status  = p_status)
        AND (p_channel    IS NULL OR o.channel = p_channel)
        AND (p_date       IS NULL OR o.date    = p_date::DATE)
        AND (p_start_hour IS NULL OR EXTRACT(HOUR FROM o.start_time)::INT = p_start_hour::INT);

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
            AND (p_status     IS NULL OR o.status  = p_status)
            AND (p_channel    IS NULL OR o.channel = p_channel)
            AND (p_date       IS NULL OR o.date    = p_date::DATE)
            AND (p_start_hour IS NULL OR EXTRACT(HOUR FROM o.start_time)::INT = p_start_hour::INT)
        ORDER BY o.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) r;

    RETURN json_build_object('data', v_data, 'total', v_total);
END;
$$;
