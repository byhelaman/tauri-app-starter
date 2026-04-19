-- ============================================================
-- 008: Endurecer RLS en catálogos RBAC
-- ============================================================
-- Reemplaza las políticas SELECT permisivas (USING true) en
-- roles, permissions y role_permissions con políticas que
-- respeten el patrón "admin ve todo, otros sólo lo suyo",
-- ya aplicado en profiles y audit_log.
--
-- Compatibilidad verificada:
--   - El frontend NO hace SELECT directo a estas tablas:
--     todos los reads pasan por RPCs (get_all_roles,
--     get_all_permissions, get_role_permission_matrix) ya
--     gateados con is_system_admin() en migración 007.
--
--   - Las suscripciones realtime sobre role_permissions y roles
--     en src/contexts/auth-context.tsx filtran por
--     `role=eq.<mi_rol>` y `name=eq.<mi_rol>` — coincide con
--     la nueva política "fila propia OR admin".
--
--   - La suscripción realtime sobre `permissions` en
--     auth-context sólo se activa para owners (level >= 100),
--     cubierto por la condición admin.
--
--   - system-modal.tsx suscribe a las 5 tablas pero el modal
--     completo está gateado por canViewSystem (admin), por lo
--     que el JWT del cliente cumple la nueva política.

DROP POLICY IF EXISTS "roles_select"            ON public.roles;
DROP POLICY IF EXISTS "permissions_select"      ON public.permissions;
DROP POLICY IF EXISTS "role_permissions_select" ON public.role_permissions;

-- Cada usuario ve la fila de SU propio rol; admins (>= 80) ven todas.
-- La fila propia se necesita para el realtime sync de auth-context cuando
-- cambia hierarchy_level o description del rol del usuario.
CREATE POLICY "roles_select" ON public.roles
    FOR SELECT TO authenticated
    USING (
        name = (SELECT auth.jwt() ->> 'user_role')
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

-- Cada usuario ve sólo los permisos asignados a SU rol; admins ven todos.
-- La suscripción realtime sobre `permissions` en auth-context sólo se activa
-- para owners (level >= 100), cubierto por la rama admin.
CREATE POLICY "permissions_select" ON public.permissions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.role_permissions rp
            WHERE rp.permission = permissions.name
              AND rp.role = (SELECT auth.jwt() ->> 'user_role')
        )
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

-- Cada usuario ve los pares (role, permission) que afectan a SU rol;
-- admins ven todos. Necesario para que el cliente refresque su JWT
-- cuando cambian los permisos asignados a su propio rol.
CREATE POLICY "role_permissions_select" ON public.role_permissions
    FOR SELECT TO authenticated
    USING (
        role = (SELECT auth.jwt() ->> 'user_role')
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );
