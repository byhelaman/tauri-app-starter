-- ============================================================
-- 015: RPC get_orders_start_hours
-- ============================================================
-- Devuelve las horas de inicio (HH) distintas presentes en orders,
-- ordenadas. Usada por el filtro de Interval en la UI.

CREATE OR REPLACE FUNCTION public.get_orders_start_hours()
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('orders.view') THEN
        RAISE EXCEPTION 'Permission denied: requires orders.view';
    END IF;

    RETURN ARRAY(
        SELECT DISTINCT to_char(start_time, 'HH24')
        FROM public.orders
        ORDER BY 1
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_start_hours() TO authenticated;
