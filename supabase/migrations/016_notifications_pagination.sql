-- ============================================================
-- 016: Añadir p_offset a get_my_notifications
-- ============================================================
-- La UI ahora usa useInfiniteQuery con páginas de 20 items.
-- La RPC necesita p_offset para soportar paginación.

CREATE OR REPLACE FUNCTION public.get_my_notifications(
    p_limit  INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id         BIGINT,
    title      TEXT,
    body       TEXT,
    type       TEXT,
    read       BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT n.id, n.title, n.body, n.type, n.read, n.created_at
    FROM public.notifications n
    WHERE n.user_id = auth.uid()
    ORDER BY n.created_at DESC
    LIMIT  GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

-- Actualizar grants para nueva firma (INT, INT)
REVOKE ALL ON FUNCTION public.get_my_notifications(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(int, int) TO authenticated;
