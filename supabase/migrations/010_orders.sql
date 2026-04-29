-- ============================================================
-- 010: Orders, Queue Orders y Order History
-- ============================================================
-- Ejecutar después de 009_rate_limiting.sql.
--
-- Qué configura:
--   1. Permisos RBAC para orders (orders.view / orders.manage / orders.export)
--   2. Tablas: orders, queue_orders, order_history
--   3. Triggers: updated_at, set_updated_by (para realtime skip-own)
--   4. RLS granular basada en has_permission()
--   5. RPCs: get_orders, get_queue_orders, get_orders_stats, get_order_history
--   6. Realtime habilitado en orders y queue_orders
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
    ('member', 'orders.export'),
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
    code        TEXT        NOT NULL UNIQUE CHECK (code ~ '^ORD-[A-Z0-9]{5,6}$'),
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
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_status     ON public.orders(status);
CREATE INDEX idx_orders_channel    ON public.orders(channel);
CREATE INDEX idx_orders_date       ON public.orders(date DESC);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_orders_search     ON public.orders USING gin(
    to_tsvector('simple', coalesce(customer,'') || ' ' || coalesce(code,'') || ' ' || coalesce(product,''))
);

-- ──────────────────────────────────────────────────────────────

CREATE TABLE public.queue_orders (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT        NOT NULL REFERENCES public.orders(code) ON DELETE CASCADE,
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

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE public.orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

-- orders: ver
CREATE POLICY "orders_select" ON public.orders
    FOR SELECT TO authenticated
    USING (public.has_permission('orders.view'));

-- orders: crear
CREATE POLICY "orders_insert" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission('orders.manage'));

-- orders: editar
CREATE POLICY "orders_update" ON public.orders
    FOR UPDATE TO authenticated
    USING  (public.has_permission('orders.manage'))
    WITH CHECK (public.has_permission('orders.manage'));

-- orders: eliminar — requiere manage; solo owners pueden bulk-delete
CREATE POLICY "orders_delete" ON public.orders
    FOR DELETE TO authenticated
    USING (public.has_permission('orders.manage'));

-- queue_orders
CREATE POLICY "queue_select" ON public.queue_orders
    FOR SELECT TO authenticated
    USING (public.has_permission('orders.view'));

CREATE POLICY "queue_insert" ON public.queue_orders
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission('orders.manage'));

CREATE POLICY "queue_update" ON public.queue_orders
    FOR UPDATE TO authenticated
    USING  (public.has_permission('orders.manage'))
    WITH CHECK (public.has_permission('orders.manage'));

CREATE POLICY "queue_delete" ON public.queue_orders
    FOR DELETE TO authenticated
    USING (public.has_permission('orders.manage'));

-- order_history: solo lectura para manage; escribir vía SECURITY DEFINER RPCs
CREATE POLICY "order_history_select" ON public.order_history
    FOR SELECT TO authenticated
    USING (public.has_permission('orders.view'));

-- Bloquear INSERT directo — solo las RPCs SECURITY DEFINER pueden escribir
CREATE POLICY "order_history_insert_deny" ON public.order_history
    FOR INSERT TO authenticated
    WITH CHECK (false);

-- ============================================================
-- 5. RPCs
-- ============================================================

-- get_orders — paginación server-side con filtros
CREATE OR REPLACE FUNCTION public.get_orders(
    p_limit   INT     DEFAULT 25,
    p_offset  INT     DEFAULT 0,
    p_search  TEXT    DEFAULT '',
    p_status  TEXT    DEFAULT NULL,
    p_channel TEXT    DEFAULT NULL,
    p_date    TEXT    DEFAULT NULL   -- 'YYYY-MM-DD'
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
            o.start_time::TEXT,
            o.end_time::TEXT,
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

-- get_queue_orders
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
                SELECT id, start_time::TEXT, end_time::TEXT, code,
                       customer, status, channel, agent, priority, created_at
                FROM public.queue_orders
                ORDER BY created_at DESC
            ) r
        ), '[]'::JSON),
        'total', (SELECT COUNT(*) FROM public.queue_orders)
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────

-- get_orders_stats — para useOrdersStats (dashboard)
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
    IF NOT public.has_permission('orders.view') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_total, v_revenue
    FROM public.orders;

    SELECT json_object_agg(status, cnt) INTO v_by_status
    FROM (SELECT status, COUNT(*) AS cnt FROM public.orders GROUP BY status) s;

    SELECT json_object_agg(channel, cnt) INTO v_by_channel
    FROM (SELECT channel, COUNT(*) AS cnt FROM public.orders GROUP BY channel) c;

    RETURN json_build_object(
        'total',      v_total,
        'revenue',    v_revenue,
        'by_status',  COALESCE(v_by_status,  '{}'::JSON),
        'by_channel', COALESCE(v_by_channel, '{}'::JSON)
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────

-- get_order_history — paginado
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
    IF NOT public.has_permission('orders.view') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    RETURN COALESCE((
        SELECT json_agg(row_to_json(r) ORDER BY r.created_at DESC)
        FROM (
            SELECT id, action, description, actor_email,
                   order_id, details, created_at
            FROM public.order_history
            ORDER BY created_at DESC
            LIMIT p_limit OFFSET p_offset
        ) r
    ), '[]'::JSON);
END;
$$;

-- ──────────────────────────────────────────────────────────────

-- record_order_history — llamado desde las RPCs de mutación
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

-- ============================================================
-- 6. GRANTS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_orders(INT,INT,TEXT,TEXT,TEXT,TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_queue_orders()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_stats()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_history(INT,INT)                 TO authenticated;
-- record_order_history: solo callable desde otras funciones SECURITY DEFINER
REVOKE ALL ON FUNCTION public.record_order_history(TEXT,TEXT,UUID,JSONB) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 7. REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_orders;

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
        ON CONFLICT (code) DO NOTHING;
    END LOOP;
END;
$$;

-- ============================================================
-- FIN: ejecuta después de habilitar Realtime en el dashboard
--   Database → Replication → Source → orders ✓  queue_orders ✓
-- ============================================================
