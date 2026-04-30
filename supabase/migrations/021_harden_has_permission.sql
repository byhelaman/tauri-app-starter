-- ============================================================
-- 021: Hardening has_permission — verificación de perfil activo
-- ============================================================
-- has_permission() leía permisos solo del JWT claim 'permissions'.
-- Problema: tras un db reset, los JWTs anteriores siguen siendo
-- criptográficamente válidos y tienen permisos embebidos, permitiendo
-- que sesiones zombie operen sobre la DB aunque el usuario no exista.
--
-- Fix: verificar que el uid tenga un registro en profiles (tabla que
-- se borra en el reset). Si no existe → sin permisos, punto.
-- Esto bloquea cualquier mutación antes de llegar a las tablas de
-- auditoría, resolviendo los FK 23503 como efecto colateral.
--
-- Performance: profiles usa PK índice (id UUID), la query es O(1)
-- por PK. PostgreSQL puede cachear el resultado dentro de la misma
-- transacción. El overhead es mínimo vs. la ganancia de seguridad.

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
    -- 1. Verificación rápida en el JWT
    user_permissions := (auth.jwt() -> 'permissions')::jsonb;
    IF NOT COALESCE(user_permissions ? required_permission, false) THEN
        RETURN false;
    END IF;

    -- 2. Verificación de identidad real en la DB.
    --    Protege contra sesiones zombie (JWT válido pero usuario eliminado o
    --    DB reseteada). Si no existe un perfil activo, no hay permisos.
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid()
    ) THEN
        RETURN false;
    END IF;

    RETURN true;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'has_permission(%) falló inesperadamente: %', required_permission, SQLERRM;
    RETURN false;
END;
$$;
