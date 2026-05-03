-- ============================================================
-- Rename permission helpers for clarity
-- ============================================================
-- New names:
--   has_claimed_permission() -> checks JWT claims
--   has_current_permission() -> checks current DB state
--
-- Old names remain as compatibility aliases.

CREATE OR REPLACE FUNCTION public.has_claimed_permission(required_permission text)
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
    IF NOT COALESCE(user_permissions ? required_permission, false) THEN
        RETURN false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid()
    ) THEN
        RETURN false;
    END IF;

    RETURN true;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'has_claimed_permission(%) failed unexpectedly: %', required_permission, SQLERRM;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_current_permission(required_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_level int;
BEGIN
    SELECT p.role, r.hierarchy_level
    INTO v_role, v_level
    FROM public.profiles p
    JOIN public.roles r ON r.name = p.role
    WHERE p.id = (SELECT auth.uid());

    IF v_role IS NULL THEN
        RETURN false;
    END IF;

    IF v_level >= 100 THEN
        RETURN EXISTS (
            SELECT 1
            FROM public.permissions p
            WHERE p.name = required_permission
        );
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        WHERE rp.role = v_role
          AND rp.permission = required_permission
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'has_current_permission(%) failed unexpectedly: %', required_permission, SQLERRM;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_claimed_permission(required_permission);
$$;

CREATE OR REPLACE FUNCTION public.has_permission_live(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_current_permission(required_permission);
$$;

GRANT EXECUTE ON FUNCTION public.has_claimed_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_current_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission_live(text) TO authenticated;
