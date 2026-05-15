import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildAuthContext, type AuthContext, json } from "../_shared/admin-handler.ts"

// ─── Router ──────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const ctx = await buildAuthContext(req)
    if (ctx instanceof Response) return ctx

    const action = String(ctx.payload.action ?? "").trim()

    switch (action) {
        case "list":
            return handleList(ctx)
        case "update_role":
            return handleUpdateRole(ctx)
        case "update_display_name":
            return handleUpdateDisplayName(ctx)
        case "delete":
            return handleDelete(ctx)
        case "delete_own_account":
            return handleDeleteOwnAccount(ctx)
        default:
            return json(200, { success: false, message: `Unknown action: ${action}` }, ctx.origin)
    }
})

// ─── Helpers ─────────────────────────────────────────────────

/** Resolve a target user's profile and hierarchy level. */
async function resolveTarget(
    supabaseAdmin: SupabaseClient,
    targetUserId: string
): Promise<{ email: string; role: string; level: number } | null> {
    const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("email, role, roles!inner(hierarchy_level)")
        .eq("id", targetUserId)
        .single()

    if (error || !data) return null

    const roleRow = (data as { roles?: { hierarchy_level?: number } }).roles
    return {
        email: data.email as string,
        role: data.role as string,
        level: Number(roleRow?.hierarchy_level ?? 0),
    }
}

/** Write an audit entry via service_role (no auth.uid() needed). */
async function audit(
    supabaseAdmin: SupabaseClient,
    action: string,
    description: string,
    actorId: string,
    actorEmail: string,
    targetId: string | null,
    metadata: Record<string, unknown> = {}
) {
    await supabaseAdmin.rpc("log_audit_event_as_admin", {
        p_action: action,
        p_description: description,
        p_actor_id: actorId,
        p_actor_email: actorEmail,
        p_target_id: targetId,
        p_metadata: metadata,
    })
}

/** Notify a specific user via service_role. */
async function notifyUser(
    supabaseAdmin: SupabaseClient,
    userId: string,
    title: string,
    body: string,
    type = "info"
) {
    await supabaseAdmin
        .from("notifications")
        .insert({ user_id: userId, title, body, type })
}

