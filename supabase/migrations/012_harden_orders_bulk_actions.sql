-- ============================================================
-- Harden orders destructive actions, exports, AI schema, grants
-- ============================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- Orders indexes aligned to active-row filters and common ordering paths.
DROP INDEX IF EXISTS public.idx_orders_status;
DROP INDEX IF EXISTS public.idx_orders_channel;
DROP INDEX IF EXISTS public.idx_orders_date;
DROP INDEX IF EXISTS public.idx_orders_created_at;

CREATE INDEX IF NOT EXISTS idx_orders_active_created_at ON public.orders(created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_active_date_created_at ON public.orders(date DESC, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_active_status_created_at ON public.orders(status, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_active_channel_created_at ON public.orders(channel, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_active_start_hour_created_at
    ON public.orders ((EXTRACT(HOUR FROM start_time)::INT), created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

-- Block hard deletes and prevent normal updates from touching trashed rows.
DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders
    FOR UPDATE TO authenticated
    USING  ((SELECT public.has_permission_live('orders.update')) AND deleted_at IS NULL)
    WITH CHECK ((SELECT public.has_permission_live('orders.update')) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "orders_delete" ON public.orders;

-- Retain realtime aggregate events only while operationally useful.
CREATE OR REPLACE FUNCTION public.prune_order_change_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.order_change_events
    WHERE created_at < NOW() - INTERVAL '30 days';
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS prune_order_change_events_after_insert ON public.order_change_events;
CREATE TRIGGER prune_order_change_events_after_insert
    AFTER INSERT ON public.order_change_events
    FOR EACH STATEMENT EXECUTE FUNCTION public.prune_order_change_events();

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
            'Created order',
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
            jsonb_build_object('rowCount', v_count)
        );
    END IF;

    IF v_count > 0 THEN
        INSERT INTO public.order_change_events (table_name, action, actor_id, row_count)
        VALUES ('orders', 'insert', auth.uid(), v_count);
    END IF;
    RETURN NULL;
END;
$$;

-- Replace the old unsafe filter delete signature.
DROP FUNCTION IF EXISTS public.bulk_delete_orders_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],UUID[]);

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
    IF NOT (SELECT public.has_permission_live('orders.bulk_delete')) THEN
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

GRANT EXECUTE ON FUNCTION public.bulk_delete_orders_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],UUID[],INT) TO authenticated;

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
        IF NOT (SELECT public.has_permission_live('orders.delete'))
           AND NOT (SELECT public.has_permission_live('orders.bulk_delete')) THEN
            RAISE EXCEPTION 'Permission denied: requires orders.delete';
        END IF;
    ELSIF NOT (SELECT public.has_permission_live('orders.bulk_delete')) THEN
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

GRANT EXECUTE ON FUNCTION public.bulk_delete_orders_by_ids(UUID[]) TO authenticated;

-- Direct RPC export is intentionally bounded. Larger exports should move to async jobs.
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
    IF NOT (SELECT public.has_permission_live('orders.export')) AND NOT (SELECT public.has_permission_live('orders.copy')) THEN
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

GRANT EXECUTE ON FUNCTION public.export_orders_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],UUID[],TEXT,TEXT,TEXT,TEXT[],BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ai_schema(p_allowed_tables TEXT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_allowed_tables TEXT[] := ARRAY['orders', 'queue_orders'];
    v_requested_tables TEXT[];
BEGIN
    IF NOT public.has_permission_live('ai.chat') THEN
        RAISE EXCEPTION 'Permission denied: requires ai.chat';
    END IF;

    SELECT COALESCE(array_agg(t), ARRAY[]::TEXT[])
    INTO v_requested_tables
    FROM unnest(COALESCE(p_allowed_tables, v_allowed_tables)) AS t
    WHERE t = ANY(v_allowed_tables);

    RETURN COALESCE((
        SELECT jsonb_agg(t ORDER BY t->>'table')
        FROM (
            SELECT jsonb_build_object(
                'table', c.table_name,
                'columns', (
                    SELECT jsonb_agg(
                        jsonb_build_object('name', c2.column_name, 'type', c2.data_type)
                        ORDER BY c2.ordinal_position
                    )
                    FROM information_schema.columns c2
                    WHERE c2.table_schema = 'public'
                      AND c2.table_name = c.table_name
                      AND (
                          (c2.table_name = 'orders' AND c2.column_name = ANY(ARRAY[
                              'id','date','customer','product','category','start_time','end_time',
                              'code','status','channel','quantity','amount','region','payment',
                              'priority','created_at'
                          ]))
                          OR
                          (c2.table_name = 'queue_orders' AND c2.column_name = ANY(ARRAY[
                              'id','code','start_time','end_time','customer','status','channel',
                              'agent','priority','created_at'
                          ]))
                      )
                ),
                'relationships', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'column',            kcu.column_name,
                        'references_table',  ccu.table_name,
                        'references_column', ccu.column_name
                    ))
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                       AND tc.table_schema    = kcu.table_schema
                    JOIN information_schema.constraint_column_usage ccu
                        ON ccu.constraint_name = tc.constraint_name
                       AND ccu.table_schema    = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_schema    = 'public'
                      AND tc.table_name      = c.table_name
                      AND ccu.table_name     = ANY(v_allowed_tables)
                )
            ) AS t
            FROM (
                SELECT DISTINCT table_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = ANY(v_requested_tables)
            ) c
        ) sub
    ), '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_schema(TEXT[]) TO authenticated;

REVOKE ALL ON FUNCTION public.prune_order_change_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_orders_insert_event() FROM PUBLIC, anon, authenticated;
