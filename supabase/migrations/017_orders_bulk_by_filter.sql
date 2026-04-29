-- ============================================================
-- 017: Bulk delete orders por filtro (para infinite scroll select-all)
-- ============================================================
-- Permite eliminar TODAS las órdenes que coinciden con los filtros
-- activos sin necesidad de cargar los IDs en el cliente.

CREATE OR REPLACE FUNCTION public.bulk_delete_orders_by_filter(
    p_search     TEXT    DEFAULT '',
    p_status     TEXT    DEFAULT NULL,
    p_channel    TEXT    DEFAULT NULL,
    p_date       TEXT    DEFAULT NULL,
    p_start_hour TEXT    DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
BEGIN
    IF NOT public.has_permission('orders.view') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    DELETE FROM public.orders o
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

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_delete_orders_by_filter(TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