/** Notify all admins (hierarchy >= 80 or system.view), excluding the actor. */
async function notifyAdmins(
    supabaseAdmin: SupabaseClient,
    excludeActorId: string,
    title: string,
    body: string,
    type = "info"
) {
    // Fetch admin user IDs (level >= 100 or with system.view permission)
    const { data: adminProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, role, roles!inner(hierarchy_level)")
        .neq("id", excludeActorId)

    if (!adminProfiles) return

    const adminIds: string[] = []
    for (const p of adminProfiles) {
        const roleRow = (p as { roles?: { hierarchy_level?: number } }).roles
        const level = Number(roleRow?.hierarchy_level ?? 0)
        if (level >= 80) adminIds.push(p.id as string)
    }

    // Also check role_permissions for system.view
    const { data: rpRows } = await supabaseAdmin
        .from("role_permissions")
        .select("role")
        .eq("permission", "system.view")

    if (rpRows) {
        const sysViewRoles = new Set(rpRows.map((r: { role: string }) => r.role))
        for (const p of adminProfiles) {
            if (sysViewRoles.has(p.role as string) && !adminIds.includes(p.id as string)) {
                adminIds.push(p.id as string)
            }
        }
    }

    if (adminIds.length === 0) return

    await supabaseAdmin.from("notifications").insert(
        adminIds.map((id) => ({ user_id: id, title, body, type }))
    )
}

// ─── Require helpers ─────────────────────────────────────────

async function requirePermission(ctx: AuthContext, permission: string): Promise<Response | null> {
    if (ctx.actorLevel >= 100) return null

    const { data, error } = await ctx.supabaseAdmin
        .from("role_permissions")
        .select("permission")
        .eq("role", ctx.actorRole)
        .eq("permission", permission)
        .maybeSingle()

    if (error) {
        console.error(`Could not resolve live permission ${permission}:`, error.message)
        return json(500, {
            success: false,
            message: "Could not resolve actor permissions",
        }, ctx.origin)
    }

    if (data) return null

    return json(403, {
        success: false,
        message: `Permission denied: requires ${permission}`,
    }, ctx.origin)
}

// ─── Action handlers ─────────────────────────────────────────

async function handleList(ctx: AuthContext): Promise<Response> {
    const err = await requirePermission(ctx, "users.view")
    if (err) return err

    const { supabaseAdmin, origin } = ctx

    // Fetch profiles and auth.users concurrently
    const [profilesRes, authListRes] = await Promise.all([
        supabaseAdmin
            .from("profiles")
            .select("id, email, display_name, role, created_at, roles!inner(hierarchy_level)")
            .order("created_at", { ascending: true }),
        // TODO: listUsers() sin argumentos devuelve 50 usuarios por defecto.
        // Si el workspace escala, el frontend DataTable saturará la memoria y la
        // red. En ese punto, refactorizar el UI y este endpoint para implementar 
        // Server-Side Pagination (pasar page/limit reales desde el cliente a Postgres y GoTrue).
        supabaseAdmin.auth.admin.listUsers()
    ])

    const { data: profiles, error: profilesError } = profilesRes
    if (profilesError) {
        return json(200, { success: false, message: "Could not fetch users" }, origin)
    }

    const authListData = authListRes.data
    const lastLoginMap: Record<string, string | null> = {}

    if (authListData?.users) {
        for (const au of authListData.users) {
            lastLoginMap[au.id] = au.last_sign_in_at ?? null
        }
    }

    const users = (profiles ?? []).map((p: Record<string, unknown>) => {
        const roleRow = (p as { roles?: { hierarchy_level?: number } }).roles
        return {
            id: p.id,
            email: p.email,
            display_name: p.display_name,
            role: p.role,
            hierarchy_level: Number(roleRow?.hierarchy_level ?? 0),
            created_at: p.created_at,
            last_login_at: lastLoginMap[p.id as string] ?? null,
        }
    })

    // Sort by hierarchy DESC, then created_at ASC
    users.sort((a, b) => {
        if (b.hierarchy_level !== a.hierarchy_level) return b.hierarchy_level - a.hierarchy_level
        return new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
    })

    return json(200, { success: true, data: users }, origin)
}

async function handleUpdateRole(ctx: AuthContext): Promise<Response> {
    const err = await requirePermission(ctx, "users.manage")
    if (err) return err

    const { supabaseAdmin, actorUserId, actorEmail, actorLevel, payload, origin } = ctx

    const targetUserId = String(payload.targetUserId ?? "").trim()
    const newRole = String(payload.newRole ?? "").trim()

    if (!targetUserId) return json(200, { success: false, message: "targetUserId is required" }, origin)
    if (!newRole) return json(200, { success: false, message: "newRole is required" }, origin)

    if (targetUserId === actorUserId) {
        return json(200, { success: false, message: "No puedes modificar tu propio rol" }, origin)
    }

    const target = await resolveTarget(supabaseAdmin, targetUserId)
    if (!target) return json(200, { success: false, message: "Usuario no encontrado" }, origin)
    if (target.level >= actorLevel) {
        return json(200, { success: false, message: "No puedes modificar un usuario con igual o mayor privilegio" }, origin)
    }

    // Validate the new role exists and is below actor level
    const { data: roleData } = await supabaseAdmin
        .from("roles")
        .select("hierarchy_level")
        .eq("name", newRole)
        .single()

    if (!roleData) return json(200, { success: false, message: `Rol inválido: ${newRole}` }, origin)
    if (Number(roleData.hierarchy_level) >= actorLevel) {
        return json(200, { success: false, message: "No puedes asignar un rol con igual o mayor nivel que el tuyo" }, origin)
    }

    const oldRole = target.role

    const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ role: newRole })
        .eq("id", targetUserId)

    if (updateError) return json(200, { success: false, message: "Could not update role" }, origin)

    // Audit + Notify
    await audit(supabaseAdmin, "role_change",
        `Changed ${target.email} role from ${oldRole} to ${newRole}`,
        actorUserId, actorEmail, targetUserId,
        { old_role: oldRole, new_role: newRole })

    await notifyUser(supabaseAdmin, targetUserId,
        "Role updated", `Your role has been changed to ${newRole}`)

    await notifyAdmins(supabaseAdmin, actorUserId,
        "Role change", `${target.email} role changed from ${oldRole} to ${newRole}`)

    return json(200, { success: true, user_id: targetUserId, new_role: newRole }, origin)
}

