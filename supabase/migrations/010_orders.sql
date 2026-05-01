-- ============================================================
-- 010: Orders, Queue Orders y Order History
-- ============================================================
-- Ejecutar después de 009_rate_limiting.sql.
--
-- Qué configura:
--   1. Permisos RBAC para orders (orders.view / orders.manage / orders.export)
--   2. Tablas: orders, queue_orders, order_history
--   3. Triggers: updated_at, set_updated_by (para realtime skip-own)
--   4. RLS granular basada en has_permission_live()
--   5. RPCs: get_orders, get_queue_orders, get_orders_stats, get_order_history
--   6. Realtime agregado vía order_change_events
--   7. Seed de 50 órdenes de ejemplo

-- ============================================================
-- 1. PERMISOS RBAC
-- ============================================================

INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('orders.view',   'Ver listado y detalle de órdenes',             10),
    ('orders.manage', 'Crear, editar y eliminar órdenes',             10),
    ('orders.export', 'Exportar datos de órdenes',                    10)
ON CONFLICT (name) DO NOTHING;

-- member puede ver y gestionar órdenes
INSERT INTO public.role_permissions (role, permission) VALUES
    ('member', 'orders.view'),
    ('member', 'orders.manage'),
    ('admin',  'orders.view'),
    ('admin',  'orders.manage'),
    ('admin',  'orders.export')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. TABLAS
-- ============================================================

