-- ============================================================
-- ============================================================
-- 007: Orders — Schema, Triggers y RLS
-- ============================================================
-- Ejecutar después de 006_rate_limiting.sql.
--
-- Qué configura:
--   1. Permisos RBAC para orders (granulares: view/create/update/delete/bulk_delete/export/copy/trash)
--   2. Tablas: orders, orders_deleted, order_history
--   3. Triggers: updated_at, set_updated_by (para realtime skip-own)
--   4. RLS granular basada en has_current_permission()
--   5. Grants internos + realtime
--   6. Seed de 50 órdenes de ejemplo

-- ============================================================
-- 1. PERMISOS RBAC
-- ============================================================

INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('orders.view',        'Ver listado y detalle de órdenes',          10),
    ('orders.create',      'Crear órdenes',                             10),
    ('orders.update',      'Editar órdenes',                            10),
    ('orders.delete',      'Eliminar órdenes',                          80),
    ('orders.export',      'Exportar y copiar datos de órdenes',        80),
    ('orders.trash.view',  'Ver papelera de órdenes',                   80),
    ('orders.trash.empty', 'Vaciar papelera de órdenes',                100)
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, min_role_level = EXCLUDED.min_role_level;

-- Eliminar permisos granulares obsoletos (consolidados en orders.delete y orders.export).
-- Seguro de ejecutar múltiples veces; las FK en role_permissions se limpian en cascada.
DELETE FROM public.role_permissions WHERE permission IN ('orders.bulk_delete', 'orders.copy');
DELETE FROM public.permissions       WHERE name         IN ('orders.bulk_delete', 'orders.copy');

-- member puede ver/crear/editar; admin puede ejecutar acciones destructivas/export.
INSERT INTO public.role_permissions (role, permission) VALUES
    ('member', 'orders.view'),
    ('member', 'orders.create'),
    ('member', 'orders.update'),
    ('admin',  'orders.view'),
    ('admin',  'orders.create'),
    ('admin',  'orders.update'),
    ('admin',  'orders.delete'),
    ('admin',  'orders.export'),
    ('admin',  'orders.trash.view')
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
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC, id DESC);
CREATE INDEX idx_orders_date_created_at ON public.orders(date DESC, created_at DESC, id DESC);
CREATE INDEX idx_orders_status_created_at ON public.orders(status, created_at DESC, id DESC);
CREATE INDEX idx_orders_channel_created_at ON public.orders(channel, created_at DESC, id DESC);
CREATE INDEX idx_orders_start_hour_created_at
    ON public.orders ((EXTRACT(HOUR FROM start_time)::INT), created_at DESC, id DESC);
ALTER TABLE public.orders ADD CONSTRAINT orders_code_key UNIQUE (code);
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX idx_orders_customer_trgm ON public.orders USING gin (customer extensions.gin_trgm_ops);
CREATE INDEX idx_orders_code_trgm     ON public.orders USING gin (code extensions.gin_trgm_ops);
CREATE INDEX idx_orders_product_trgm  ON public.orders USING gin (product extensions.gin_trgm_ops);

CREATE TABLE public.orders_deleted (
    id          UUID        PRIMARY KEY,
    date        DATE        NOT NULL,
    customer    TEXT        NOT NULL,
    product     TEXT        NOT NULL,
    category    TEXT        NOT NULL,
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    code        TEXT        NOT NULL,
    status      TEXT        NOT NULL,
    channel     TEXT        NOT NULL,
    quantity    INTEGER     NOT NULL,
    amount      NUMERIC(10,2) NOT NULL,
    region      TEXT        NOT NULL,
    payment     TEXT        NOT NULL,
    priority    TEXT        NOT NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    deleted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_orders_deleted_deleted_at ON public.orders_deleted(deleted_at DESC, id DESC);
CREATE INDEX idx_orders_deleted_code ON public.orders_deleted(code);
CREATE INDEX idx_orders_deleted_customer_trgm ON public.orders_deleted USING gin (customer extensions.gin_trgm_ops);
CREATE INDEX idx_orders_deleted_code_trgm     ON public.orders_deleted USING gin (code extensions.gin_trgm_ops);
CREATE INDEX idx_orders_deleted_product_trgm  ON public.orders_deleted USING gin (product extensions.gin_trgm_ops);

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
    table_name  TEXT        NOT NULL CHECK (table_name IN ('orders','order_history')),
    action      TEXT        NOT NULL CHECK (action IN ('insert','update','delete','bulk')),
    actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    row_count   INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_change_events_created_at ON public.order_change_events(created_at DESC);

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

CREATE TRIGGER prune_order_change_events_after_insert
    AFTER INSERT ON public.order_change_events
    FOR EACH STATEMENT EXECUTE FUNCTION public.prune_order_change_events();

-- ============================================================
-- 3. TRIGGERS
-- ============================================================

-- updated_at
CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON public.orders
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
        
        IF v_details = '[]'::jsonb THEN
            RETURN NEW;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        v_email       := COALESCE(auth.jwt() ->> 'email', 'system');
        v_record_id   := OLD.id;
        v_record_code := OLD.code;
        v_action      := 'delete';
        v_desc        := 'Deleted order';
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

REVOKE EXECUTE ON FUNCTION public.orders_audit_trigger() FROM PUBLIC, anon, authenticated;

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

ALTER TABLE public.orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders_deleted ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_change_events ENABLE ROW LEVEL SECURITY;

-- orders: ver
CREATE POLICY "orders_select" ON public.orders
    FOR SELECT TO authenticated
    USING ((SELECT public.has_current_permission('orders.view')));

-- orders: crear
CREATE POLICY "orders_insert" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.has_current_permission('orders.create')));

-- orders: editar
CREATE POLICY "orders_update" ON public.orders
    FOR UPDATE TO authenticated
    USING  ((SELECT public.has_current_permission('orders.update')))
    WITH CHECK ((SELECT public.has_current_permission('orders.update')));

-- No hay DELETE directo: las operaciones destructivas deben pasar por RPCs
-- que mueven registros a orders_deleted, aplican permisos específicos y auditan.

-- order_history: solo lectura para manage; escribir vía SECURITY DEFINER RPCs
CREATE POLICY "order_history_select" ON public.order_history
    FOR SELECT TO authenticated
    USING ((SELECT public.has_current_permission('orders.view')));

-- Bloquear INSERT directo — solo las RPCs SECURITY DEFINER pueden escribir
CREATE POLICY "order_history_insert_deny" ON public.order_history
    FOR INSERT TO authenticated
    WITH CHECK (false);

-- order_change_events: lectura para usuarios que pueden ver orders. Escritura solo
-- desde triggers SECURITY DEFINER.
CREATE POLICY "order_change_events_select" ON public.order_change_events
    FOR SELECT TO authenticated
    USING ((SELECT public.has_current_permission('orders.view')));

CREATE POLICY "order_change_events_insert_deny" ON public.order_change_events
    FOR INSERT TO authenticated
    WITH CHECK (false);


-- ============================================================
-- 5. GRANTS INTERNOS
-- ============================================================

GRANT SELECT ON public.order_change_events TO authenticated;
REVOKE ALL ON public.orders_deleted FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_orders_insert_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_orders_update_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_orders_delete_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_order_change_events() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 6. REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_change_events;

-- ============================================================
-- 7. SEED — 50 órdenes de ejemplo
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
