-- ============================================================
-- 023: Security fix — bulk_delete_orders_by_filter permission
-- ============================================================
-- La función bulk_delete_orders_by_filter requería 'orders.view'
-- en vez de 'orders.manage' — cualquier usuario con permiso de
-- lectura podía eliminar masivamente. Se corrige a 'orders.manage'.

CREATE OR REPLACE FUNCTION public.bulk_delete_orders_by_filter(
    p_search       TEXT    DEFAULT '',
    p_status       TEXT[]  DEFAULT NULL,
    p_channel      TEXT[]  DEFAULT NULL,
    p_date         TEXT    DEFAULT NULL,
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
BEGIN
    -- ✅ Corregido: era 'orders.view', ahora exige 'orders.manage'
    IF NOT public.has_permission('orders.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.manage';
    END IF;

    DELETE FROM public.orders o
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
        AND (array_length(p_excluded_ids, 1) IS NULL OR o.id != ALL(p_excluded_ids));

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
