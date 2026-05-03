-- ============================================================
-- Fix get_order_history pagination variables
-- ============================================================

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

GRANT EXECUTE ON FUNCTION public.get_order_history(INT,INT) TO authenticated;
