-- Migration 004: sync profiles.email via trigger on auth.users
--
-- When auth.users.email changes (via admin API or any other path),
-- this trigger automatically keeps profiles.email in sync.
--
-- Audit logging is handled separately by admin_audit_email_change,
-- called from the edge function which has full actor context.

-- 1. Trigger: sync profiles.email whenever auth.users.email changes
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF OLD.email IS DISTINCT FROM NEW.email THEN
        UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_email_updated
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- 2. RPC: write audit entry for an admin email change
--    Called from the edge function which provides full actor context.
--    SECURITY DEFINER so it can call log_audit_event (restricted to postgres owner).
CREATE OR REPLACE FUNCTION public.admin_audit_email_change(
    p_target_user_id UUID,
    p_old_email      TEXT,
    p_new_email      TEXT,
    p_actor_id       UUID,
    p_actor_email    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM public.log_audit_event(
        'email_change',
        format('Email changed for user %s: %s → %s', p_target_user_id, p_old_email, p_new_email),
        p_actor_id,
        p_actor_email,
        p_target_user_id,
        jsonb_build_object('old_email', p_old_email, 'new_email', p_new_email)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_audit_email_change(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_audit_email_change(uuid, text, text, uuid, text) TO service_role;
