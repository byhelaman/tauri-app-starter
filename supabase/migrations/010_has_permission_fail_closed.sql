-- ============================================================
-- 010: has_permission fail-closed
-- ============================================================
-- Bug original (001_foundation.sql:216):
--   `(auth.jwt() -> 'permissions')::jsonb ? required_permission`
--   devuelve NULL si la clave 'permissions' no existe en el JWT
--   (p.ej. custom_access_token_hook desactivado o drift de claims).
--   Como el operador `?` con operando NULL retorna NULL — no excepción —
--   el EXCEPTION WHEN OTHERS no lo captura y la función devuelve NULL.
--   Los callers `IF NOT has_permission(...)` evalúan `NOT NULL` → falso →
--   no entran al bloque → NO bloquean: fail-OPEN.
--
-- Fix: COALESCE explícito a false. Defensa correcta en boundary.

CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_permissions jsonb;
BEGIN
    user_permissions := (auth.jwt() -> 'permissions')::jsonb;
    -- COALESCE: si la clave no existe o el operador devuelve NULL, fail-closed.
    RETURN COALESCE(user_permissions ? required_permission, false);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'has_permission(%) falló inesperadamente: %', required_permission, SQLERRM;
    RETURN false;
END;
$$;
