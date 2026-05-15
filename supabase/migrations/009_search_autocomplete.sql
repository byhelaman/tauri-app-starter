-- ============================================================
-- 009: Search Autocomplete — RPC para sugerencias de búsqueda
-- ============================================================
-- Ejecutar después de 008_orders_rpcs.sql.
--
-- Aprovecha los índices GIN trigram existentes en:
--   - orders.code     (idx_orders_code_trgm)
--   - orders.customer (idx_orders_customer_trgm)
--   - orders.product  (idx_orders_product_trgm)

CREATE OR REPLACE FUNCTION public.search_orders_autocomplete(query_text TEXT)
RETURNS TABLE (
    value TEXT,
    label TEXT,
    type  TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    -- Unión de coincidencias por cada columna indexada, con LIMIT individual
    -- para que Postgres pueda usar los índices GIN y cortar temprano.
    (
        SELECT DISTINCT ON (o.code)
            o.code AS value,
            o.code AS label,
            'Code' AS type
        FROM public.orders o
        WHERE o.code ILIKE query_text || '%'
        ORDER BY o.code
        LIMIT 3
    )
    UNION ALL
    (
        SELECT DISTINCT ON (o.customer)
            o.customer AS value,
            o.customer AS label,
            'Customer' AS type
        FROM public.orders o
        WHERE o.customer ILIKE '%' || query_text || '%'
        ORDER BY o.customer
        LIMIT 3
    )
    UNION ALL
    (
        SELECT DISTINCT ON (o.product)
            o.product AS value,
            o.product AS label,
            'Product' AS type
        FROM public.orders o
        WHERE o.product ILIKE '%' || query_text || '%'
        ORDER BY o.product
        LIMIT 3
    )
    LIMIT 7;
$$;

-- Permiso: solo usuarios autenticados con orders.view pueden llamar esto.
-- RLS en la tabla orders ya filtra los resultados, y SECURITY INVOKER
-- garantiza que se respeten las políticas del llamador.
REVOKE ALL ON FUNCTION public.search_orders_autocomplete(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_orders_autocomplete(TEXT) TO authenticated;
