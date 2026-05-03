-- ============================================================
-- 005: AI Chat — permiso y get_ai_schema
-- ============================================================
-- Ejecutar después de `004_admin_sync_email.sql`.
--
-- Qué configura:
--   1. Permiso ai.chat
--   2. RPC get_ai_schema — devuelve esquema de tablas de usuario con FKs
--
-- Nota: el chat debe usar herramientas/RPCs allowlist. No se habilita SQL libre.

-- ============================================================
-- 1. PERMISO
-- ============================================================

INSERT INTO public.permissions (name, description, min_role_level)
VALUES ('ai.chat', 'Access to AI chat for querying data', 10)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
VALUES
    ('member', 'ai.chat'),
    ('admin',  'ai.chat')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. ESQUEMA
-- ============================================================

-- Devuelve solo el esquema aprobado para herramientas de IA.
-- Por defecto usa allowlist estricta; no expone metadata de RBAC,
-- perfiles, auditoría, notificaciones ni tablas internas.
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
    IF NOT public.has_current_permission('ai.chat') THEN
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
                    -- Relaciones FK para que el modelo pueda hacer joins con select anidado
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

-- ============================================================
-- 3. EXECUTE QUERY DESHABILITADO
-- ============================================================

-- Mantener esta firma bloqueada evita que clientes antiguos o maliciosos
-- puedan usar SQL arbitrario desde el chat.
CREATE OR REPLACE FUNCTION public.execute_ai_query(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'execute_ai_query is disabled. Use allowlisted AI tools/RPCs.';
END;
$$;

REVOKE ALL ON FUNCTION public.execute_ai_query(text) FROM PUBLIC, anon, authenticated;
