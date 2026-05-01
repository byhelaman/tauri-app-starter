-- ============================================================
-- 012_stabilize_order_sorting.sql
-- Evita que una fila "salte" de posición tras editar/refetchear.
-- ============================================================

ALTER TABLE public.order_change_events
    ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

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

CREATE OR REPLACE FUNCTION public.get_orders(
    p_limit      INT      DEFAULT 25,
    p_offset     INT      DEFAULT 0,
    p_search     TEXT     DEFAULT '',
    p_status     TEXT[]   DEFAULT NULL,
    p_channel    TEXT[]   DEFAULT NULL,
    p_date       DATE     DEFAULT NULL,
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
    v_total      INT;
    v_data       JSON;
    v_sql        TEXT;
    v_sort_c     TEXT := 'created_at';
    v_sort_d     TEXT := 'DESC';
    v_hours      INT[];
BEGIN
    IF NOT public.has_permission_live('orders.view') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    v_sort_c := CASE p_sort_col
        WHEN 'id' THEN 'id'
        WHEN 'date' THEN 'date'
        WHEN 'customer' THEN 'customer'
        WHEN 'product' THEN 'product'
        WHEN 'category' THEN 'category'
        WHEN 'time' THEN 'start_time'
        WHEN 'start_time' THEN 'start_time'
        WHEN 'end_time' THEN 'end_time'
        WHEN 'code' THEN 'code'
        WHEN 'status' THEN 'status'
        WHEN 'channel' THEN 'channel'
        WHEN 'quantity' THEN 'quantity'
        WHEN 'amount' THEN 'amount'
        WHEN 'region' THEN 'region'
        WHEN 'payment' THEN 'payment'
        WHEN 'priority' THEN 'priority'
        WHEN 'created_at' THEN 'created_at'
        ELSE 'created_at'
    END;

    IF lower(p_sort_dir) = 'asc' THEN
        v_sort_d := 'ASC';
    ELSIF lower(p_sort_dir) = 'desc' THEN
        v_sort_d := 'DESC';
    END IF;

    IF p_start_hour IS NOT NULL THEN
        SELECT array_agg(x::INT)
        INTO v_hours
        FROM unnest(p_start_hour) x
        WHERE x ~ '^\d+$';
    END IF;

    v_sql := format($query$
        WITH filtered AS (
            SELECT o.*
            FROM public.orders o
            WHERE o.deleted_at IS NULL
                AND ($1 = '' OR $1 IS NULL OR (
                    o.customer ILIKE '%%' || $1 || '%%' OR
                    o.code     ILIKE '%%' || $1 || '%%' OR
                    o.product  ILIKE '%%' || $1 || '%%'
                ))
                AND ($2 IS NULL OR array_length($2, 1) IS NULL OR o.status  = ANY($2))
                AND ($3 IS NULL OR array_length($3, 1) IS NULL OR o.channel = ANY($3))
                AND ($4 IS NULL OR o.date = $4)
                AND ($5 IS NULL OR array_length($5, 1) IS NULL
                    OR EXTRACT(HOUR FROM o.start_time)::INT = ANY($5))
        )
        SELECT
            (SELECT COUNT(*) FROM filtered),
            (
                SELECT COALESCE(json_agg((to_jsonb(r) - '__row_order') ORDER BY r.__row_order), '[]'::json)
                FROM (
                    SELECT
                        ROW_NUMBER() OVER (ORDER BY %I %s NULLS LAST, created_at DESC, id DESC) AS __row_order,
                        id,
                        date::TEXT,
                        customer,
                        product,
                        category,
                        to_char(start_time, 'HH24:MI') AS start_time,
                        to_char(end_time,   'HH24:MI') AS end_time,
                        code,
                        status,
                        channel,
                        quantity,
                        amount,
                        region,
                        payment,
                        priority,
                        created_at
                    FROM filtered
                    ORDER BY %I %s NULLS LAST, created_at DESC, id DESC
                    LIMIT $6 OFFSET $7
                ) r
            )
    $query$, v_sort_c, v_sort_d, v_sort_c, v_sort_d);

    EXECUTE v_sql
    USING p_search, p_status, p_channel, p_date, v_hours, p_limit, p_offset
    INTO v_total, v_data;

    RETURN json_build_object(
        'data', v_data,
        'total', v_total
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_orders_by_filter(
    p_search       TEXT    DEFAULT '',
    p_status       TEXT[]  DEFAULT NULL,
    p_channel      TEXT[]  DEFAULT NULL,
    p_date         DATE    DEFAULT NULL,
    p_start_hour   TEXT[]  DEFAULT NULL,
    p_excluded_ids UUID[]  DEFAULT ARRAY[]::UUID[],
    p_sort_col     TEXT    DEFAULT NULL,
    p_sort_dir     TEXT    DEFAULT NULL,
    p_limit        INT     DEFAULT 5000,
    p_offset       INT     DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_data       JSON;
    v_sql        TEXT;
    v_sort_c     TEXT := 'created_at';
    v_sort_d     TEXT := 'DESC';
    v_hours      INT[];
    v_limit      INT;
    v_offset     INT;
BEGIN
    IF NOT public.has_permission_live('orders.export') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.export';
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 10000);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);

    v_sort_c := CASE p_sort_col
        WHEN 'id' THEN 'id'
        WHEN 'date' THEN 'date'
        WHEN 'customer' THEN 'customer'
        WHEN 'product' THEN 'product'
        WHEN 'category' THEN 'category'
        WHEN 'time' THEN 'start_time'
        WHEN 'start_time' THEN 'start_time'
        WHEN 'end_time' THEN 'end_time'
        WHEN 'code' THEN 'code'
        WHEN 'status' THEN 'status'
        WHEN 'channel' THEN 'channel'
        WHEN 'quantity' THEN 'quantity'
        WHEN 'amount' THEN 'amount'
        WHEN 'region' THEN 'region'
        WHEN 'payment' THEN 'payment'
        WHEN 'priority' THEN 'priority'
        WHEN 'created_at' THEN 'created_at'
        ELSE 'created_at'
    END;

    IF lower(p_sort_dir) = 'asc' THEN
        v_sort_d := 'ASC';
    ELSIF lower(p_sort_dir) = 'desc' THEN
        v_sort_d := 'DESC';
    END IF;

    IF p_start_hour IS NOT NULL THEN
        SELECT array_agg(x::INT)
        INTO v_hours
        FROM unnest(p_start_hour) x
        WHERE x ~ '^\d+$';
    END IF;

    v_sql := format($query$
        WITH filtered AS (
            SELECT o.*
            FROM public.orders o
            WHERE o.deleted_at IS NULL
                AND ($1 = '' OR $1 IS NULL OR (
                    o.customer ILIKE '%%' || $1 || '%%' OR
                    o.code     ILIKE '%%' || $1 || '%%' OR
                    o.product  ILIKE '%%' || $1 || '%%'
                ))
                AND ($2 IS NULL OR array_length($2, 1) IS NULL OR o.status  = ANY($2))
                AND ($3 IS NULL OR array_length($3, 1) IS NULL OR o.channel = ANY($3))
                AND ($4 IS NULL OR o.date = $4)
                AND ($5 IS NULL OR array_length($5, 1) IS NULL
                    OR EXTRACT(HOUR FROM o.start_time)::INT = ANY($5))
                AND (array_length($6, 1) IS NULL OR o.id != ALL($6))
        )
        SELECT COALESCE(json_agg((to_jsonb(r) - '__row_order') ORDER BY r.__row_order), '[]'::json)
        FROM (
            SELECT
                ROW_NUMBER() OVER (ORDER BY %I %s NULLS LAST, created_at DESC, id DESC) AS __row_order,
                id,
                date::TEXT,
                customer,
                product,
                category,
                to_char(start_time, 'HH24:MI') AS start_time,
                to_char(end_time,   'HH24:MI') AS end_time,
                code,
                status,
                channel,
                quantity,
                amount,
                region,
                payment,
                priority,
                created_at
            FROM filtered
            ORDER BY %I %s NULLS LAST, created_at DESC, id DESC
            LIMIT $7 OFFSET $8
        ) r
    $query$, v_sort_c, v_sort_d, v_sort_c, v_sort_d);

    EXECUTE v_sql
    USING p_search, p_status, p_channel, p_date, v_hours, p_excluded_ids, v_limit, v_offset
    INTO v_data;

    RETURN v_data;
END;
$$;