CREATE TABLE public.orders (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    date        DATE        NOT NULL DEFAULT CURRENT_DATE,
    customer    TEXT        NOT NULL CHECK (char_length(trim(customer)) > 0),
    product     TEXT        NOT NULL CHECK (char_length(trim(product))  > 0),
    category    TEXT        NOT NULL CHECK (char_length(trim(category)) > 0),
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    code        TEXT        NOT NULL CHECK (code ~ '^ORD-[A-Z0-9]{5,6}$'),
    status      TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
    channel     TEXT        NOT NULL
                            CHECK (channel IN ('Online','Retail','Partner','Phone')),
    quantity    INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
    amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    region      TEXT        NOT NULL CHECK (char_length(trim(region))  > 0),
    payment     TEXT        NOT NULL CHECK (char_length(trim(payment)) > 0),
    priority    TEXT        NOT NULL DEFAULT 'Low'
                            CHECK (priority IN ('High','Medium','Low')),
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_orders_status     ON public.orders(status);
CREATE INDEX idx_orders_channel    ON public.orders(channel);
CREATE INDEX idx_orders_date       ON public.orders(date DESC);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE UNIQUE INDEX orders_code_active_key ON public.orders(code) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_search     ON public.orders USING gin(
    to_tsvector('simple', coalesce(customer,'') || ' ' || coalesce(code,'') || ' ' || coalesce(product,''))
);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE public.queue_orders (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT        NOT NULL,
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    customer    TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','processing','ready','delivered')),
    channel     TEXT        NOT NULL
                            CHECK (channel IN ('Online','Retail','Partner','Phone')),
    agent       TEXT        NOT NULL DEFAULT '',
    priority    BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_queue_status     ON public.queue_orders(status);
CREATE INDEX idx_queue_created_at ON public.queue_orders(created_at DESC);
CREATE INDEX idx_queue_code       ON public.queue_orders(code);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE public.order_history (
    id          BIGSERIAL   PRIMARY KEY,
    action      TEXT        NOT NULL CHECK (action IN ('create','update','delete')),
    description TEXT        NOT NULL,
    actor_email TEXT        NOT NULL,
    order_id    UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
    details     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_history_order_id   ON public.order_history(order_id);
CREATE INDEX idx_order_history_created_at ON public.order_history(created_at DESC);

-- Evento compacto para Realtime. Evita emitir una notificación por fila cuando
-- hay cargas masivas; los clientes refetchean una vez por sentencia SQL.
CREATE TABLE public.order_change_events (
    id          BIGSERIAL   PRIMARY KEY,
    table_name  TEXT        NOT NULL CHECK (table_name IN ('orders','queue_orders','order_history')),
    action      TEXT        NOT NULL CHECK (action IN ('insert','update','delete','bulk')),
    actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    row_count   INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_change_events_created_at ON public.order_change_events(created_at DESC);

-- ============================================================
-- 3. TRIGGERS
-- ============================================================

-- updated_at
CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER queue_orders_updated_at
    BEFORE UPDATE ON public.queue_orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- set_updated_by — para que realtime pueda filtrar cambios propios
CREATE OR REPLACE FUNCTION public.set_updated_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_by = auth.uid();
    RETURN NEW;
END;
$$;

CREATE TRIGGER orders_set_updated_by
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();

-- orders_audit_trigger
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
    -- Evitar logging individual si estamos en una operación de borrado masivo
    IF current_setting('app.bulk_op', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Los inserts se auditan por sentencia en record_orders_insert_event().
        -- Esto evita 500k filas de auditoría para cargas masivas SQL.
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        v_email       := COALESCE(auth.jwt() ->> 'email', 'system');
        v_record_id   := NEW.id;
        v_record_code := NEW.code;
        v_action   := 'update';
        v_desc     := 'Order updated';
        v_order_id := NEW.id;
        
        -- Detectar si es un soft delete (deleted_at pasó de NULL a algo)
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
        v_email       := COALESCE(auth.jwt() ->> 'email', 'system');
        v_record_id   := OLD.id;
        v_record_code := OLD.code;
        v_action      := 'delete';
        v_desc        := 'Deleted order ' || OLD.code;
        v_order_id    := NULL;
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

CREATE TRIGGER on_order_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_audit_trigger();

CREATE OR REPLACE FUNCTION public.sync_queue_orders_for_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        DELETE FROM public.queue_orders WHERE code = NEW.code;
    ELSIF OLD.code IS DISTINCT FROM NEW.code AND NEW.deleted_at IS NULL THEN
        UPDATE public.queue_orders SET code = NEW.code WHERE code = OLD.code;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_order_sync_queue
    AFTER UPDATE OF code, deleted_at ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.sync_queue_orders_for_order_change();

-- Realtime agregado por sentencia: una carga SQL de 500k filas produce un solo
-- evento en order_change_events, no 500k eventos en el WebSocket.
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

CREATE TRIGGER orders_insert_realtime_event
    AFTER INSERT ON public.orders
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION public.record_orders_insert_event();

CREATE TRIGGER orders_update_realtime_event
    AFTER UPDATE ON public.orders
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION public.record_orders_update_event();

CREATE TRIGGER orders_delete_realtime_event
    AFTER DELETE ON public.orders
    REFERENCING OLD TABLE AS old_rows
    FOR EACH STATEMENT EXECUTE FUNCTION public.record_orders_delete_event();

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE public.orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_change_events ENABLE ROW LEVEL SECURITY;

-- orders: ver
CREATE POLICY "orders_select" ON public.orders
    FOR SELECT TO authenticated
    USING (public.has_permission_live('orders.view') AND deleted_at IS NULL);

-- orders: crear
CREATE POLICY "orders_insert" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission_live('orders.manage'));

-- orders: editar
CREATE POLICY "orders_update" ON public.orders
    FOR UPDATE TO authenticated
    USING  (public.has_permission_live('orders.manage'))
    WITH CHECK (public.has_permission_live('orders.manage'));

-- orders: eliminar — requiere manage; solo owners pueden bulk-delete
CREATE POLICY "orders_delete" ON public.orders
    FOR DELETE TO authenticated
    USING (public.has_permission_live('orders.manage'));

-- queue_orders
CREATE POLICY "queue_select" ON public.queue_orders
    FOR SELECT TO authenticated
    USING (public.has_permission_live('orders.view'));

CREATE POLICY "queue_insert" ON public.queue_orders
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission_live('orders.manage'));

CREATE POLICY "queue_update" ON public.queue_orders
    FOR UPDATE TO authenticated
    USING  (public.has_permission_live('orders.manage'))
    WITH CHECK (public.has_permission_live('orders.manage'));

CREATE POLICY "queue_delete" ON public.queue_orders
    FOR DELETE TO authenticated
    USING (public.has_permission_live('orders.manage'));

-- order_history: solo lectura para manage; escribir vía SECURITY DEFINER RPCs
CREATE POLICY "order_history_select" ON public.order_history
    FOR SELECT TO authenticated
    USING (public.has_permission_live('orders.view'));

-- Bloquear INSERT directo — solo las RPCs SECURITY DEFINER pueden escribir
CREATE POLICY "order_history_insert_deny" ON public.order_history
    FOR INSERT TO authenticated
    WITH CHECK (false);

-- order_change_events: lectura para usuarios que pueden ver orders. Escritura solo
-- desde triggers SECURITY DEFINER.
CREATE POLICY "order_change_events_select" ON public.order_change_events
    FOR SELECT TO authenticated
    USING (public.has_permission_live('orders.view'));

CREATE POLICY "order_change_events_insert_deny" ON public.order_change_events
    FOR INSERT TO authenticated
    WITH CHECK (false);

-- ============================================================
-- 5. RPCs
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
    IF NOT public.has_permission_live('orders.view') THEN
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
    IF NOT public.has_permission_live('orders.view') THEN
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
    IF NOT public.has_permission_live('orders.view') THEN
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

-- ──────────────────────────────────────────────────────────────

-- get_order_ids_by_filter
-- Retorna SOLO un arreglo de UUIDs para selecciones masivas ultra-rápidas
CREATE OR REPLACE FUNCTION public.get_order_ids_by_filter(
    p_search       TEXT    DEFAULT '',
    p_status       TEXT[]  DEFAULT NULL,
    p_channel      TEXT[]  DEFAULT NULL,
    p_date         DATE    DEFAULT NULL,
    p_start_hour   TEXT[]  DEFAULT NULL,
    p_limit        INT     DEFAULT 10000,
    p_offset       INT     DEFAULT 0
)
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_hours INT[] := NULL;
    v_ids UUID[];
    v_limit INT;
    v_offset INT;
BEGIN
    IF NOT public.has_permission_live('orders.view') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 10000), 1), 10000);
    v_offset := GREATEST(COALESCE(p_offset, 0), 0);

    IF p_start_hour IS NOT NULL AND array_length(p_start_hour, 1) > 0 THEN
        SELECT array_agg(x::INT) INTO v_hours
        FROM unnest(p_start_hour) AS x
        WHERE x ~ '^\d+$';
    END IF;

    SELECT array_agg(id) INTO v_ids
    FROM (
        SELECT o.id
        FROM public.orders o
        WHERE o.deleted_at IS NULL
            AND (p_search = '' OR p_search IS NULL OR (
                o.customer ILIKE '%' || p_search || '%' OR
                o.code     ILIKE '%' || p_search || '%' OR
                o.product  ILIKE '%' || p_search || '%'
            ))
            AND (p_status IS NULL OR array_length(p_status, 1) IS NULL OR o.status  = ANY(p_status))
            AND (p_channel IS NULL OR array_length(p_channel, 1) IS NULL OR o.channel = ANY(p_channel))
            AND (p_date IS NULL OR o.date = p_date)
            AND (v_hours IS NULL OR array_length(v_hours, 1) IS NULL
                OR EXTRACT(HOUR FROM o.start_time)::INT = ANY(v_hours))
        ORDER BY o.created_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) limited;

    RETURN COALESCE(v_ids, ARRAY[]::UUID[]);
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

