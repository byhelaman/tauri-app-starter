-- ============================================================
-- 001: Foundation — RBAC, Profiles, JWT Hook
-- ============================================================
-- Run this first. No dependencies.
--
-- What this sets up:
--   1. Roles + Permissions + Role-Permission assignments (RBAC)
--   2. Profiles table linked to auth.users
--   3. Auth hook: injects role/permissions into JWT claims
--   4. RLS policies
--   5. Security triggers (prevent self-role-change, email edit)
--   6. User management RPCs
--
-- After running:
--   → In Supabase Dashboard: Authentication → Hooks
--     → "Customize Access Token (JWT) Claims"
--     → Schema: public | Function: custom_access_token_hook
--     → Save

-- ============================================================
-- 1. ROLES
-- ============================================================
CREATE TABLE public.roles (
    name            TEXT PRIMARY KEY,
    description     TEXT,
    hierarchy_level INT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Seed roles
-- Adjust hierarchy levels and add/remove roles to fit your app.
-- Rules:
--   super_admin (100) : full control, cannot be deleted
--   admin       (80)  : manage users and settings
--   member      (10)  : standard authenticated user
--   guest       (0)   : unverified / no data access (assigned on signup)
INSERT INTO public.roles (name, description, hierarchy_level) VALUES
    ('super_admin', 'Full system control',              100),
    ('admin',       'Manage users and settings',         80),
    ('member',      'Standard authenticated user',       10),
    ('guest',       'Unverified user, no data access',    0);

-- ============================================================
-- 2. PERMISSIONS
-- ============================================================
CREATE TABLE public.permissions (
    name            TEXT PRIMARY KEY,
    description     TEXT,
    min_role_level  INT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Seed permissions
-- Add your app-specific permissions here following the same pattern.
INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('profile.read',    'Read own profile',              10),
    ('profile.update',  'Update own profile',            10),
    ('users.view',      'View list of users',            80),
    ('users.manage',    'Create, edit, and delete users',80),
    ('system.view',     'View system settings',          80),
    ('system.manage',   'Modify system settings',       100);

-- ============================================================
-- 3. ROLE → PERMISSION ASSIGNMENTS
-- ============================================================
CREATE TABLE public.role_permissions (
    role        TEXT REFERENCES public.roles(name) ON DELETE CASCADE,
    permission  TEXT REFERENCES public.permissions(name) ON DELETE CASCADE,
    PRIMARY KEY (role, permission)
);

CREATE INDEX idx_role_permissions_role       ON public.role_permissions(role);
CREATE INDEX idx_role_permissions_permission ON public.role_permissions(permission);

INSERT INTO public.role_permissions (role, permission) VALUES
    -- member
    ('member',      'profile.read'),
    ('member',      'profile.update'),
    -- admin (inherits member perms manually for clarity)
    ('admin',       'profile.read'),
    ('admin',       'profile.update'),
    ('admin',       'users.view'),
    ('admin',       'users.manage'),
    ('admin',       'system.view'),
    -- super_admin gets all permissions dynamically via the JWT hook
    -- (no manual seeding required for super_admin)
    ('super_admin', 'profile.read'),
    ('super_admin', 'profile.update'),
    ('super_admin', 'users.view'),
    ('super_admin', 'users.manage'),
    ('super_admin', 'system.view'),
    ('super_admin', 'system.manage');

-- ============================================================
-- 4. PROFILES
-- ============================================================
CREATE TABLE public.profiles (
    id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email        TEXT        NOT NULL,
    display_name TEXT,
    role         TEXT        REFERENCES public.roles(name) DEFAULT 'guest' NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role  ON public.profiles(role);

-- ============================================================
-- 5. UTILITY FUNCTIONS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'guest'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 6. AUTH HOOK — Inject role + permissions into JWT
-- ============================================================
-- This runs on every token generation/refresh.
-- Custom claims added: user_role, hierarchy_level, permissions[]
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    claims             jsonb;
    user_role          text;
    user_hierarchy     int;
    user_permissions   text[];
BEGIN
    SELECT p.role, r.hierarchy_level
    INTO user_role, user_hierarchy
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = (event ->> 'user_id')::uuid;

    claims := event -> 'claims';

    IF user_role IS NOT NULL THEN
        -- super_admin gets all permissions automatically
        IF user_hierarchy >= 100 THEN
            SELECT array_agg(p.name)
            INTO user_permissions
            FROM public.permissions p;
        ELSE
            SELECT array_agg(rp.permission)
            INTO user_permissions
            FROM public.role_permissions rp
            WHERE rp.role = user_role;
        END IF;

        claims := jsonb_set(claims, '{user_role}',      to_jsonb(user_role));
        claims := jsonb_set(claims, '{hierarchy_level}',to_jsonb(user_hierarchy));
        claims := jsonb_set(claims, '{permissions}',    to_jsonb(COALESCE(user_permissions, ARRAY[]::text[])));
    ELSE
        -- Fallback for users without a profile yet
        claims := jsonb_set(claims, '{user_role}',       '"guest"');
        claims := jsonb_set(claims, '{hierarchy_level}', '0');
        claims := jsonb_set(claims, '{permissions}',     '[]');
    END IF;

    event := jsonb_set(event, '{claims}', claims);
    RETURN event;
END;
$$;

-- Grant hook access to Supabase auth system
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT SELECT ON TABLE public.profiles        TO supabase_auth_admin;
GRANT SELECT ON TABLE public.roles           TO supabase_auth_admin;
GRANT SELECT ON TABLE public.role_permissions TO supabase_auth_admin;

-- ============================================================
-- 7. UTILITY RPCs
-- ============================================================

-- Check permission from JWT (use in RLS or other RPCs)
CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN (auth.jwt() -> 'permissions') ? required_permission;
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- Get own profile (reads from DB, not JWT)
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT json_build_object(
        'id',              p.id,
        'email',           p.email,
        'display_name',    p.display_name,
        'role',            p.role,
        'hierarchy_level', r.hierarchy_level,
        'permissions', (
            SELECT COALESCE(json_agg(perm.name), '[]'::json)
            FROM public.permissions perm
            WHERE perm.min_role_level <= r.hierarchy_level
        )
    )
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = (SELECT auth.uid());
$$;

-- Update own display_name
CREATE OR REPLACE FUNCTION public.update_my_display_name(new_display_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.profiles SET display_name = new_display_name WHERE id = auth.uid();
END;
$$;

-- Check if email already exists (useful for signup UX)
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE email = p_email);
$$;

-- ============================================================
-- 8. ADMIN RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
    id               UUID,
    email            TEXT,
    display_name     TEXT,
    role             TEXT,
    hierarchy_level  INT,
    created_at       TIMESTAMPTZ,
    last_login_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('users.view') THEN
        RAISE EXCEPTION 'Permission denied: requires users.view';
    END IF;

    RETURN QUERY
    SELECT p.id, p.email, p.display_name, p.role, r.hierarchy_level,
           p.created_at, au.last_sign_in_at
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    LEFT JOIN auth.users au ON au.id = p.id
    ORDER BY r.hierarchy_level DESC, p.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id UUID, new_role TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id           uuid;
    caller_level        int;
    target_level        int;
    new_role_level      int;
BEGIN
    caller_id    := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Cannot modify your own role';
    END IF;

    SELECT r.hierarchy_level INTO target_level
    FROM public.profiles p JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_level IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
    IF target_level >= caller_level THEN
        RAISE EXCEPTION 'Cannot modify user with equal or higher privileges';
    END IF;

    SELECT hierarchy_level INTO new_role_level FROM public.roles WHERE name = new_role;
    IF new_role_level IS NULL THEN RAISE EXCEPTION 'Invalid role: %', new_role; END IF;
    IF new_role_level >= caller_level THEN
        RAISE EXCEPTION 'Cannot assign role with equal or higher level than yours';
    END IF;

    UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_role', new_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id    uuid;
    caller_level int;
    target_level int;
BEGIN
    caller_id    := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Cannot delete your own account';
    END IF;

    SELECT r.hierarchy_level INTO target_level
    FROM public.profiles p JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_level IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
    IF target_level >= 100 THEN RAISE EXCEPTION 'Cannot delete another super_admin'; END IF;
    IF target_level >= caller_level THEN
        RAISE EXCEPTION 'Cannot delete user with equal or higher privileges';
    END IF;

    DELETE FROM auth.users WHERE id = target_user_id;
    RETURN json_build_object('success', true, 'deleted_user_id', target_user_id);
END;
$$;

-- Delete own account
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
    IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    DELETE FROM auth.users WHERE id = _uid;
END;
$$;

-- ============================================================
-- 9. RLS POLICIES
-- ============================================================
ALTER TABLE public.roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read roles/permissions (needed for UI)
CREATE POLICY "roles_select" ON public.roles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "permissions_select" ON public.permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "role_permissions_select" ON public.role_permissions
    FOR SELECT TO authenticated USING (true);

-- Profiles: own row OR admin (level >= 80)
CREATE POLICY "profiles_select" ON public.profiles
    FOR SELECT USING (
        id = (SELECT auth.uid())
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

CREATE POLICY "profiles_insert" ON public.profiles
    FOR INSERT WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "profiles_update" ON public.profiles
    FOR UPDATE USING (
        id = (SELECT auth.uid())
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

-- Only super_admin can delete profiles (cascades from auth.users delete)
CREATE POLICY "profiles_delete" ON public.profiles
    FOR DELETE USING (
        COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 100
    );

-- ============================================================
-- 10. SECURITY TRIGGERS
-- ============================================================

-- Prevent changing email via direct UPDATE
CREATE OR REPLACE FUNCTION public.prevent_email_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    IF OLD.email IS DISTINCT FROM NEW.email THEN
        RAISE EXCEPTION 'Email modification is not allowed via direct update';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER check_email_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_email_modification();

-- Prevent self-role-change and enforce hierarchy rules
CREATE OR REPLACE FUNCTION public.prevent_role_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level        int;
    caller_id           uuid;
    target_current_level int;
    new_role_level      int;
BEGIN
    caller_id    := auth.uid();
    IF caller_id IS NULL THEN RETURN NEW; END IF;

    caller_level := COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0);

    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF OLD.id = caller_id THEN
            RAISE EXCEPTION 'Cannot modify your own role';
        END IF;
        IF caller_level < 80 THEN
            RAISE EXCEPTION 'Cannot change role without admin privileges';
        END IF;

        SELECT r.hierarchy_level INTO target_current_level
        FROM public.roles r WHERE r.name = OLD.role;

        IF target_current_level >= caller_level THEN
            RAISE EXCEPTION 'Cannot modify user with equal or higher privileges';
        END IF;

        SELECT r.hierarchy_level INTO new_role_level
        FROM public.roles r WHERE r.name = NEW.role;

        IF new_role_level >= caller_level THEN
            RAISE EXCEPTION 'Cannot assign role with equal or higher level than yours';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER check_role_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_update();

-- ============================================================
-- 11. GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.has_permission(text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_display_name(text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_users()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user(uuid)                TO authenticated;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_own_account()             TO authenticated;

-- ============================================================
-- MANUAL STEP REQUIRED
-- ============================================================
-- In Supabase Dashboard → Authentication → Hooks:
--   "Customize Access Token (JWT) Claims"
--   Schema: public
--   Function: custom_access_token_hook
--   → Save
