-- ============================================================
-- 006: AI Chat — permiso y get_ai_schema
-- ============================================================
-- Ejecutar después de `005_role_management_fixes.sql`.
--
-- Qué configura:
--   1. Permiso ai.chat
--   2. RPC get_ai_schema — devuelve esquema de tablas de usuario con FKs
--
-- Nota: las queries de datos se realizan directamente vía PostgREST
-- (cliente Supabase), no mediante SQL arbitrario. No se crea ningún
-- RPC de ejecución de consultas.

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

-- Devuelve columnas y relaciones FK de las tablas de usuario.
-- Excluye tablas de infraestructura RBAC para no exponer la
-- arquitectura de seguridad al modelo de IA.
CREATE OR REPLACE FUNCTION public.get_ai_schema()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    excluded_tables TEXT[] := ARRAY[
        'permissions', 'roles', 'role_permissions', 'audit_log'
    ];
BEGIN
    IF NOT public.has_permission('ai.chat') THEN
        RAISE EXCEPTION 'Permission denied: requires ai.chat';
    END IF;

    RETURN (
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
                )
            ) AS t
            FROM (
                SELECT DISTINCT table_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name != ALL(excluded_tables)
            ) c
        ) sub
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_schema() TO authenticated;