-- ──────────────────────────────────────────────────────────────

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
    IF NOT public.has_permission_live('orders.export') THEN
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

-- ============================================================
-- 6. GRANTS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_orders(INT,INT,TEXT,TEXT[],TEXT[],DATE,TEXT[],TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_queue_orders()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_stats()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_history(INT,INT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_start_hours()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],UUID[],TEXT,TEXT,INT,INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_ids_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],INT,INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_orders_by_filter(TEXT,TEXT[],TEXT[],DATE,TEXT[],UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_by_ids(UUID[])                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_orders_by_ids(UUID[])          TO authenticated;
GRANT SELECT ON public.order_change_events TO authenticated;
-- record_order_history: solo callable desde otras funciones SECURITY DEFINER
REVOKE ALL ON FUNCTION public.record_order_history(TEXT,TEXT,UUID,JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_orders_insert_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_orders_update_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_orders_delete_event() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 7. REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_change_events;

-- ============================================================
-- 8. SEED — 50 órdenes de ejemplo
-- (eliminar bloque en producción)
-- ============================================================

DO $$
DECLARE
    customers  TEXT[] := ARRAY['Acme Corp','Globex Inc','Initech','Umbrella Co','Stark Industries',
                               'Wayne Enterprises','Hooli','Soylent Corp','Cyberdyne Systems','Oscorp',
                               'Tyrell Corp','Pied Piper','Aperture Science','Black Mesa','Dunder Mifflin'];
    products   TEXT[] := ARRAY['Pro Plan License','Mechanical Keyboard','Onboarding Consultation',
                               'Annual Support Plan','4K Monitor 27"','Analytics Add-on',
                               'Team Plan License','API Rate Tier','Storage Upgrade',
                               'Enterprise Plan License','USB-C Docking Station',
                               'Cloud Backup Tier','Noise-Cancelling Headset','Data Migration Service'];
    categories TEXT[] := ARRAY['Software','Hardware','Services','Subscription'];
    channels   TEXT[] := ARRAY['Online','Retail','Partner','Phone'];
    statuses   TEXT[] := ARRAY['pending','processing','shipped','delivered','cancelled'];
    regions    TEXT[] := ARRAY['North America','Europe','Asia Pacific','LATAM','EMEA'];
    payments   TEXT[] := ARRAY['Credit Card','PayPal','Bank Transfer','Crypto'];
    priorities TEXT[] := ARRAY['High','Medium','Low'];
    i          INT;
    v_hr       INT;
    v_min      INT;
    v_code     TEXT;
BEGIN
    FOR i IN 1..50 LOOP
        v_hr  := 8 + (random() * 9)::INT;
        v_min := (random() * 5)::INT * 10;
        v_code := 'ORD-' || upper(substring(md5(random()::TEXT) FROM 1 FOR 5));

        INSERT INTO public.orders (
            date, customer, product, category,
            start_time, end_time, code,
            status, channel, quantity, amount,
            region, payment, priority
        ) VALUES (
            CURRENT_DATE - (random() * 30)::INT,
            customers[1 + (random() * (array_length(customers,1)-1))::INT],
            products  [1 + (random() * (array_length(products,  1)-1))::INT],
            categories[1 + (random() * (array_length(categories,1)-1))::INT],
            make_time(v_hr,   v_min, 0),
            make_time(v_hr+1, v_min, 0),
            v_code,
            statuses  [1 + (random() * (array_length(statuses,  1)-1))::INT],
            channels  [1 + (random() * (array_length(channels,  1)-1))::INT],
            1 + (random() * 19)::INT,
            (50 + random() * 4950)::NUMERIC(10,2),
            regions   [1 + (random() * (array_length(regions,   1)-1))::INT],
            payments  [1 + (random() * (array_length(payments,  1)-1))::INT],
            priorities[1 + (random() * (array_length(priorities,1)-1))::INT]
        )
        ON CONFLICT (code) WHERE deleted_at IS NULL DO NOTHING;
    END LOOP;
END;
$$;
