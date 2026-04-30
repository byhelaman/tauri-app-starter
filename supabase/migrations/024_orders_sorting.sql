-- ============================================================
-- 023: Dynamic Sorting — ORDER BY in orders RPCs
-- ============================================================

-- ── get_orders ──────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_orders(INT,INT,TEXT,TEXT[],TEXT[],TEXT,TEXT[]);
DROP FUNCTION IF EXISTS public.get_orders(INT,INT,TEXT,TEXT[],TEXT[],TEXT,TEXT[],TEXT,TEXT);

CREATE OR REPLACE FUNCTION public.get_orders(
    p_limit      INT      DEFAULT 25,
    p_offset     INT      DEFAULT 0,
    p_search     TEXT     DEFAULT '',
    p_status     TEXT[]   DEFAULT NULL,
    p_channel    TEXT[]   DEFAULT NULL,
    p_date       TEXT     DEFAULT NULL,
    p_start_hour TEXT[]   DEFAULT NULL,
    p_sort_col   TEXT     DEFAULT NULL,
    p_sort_dir   TEXT     DEFAULT NULL
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

    SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.rn ASC), '[]') INTO v_data
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
            o.created_at,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN p_sort_col = 'date' AND p_sort_dir = 'asc' THEN o.date END ASC,
                    CASE WHEN p_sort_col = 'date' AND p_sort_dir = 'desc' THEN o.date END DESC,
                    CASE WHEN p_sort_col = 'customer' AND p_sort_dir = 'asc' THEN o.customer END ASC,
                    CASE WHEN p_sort_col = 'customer' AND p_sort_dir = 'desc' THEN o.customer END DESC,
                    CASE WHEN p_sort_col = 'product' AND p_sort_dir = 'asc' THEN o.product END ASC,
                    CASE WHEN p_sort_col = 'product' AND p_sort_dir = 'desc' THEN o.product END DESC,
                    CASE WHEN p_sort_col = 'status' AND p_sort_dir = 'asc' THEN o.status END ASC,
                    CASE WHEN p_sort_col = 'status' AND p_sort_dir = 'desc' THEN o.status END DESC,
                    CASE WHEN p_sort_col = 'channel' AND p_sort_dir = 'asc' THEN o.channel END ASC,
                    CASE WHEN p_sort_col = 'channel' AND p_sort_dir = 'desc' THEN o.channel END DESC,
                    CASE WHEN p_sort_col = 'amount' AND p_sort_dir = 'asc' THEN o.amount END ASC,
                    CASE WHEN p_sort_col = 'amount' AND p_sort_dir = 'desc' THEN o.amount END DESC,
                    CASE WHEN p_sort_col = 'code' AND p_sort_dir = 'asc' THEN o.code END ASC,
                    CASE WHEN p_sort_col = 'code' AND p_sort_dir = 'desc' THEN o.code END DESC,
                    o.created_at DESC
            ) as rn
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
        ORDER BY rn ASC
        LIMIT p_limit OFFSET p_offset
    ) r;

    RETURN json_build_object('data', v_data, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orders(INT,INT,TEXT,TEXT[],TEXT[],TEXT,TEXT[],TEXT,TEXT) TO authenticated;

-- ── get_orders_by_filter ────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_orders_by_filter(TEXT,TEXT[],TEXT[],TEXT,TEXT[],UUID[]);
DROP FUNCTION IF EXISTS public.get_orders_by_filter(TEXT,TEXT[],TEXT[],TEXT,TEXT[],UUID[],TEXT,TEXT);

CREATE OR REPLACE FUNCTION public.get_orders_by_filter(
    p_search       TEXT    DEFAULT '',
    p_status       TEXT[]  DEFAULT NULL,
    p_channel      TEXT[]  DEFAULT NULL,
    p_date         TEXT    DEFAULT NULL,
    p_start_hour   TEXT[]  DEFAULT NULL,
    p_excluded_ids UUID[]  DEFAULT ARRAY[]::UUID[],
    p_sort_col     TEXT    DEFAULT NULL,
    p_sort_dir     TEXT    DEFAULT NULL
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

    SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.rn ASC), '[]') INTO v_data
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
            o.created_at,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN p_sort_col = 'date' AND p_sort_dir = 'asc' THEN o.date END ASC,
                    CASE WHEN p_sort_col = 'date' AND p_sort_dir = 'desc' THEN o.date END DESC,
                    CASE WHEN p_sort_col = 'customer' AND p_sort_dir = 'asc' THEN o.customer END ASC,
                    CASE WHEN p_sort_col = 'customer' AND p_sort_dir = 'desc' THEN o.customer END DESC,
                    CASE WHEN p_sort_col = 'product' AND p_sort_dir = 'asc' THEN o.product END ASC,
                    CASE WHEN p_sort_col = 'product' AND p_sort_dir = 'desc' THEN o.product END DESC,
                    CASE WHEN p_sort_col = 'status' AND p_sort_dir = 'asc' THEN o.status END ASC,
                    CASE WHEN p_sort_col = 'status' AND p_sort_dir = 'desc' THEN o.status END DESC,
                    CASE WHEN p_sort_col = 'channel' AND p_sort_dir = 'asc' THEN o.channel END ASC,
                    CASE WHEN p_sort_col = 'channel' AND p_sort_dir = 'desc' THEN o.channel END DESC,
                    CASE WHEN p_sort_col = 'amount' AND p_sort_dir = 'asc' THEN o.amount END ASC,
                    CASE WHEN p_sort_col = 'amount' AND p_sort_dir = 'desc' THEN o.amount END DESC,
                    CASE WHEN p_sort_col = 'code' AND p_sort_dir = 'asc' THEN o.code END ASC,
                    CASE WHEN p_sort_col = 'code' AND p_sort_dir = 'desc' THEN o.code END DESC,
                    o.created_at DESC
            ) as rn
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
        ORDER BY rn ASC
    ) r;

    RETURN v_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_by_filter(TEXT,TEXT[],TEXT[],TEXT,TEXT[],UUID[],TEXT,TEXT) TO authenticated;
