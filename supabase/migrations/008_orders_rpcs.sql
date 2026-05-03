-- ============================================================
-- 008: Orders — RPCs y acciones server-side
-- ============================================================
-- Ejecutar después de `007_orders_schema.sql`.
--
-- Qué configura:
--   1. RPCs de lectura, filtros, historial y estadísticas
--   2. RPCs server-side para export/copy/delete por filtro o IDs
--   3. Helpers de exportación
--   4. Grants de ejecución para RPCs

-- ============================================================
-- 1. RPCs
-- ============================================================

-- get_orders — paginación server-side con filtros y ordenamiento dinámico
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
    v_limit      INT;
    v_offset     INT;
BEGIN
    
    IF NOT (SELECT public.has_current_permission('orders.view')) THEN
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

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 1000);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);

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
    USING p_search, p_status, p_channel, p_date, v_hours, v_limit, v_offset
    INTO v_total, v_data;

    RETURN json_build_object(
        'data', v_data,
        'total', v_total
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────

-- get_queue_orders
CREATE OR REPLACE FUNCTION public.get_queue_orders()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (SELECT public.has_current_permission('orders.view')) THEN
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

-- ──────────────────────────────────────────────────────────────

-- get_orders_start_hours
CREATE OR REPLACE FUNCTION public.get_orders_start_hours()
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (SELECT public.has_current_permission('orders.view')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    RETURN ARRAY(
        SELECT DISTINCT to_char(start_time, 'HH24')
        FROM public.orders
        WHERE deleted_at IS NULL
        ORDER BY 1
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────

-- get_orders_stats
CREATE OR REPLACE FUNCTION public.get_orders_stats()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total      INT;
    v_by_status  JSON;
    v_by_channel JSON;
    v_revenue    NUMERIC;
BEGIN
    IF NOT (SELECT public.has_current_permission('orders.view')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_total, v_revenue
    FROM public.orders
    WHERE deleted_at IS NULL;

    SELECT json_object_agg(status, cnt) INTO v_by_status
    FROM (SELECT status, COUNT(*) AS cnt FROM public.orders WHERE deleted_at IS NULL GROUP BY status) s;

    SELECT json_object_agg(channel, cnt) INTO v_by_channel
    FROM (SELECT channel, COUNT(*) AS cnt FROM public.orders WHERE deleted_at IS NULL GROUP BY channel) c;

    RETURN json_build_object(
        'total',      v_total,
        'revenue',    v_revenue,
        'by_status',  COALESCE(v_by_status,  '{}'::JSON),
        'by_channel', COALESCE(v_by_channel, '{}'::JSON)
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────

-- get_order_history
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
DECLARE
    v_limit  INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
    v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF NOT (SELECT public.has_current_permission('orders.view')) THEN
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
            LIMIT v_limit OFFSET v_offset
        ) r
    ), '[]'::JSON);
END;
$$;

-- ──────────────────────────────────────────────────────────────

-- record_order_history
CREATE OR REPLACE FUNCTION public.record_order_history(
    p_action      TEXT,
    p_description TEXT,
    p_order_id    UUID    DEFAULT NULL,
    p_details     JSONB   DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_email TEXT;
BEGIN
    SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
    INSERT INTO public.order_history (action, description, actor_email, order_id, details)
    VALUES (p_action, p_description, COALESCE(v_email, 'unknown'), p_order_id, p_details);
END;
$$;

-- ──────────────────────────────────────────────────────────────

-- get_orders_by_filter
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
    
    IF NOT (SELECT public.has_current_permission('orders.export')) THEN
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

-- ──────────────────────────────────────────────────────────────

-- bulk_delete_orders_by_filter
CREATE OR REPLACE FUNCTION public.bulk_delete_orders_by_filter(
    p_search       TEXT    DEFAULT '',
    p_status       TEXT[]  DEFAULT NULL,
    p_channel      TEXT[]  DEFAULT NULL,
    p_date         DATE    DEFAULT NULL,
    p_start_hour   TEXT[]  DEFAULT NULL,
    p_excluded_ids UUID[]  DEFAULT ARRAY[]::UUID[],
    p_expected_count INT   DEFAULT NULL
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
    v_target_ids UUID[];
BEGIN
    IF NOT (SELECT public.has_current_permission('orders.bulk_delete')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.bulk_delete';
    END IF;

    IF p_start_hour IS NOT NULL THEN
        SELECT array_agg(x::INT)
        INTO v_hours
        FROM unnest(p_start_hour) x
        WHERE x ~ '^\d+$';
    END IF;

    SELECT COALESCE(array_agg(o.id ORDER BY o.created_at DESC, o.id DESC), ARRAY[]::UUID[])
    INTO v_target_ids
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

    v_count := COALESCE(array_length(v_target_ids, 1), 0);

    IF p_expected_count IS NOT NULL AND v_count <> p_expected_count THEN
        RAISE EXCEPTION 'Bulk delete scope changed: expected %, found %', p_expected_count, v_count;
    END IF;

    PERFORM set_config('app.bulk_op', 'true', true);

    UPDATE public.orders o
    SET deleted_at = NOW()
    WHERE o.id = ANY(v_target_ids)
      AND o.deleted_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    IF v_count > 0 THEN
        INSERT INTO public.order_history (action, description, actor_email, details)
        VALUES (
            'delete',
            'Bulk deleted ' || v_count::TEXT || ' orders via filter',
            COALESCE(auth.jwt() ->> 'email', 'system'),
            jsonb_build_object(
                'rowCount', v_count,
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

-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.order_export_value(
    p_field TEXT,
    p_id UUID,
    p_date DATE,
    p_customer TEXT,
    p_product TEXT,
    p_category TEXT,
    p_start_time TIME,
    p_end_time TIME,
    p_code TEXT,
    p_status TEXT,
    p_channel TEXT,
    p_quantity INT,
    p_amount NUMERIC,
    p_region TEXT,
    p_payment TEXT,
    p_priority TEXT,
    p_created_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT CASE p_field
        WHEN 'id' THEN p_id::text
        WHEN 'date' THEN p_date::text
        WHEN 'customer' THEN p_customer
        WHEN 'product' THEN p_product
        WHEN 'category' THEN p_category
        WHEN 'time' THEN to_char(p_start_time, 'HH24:MI') || ' - ' || to_char(p_end_time, 'HH24:MI')
        WHEN 'start_time' THEN to_char(p_start_time, 'HH24:MI')
        WHEN 'end_time' THEN to_char(p_end_time, 'HH24:MI')
        WHEN 'code' THEN p_code
        WHEN 'status' THEN p_status
        WHEN 'channel' THEN p_channel
        WHEN 'quantity' THEN p_quantity::text
        WHEN 'amount' THEN p_amount::text
        WHEN 'region' THEN p_region
        WHEN 'payment' THEN p_payment
        WHEN 'priority' THEN p_priority
        WHEN 'created_at' THEN p_created_at::text
        ELSE NULL
    END;
$$;

CREATE OR REPLACE FUNCTION public.text_csv_escape(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_value IS NULL THEN ''
        WHEN p_value ~ '[,"\r\n]' THEN '"' || replace(p_value, '"', '""') || '"'
        ELSE p_value
    END;
$$;

CREATE OR REPLACE FUNCTION public.render_order_template(
    p_template TEXT,
    p_id UUID,
    p_date DATE,
    p_customer TEXT,
    p_product TEXT,
    p_category TEXT,
    p_start_time TIME,
    p_end_time TIME,
    p_code TEXT,
    p_status TEXT,
    p_channel TEXT,
    p_quantity INT,
    p_amount NUMERIC,
    p_region TEXT,
    p_payment TEXT,
    p_priority TEXT,
    p_created_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    v_result TEXT := COALESCE(p_template, '');
    v_field  TEXT;
BEGIN
    v_result := replace(v_result, '\n', E'\n');
    v_result := replace(v_result, '\t', E'\t');

    FOREACH v_field IN ARRAY ARRAY[
        'id','date','customer','product','category','time','start_time','end_time',
        'code','status','channel','quantity','amount','region','payment','priority','created_at'
    ] LOOP
        v_result := replace(
            v_result,
            '{' || v_field || '}',
            COALESCE(public.order_export_value(
                v_field,
                p_id,
                p_date,
                p_customer,
                p_product,
                p_category,
                p_start_time,
                p_end_time,
                p_code,
                p_status,
                p_channel,
                p_quantity,
                p_amount,
                p_region,
                p_payment,
                p_priority,
                p_created_at
            ), '')
        );
    END LOOP;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.export_orders_by_filter(
    p_search       TEXT    DEFAULT '',
    p_status       TEXT[]  DEFAULT NULL,
    p_channel      TEXT[]  DEFAULT NULL,
    p_date         DATE    DEFAULT NULL,
    p_start_hour   TEXT[]  DEFAULT NULL,
    p_excluded_ids UUID[]  DEFAULT ARRAY[]::UUID[],
    p_sort_col     TEXT    DEFAULT NULL,
    p_sort_dir     TEXT    DEFAULT NULL,
    p_format       TEXT    DEFAULT 'csv',
    p_fields       TEXT[]  DEFAULT NULL,
    p_headers      BOOLEAN DEFAULT TRUE,
    p_template     TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sql        TEXT;
    v_sort_c     TEXT := 'created_at';
    v_sort_d     TEXT := 'DESC';
    v_hours      INT[];
    v_fields     TEXT[];
    v_content    TEXT;
    v_count      INT;
    v_max_direct_rows INT := 10000;
    v_delim      TEXT;
    v_format     TEXT := lower(COALESCE(p_format, 'csv'));
BEGIN
    IF NOT (SELECT public.has_current_permission('orders.export')) AND NOT (SELECT public.has_current_permission('orders.copy')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.export or orders.copy';
    END IF;

    v_fields := COALESCE(p_fields, ARRAY['date','customer','product','category','time','code','status','channel','quantity','amount','region','payment','priority']);
    SELECT array_agg(field)
    INTO v_fields
    FROM unnest(v_fields) field
    WHERE field = ANY(ARRAY['id','date','customer','product','category','time','start_time','end_time','code','status','channel','quantity','amount','region','payment','priority','created_at']);

    IF array_length(v_fields, 1) IS NULL THEN
        RAISE EXCEPTION 'No exportable fields selected';
    END IF;

    v_sort_c := CASE p_sort_col
        WHEN 'id' THEN 'id' WHEN 'date' THEN 'date' WHEN 'customer' THEN 'customer'
        WHEN 'product' THEN 'product' WHEN 'category' THEN 'category' WHEN 'time' THEN 'start_time'
        WHEN 'start_time' THEN 'start_time' WHEN 'end_time' THEN 'end_time' WHEN 'code' THEN 'code'
        WHEN 'status' THEN 'status' WHEN 'channel' THEN 'channel' WHEN 'quantity' THEN 'quantity'
        WHEN 'amount' THEN 'amount' WHEN 'region' THEN 'region' WHEN 'payment' THEN 'payment'
        WHEN 'priority' THEN 'priority' WHEN 'created_at' THEN 'created_at' ELSE 'created_at'
    END;

    IF lower(p_sort_dir) = 'asc' THEN v_sort_d := 'ASC';
    ELSIF lower(p_sort_dir) = 'desc' THEN v_sort_d := 'DESC';
    END IF;

    IF p_start_hour IS NOT NULL THEN
        SELECT array_agg(x::INT) INTO v_hours FROM unnest(p_start_hour) x WHERE x ~ '^\d+$';
    END IF;

    v_delim := CASE
        WHEN v_format = 'tsv' THEN E'\t'
        WHEN v_format = 'lines' THEN ' - '
        ELSE ','
    END;

    SELECT COUNT(*)
    INTO v_count
    FROM public.orders o
    WHERE o.deleted_at IS NULL
        AND (p_search = '' OR p_search IS NULL OR (
            o.customer ILIKE '%' || p_search || '%' OR
            o.code     ILIKE '%' || p_search || '%' OR
            o.product  ILIKE '%' || p_search || '%'
        ))
        AND (p_status IS NULL OR array_length(p_status, 1) IS NULL OR o.status = ANY(p_status))
        AND (p_channel IS NULL OR array_length(p_channel, 1) IS NULL OR o.channel = ANY(p_channel))
        AND (p_date IS NULL OR o.date = p_date)
        AND (v_hours IS NULL OR array_length(v_hours, 1) IS NULL OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(v_hours))
        AND (array_length(p_excluded_ids, 1) IS NULL OR o.id != ALL(p_excluded_ids));

    IF v_count > v_max_direct_rows THEN
        RAISE EXCEPTION 'Direct export is limited to % rows. Use an async export job for % rows.',
            v_max_direct_rows, v_count;
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
                AND ($2 IS NULL OR array_length($2, 1) IS NULL OR o.status = ANY($2))
                AND ($3 IS NULL OR array_length($3, 1) IS NULL OR o.channel = ANY($3))
                AND ($4 IS NULL OR o.date = $4)
                AND ($5 IS NULL OR array_length($5, 1) IS NULL OR EXTRACT(HOUR FROM o.start_time)::INT = ANY($5))
                AND (array_length($6, 1) IS NULL OR o.id != ALL($6))
        ),
        ordered AS (
            SELECT row_number() OVER () AS rn, ordered_rows.*
            FROM (
                SELECT *
                FROM filtered
                ORDER BY %I %s NULLS LAST, created_at DESC, id DESC
            ) ordered_rows
        ),
        row_lines AS (
            SELECT o.rn,
                   o.id,
                   string_agg(
                       CASE
                           WHEN $9 = 'custom' THEN public.render_order_template($11, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time, o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment, o.priority, o.created_at)
                           WHEN $9 = 'csv' THEN public.text_csv_escape(public.order_export_value(f.field, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time, o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment, o.priority, o.created_at))
                           ELSE COALESCE(replace(public.order_export_value(f.field, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time, o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment, o.priority, o.created_at), E'\t', ' '), '')
                       END,
                       $8 ORDER BY f.ordinality
                   ) AS line
            FROM ordered o
            CROSS JOIN unnest(CASE WHEN $9 = 'custom' THEN ARRAY['id'] ELSE $7 END::text[]) WITH ORDINALITY AS f(field, ordinality)
            GROUP BY o.rn, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time,
                     o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment,
                     o.priority, o.created_at
        )
        SELECT
            (SELECT COUNT(*) FROM ordered),
            CASE
                WHEN $9 = 'json' THEN (
                    SELECT COALESCE(jsonb_agg(obj ORDER BY rn)::text, '[]')
                    FROM (
                        SELECT o.rn,
                               jsonb_object_agg(f.field, public.order_export_value(f.field, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time, o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment, o.priority, o.created_at) ORDER BY f.ordinality) AS obj
                        FROM ordered o
                        CROSS JOIN unnest($7::text[]) WITH ORDINALITY AS f(field, ordinality)
                        GROUP BY o.rn, o.id, o.date, o.customer, o.product, o.category, o.start_time, o.end_time,
                                 o.code, o.status, o.channel, o.quantity, o.amount, o.region, o.payment,
                                 o.priority, o.created_at
                    ) j
                )
                WHEN $9 = 'md' THEN (
                    '| ' || array_to_string($7, ' | ') || ' |' || E'\n' ||
                    '| ' || array_to_string(ARRAY(SELECT '---' FROM unnest($7)), ' | ') || ' |' || E'\n' ||
                    COALESCE((SELECT string_agg('| ' || replace(line, $8, ' | ') || ' |', E'\n' ORDER BY rn) FROM row_lines), '')
                )
                WHEN $9 = 'custom' THEN (
                    COALESCE((SELECT string_agg(line, E'\n' ORDER BY rn) FROM row_lines), '')
                )
                ELSE (
                    CASE WHEN $9 IN ('csv','tsv') AND $10 THEN array_to_string($7, $8) || E'\n' ELSE '' END ||
                    COALESCE((SELECT string_agg(line, E'\n' ORDER BY rn) FROM row_lines), '')
                )
            END
    $query$, v_sort_c, v_sort_d);

    EXECUTE v_sql
    USING p_search, p_status, p_channel, p_date, v_hours, p_excluded_ids, v_fields, v_delim, v_format, p_headers, p_template
    INTO v_count, v_content;

    RETURN json_build_object('content', COALESCE(v_content, ''), 'row_count', COALESCE(v_count, 0));
END;
$$;

-- get_orders_by_ids
-- Obtiene un array de órdenes completo a partir de sus IDs, sorteando los límites de longitud de URL del frontend
CREATE OR REPLACE FUNCTION public.get_orders_by_ids(p_ids UUID[])
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_data JSON;
BEGIN
    IF NOT (SELECT public.has_current_permission('orders.export')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.export';
    END IF;

    IF COALESCE(array_length(p_ids, 1), 0) > 10000 THEN
        RAISE EXCEPTION 'Too many orders requested at once';
    END IF;

    SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) INTO v_data
    FROM (
        SELECT
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
        FROM public.orders
        WHERE id = ANY(p_ids) AND deleted_at IS NULL
        ORDER BY array_position(p_ids, id)
    ) r;

    RETURN v_data;
END;
$$;

-- ──────────────────────────────────────────────────────────────

-- bulk_delete_orders_by_ids
-- Elimina un array específico de órdenes, sorteando los límites de longitud de URL del frontend
CREATE OR REPLACE FUNCTION public.bulk_delete_orders_by_ids(p_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
    v_requested_count INT := COALESCE(array_length(p_ids, 1), 0);
BEGIN
    IF v_requested_count = 1 THEN
        IF NOT (SELECT public.has_current_permission('orders.delete'))
           AND NOT (SELECT public.has_current_permission('orders.bulk_delete')) THEN
            RAISE EXCEPTION 'Permission denied: requires orders.delete';
        END IF;
    ELSIF NOT (SELECT public.has_current_permission('orders.bulk_delete')) THEN
        RAISE EXCEPTION 'Permission denied: requires orders.bulk_delete';
    END IF;

    IF v_requested_count > 10000 THEN
        RAISE EXCEPTION 'Too many orders selected at once';
    END IF;

    PERFORM set_config('app.bulk_op', 'true', true);

    UPDATE public.orders SET deleted_at = NOW() WHERE id = ANY(p_ids) AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO public.order_history (action, description, actor_email, details)
        VALUES (
            'delete',
            'Bulk deleted ' || v_count::TEXT || ' orders manually',
            COALESCE(auth.jwt() ->> 'email', 'system'),
            jsonb_build_object('rowCount', v_count)
        );
    END IF;

    PERFORM set_config('app.bulk_op', 'false', true);

    RETURN v_count;
END;
$$;


-- ============================================================
-- 2. GRANTS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_orders(INT,INT,TEXT,TEXT[],TEXT[],DATE,TEXT[],TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_queue_orders()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_stats()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_history(INT,INT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_start_hours()                   TO authenticated;
REVOKE ALL ON FUNCTION public.record_order_history(TEXT,TEXT,UUID,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],UUID[],TEXT,TEXT,INT,INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_orders_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],UUID[],TEXT,TEXT,TEXT,TEXT[],BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_orders_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],UUID[],INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_by_ids(UUID[])                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_orders_by_ids(UUID[])          TO authenticated;