async function handleUpdateDisplayName(ctx: AuthContext): Promise<Response> {
    const err = await requirePermission(ctx, "users.manage")
    if (err) return err

    const { supabaseAdmin, actorUserId, actorEmail, actorLevel, payload, origin } = ctx

    const targetUserId = String(payload.targetUserId ?? "").trim()
    const newDisplayName = String(payload.newDisplayName ?? "").trim()

    if (!targetUserId) return json(200, { success: false, message: "targetUserId is required" }, origin)
    if (!newDisplayName) return json(200, { success: false, message: "newDisplayName is required" }, origin)

    if (targetUserId === actorUserId) {
        return json(200, { success: false, message: "Usa update_my_display_name para tu propia cuenta" }, origin)
    }

    const target = await resolveTarget(supabaseAdmin, targetUserId)
    if (!target) return json(200, { success: false, message: "Usuario no encontrado" }, origin)
    if (target.level >= actorLevel) {
        return json(200, { success: false, message: "No puedes modificar un usuario con igual o mayor privilegio" }, origin)
    }

    // Update profiles
    const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ display_name: newDisplayName })
        .eq("id", targetUserId)

    if (profileError) return json(200, { success: false, message: "Could not update display name" }, origin)

    // Sync to auth.users metadata
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        user_metadata: { display_name: newDisplayName },
    })

    if (authError) {
        console.error("Failed to sync display_name to auth.users:", authError.message)
    }

    // Audit
    await audit(supabaseAdmin, "display_name_change",
        `Changed display name for ${target.email} to "${newDisplayName}"`,
        actorUserId, actorEmail, targetUserId,
        { new_display_name: newDisplayName })

    return json(200, { success: true, user_id: targetUserId, new_display_name: newDisplayName }, origin)
}

async function handleDelete(ctx: AuthContext): Promise<Response> {
    const err = await requirePermission(ctx, "users.manage")
    if (err) return err

    const { supabaseAdmin, actorUserId, actorEmail, actorLevel, payload, origin } = ctx

    const targetUserId = String(payload.targetUserId ?? "").trim()
    if (!targetUserId) return json(200, { success: false, message: "targetUserId is required" }, origin)

    if (targetUserId === actorUserId) {
        return json(200, { success: false, message: "No puedes eliminar tu propia cuenta" }, origin)
    }

    const target = await resolveTarget(supabaseAdmin, targetUserId)
    if (!target) return json(200, { success: false, message: "Usuario no encontrado" }, origin)
    if (target.level >= 100) return json(200, { success: false, message: "No puedes eliminar a otro owner" }, origin)
    if (target.level >= actorLevel) {
        return json(200, { success: false, message: "No puedes eliminar un usuario con igual o mayor privilegio" }, origin)
    }

    // Audit + Notify BEFORE delete (cascade will remove profile)
    await audit(supabaseAdmin, "user_removed",
        `Removed user ${target.email}`,
        actorUserId, actorEmail, targetUserId,
        { email: target.email })

    await notifyAdmins(supabaseAdmin, actorUserId,
        "User removed", `${target.email} has been removed from the workspace`, "warning")

    // Delete via Admin API (cascades to profiles)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId)
    if (deleteError) {
        return json(200, { success: false, message: "Could not delete user" }, origin)
    }

    return json(200, { success: true, deleted_user_id: targetUserId }, origin)
}

async function handleDeleteOwnAccount(ctx: AuthContext): Promise<Response> {
    const { supabaseAdmin, actorUserId, actorEmail, actorRole, origin } = ctx

    // Check if sole owner
    if (actorRole === "owner") {
        const { count } = await supabaseAdmin
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "owner")

        if ((count ?? 0) <= 1) {
            return json(200, {
                success: false,
                message: "No puedes eliminar tu cuenta: eres el único owner del sistema",
            }, origin)
        }
    }

    // Audit + Notify BEFORE delete
    await audit(supabaseAdmin, "account_deleted",
        `User ${actorEmail} deleted their own account`,
        actorUserId, actorEmail, actorUserId)

    await notifyAdmins(supabaseAdmin, actorUserId,
        "Account deleted", `${actorEmail} has deleted their account`, "warning")

    // Delete via Admin API
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(actorUserId)
    if (deleteError) {
        return json(200, { success: false, message: "Could not delete account" }, origin)
    }

    return json(200, { success: true, message: "Account deleted" }, origin)
}
