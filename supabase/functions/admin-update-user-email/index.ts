import { buildAdminContext, json } from "../_shared/admin-handler.ts"

Deno.serve(async (req: Request) => {
    const ctx = await buildAdminContext(req)
    if (ctx instanceof Response) return ctx

    const { supabaseAdmin, actorUserId, actorEmail, targetUserId, payload, origin } = ctx

    const newEmail = String(payload.newEmail ?? "").trim().toLowerCase()

    if (!newEmail) {
        return json(400, { success: false, message: "newEmail is required" }, origin)
    }

    if (targetUserId === actorUserId) {
        return json(400, { success: false, message: "Use your account settings to change your own email" }, origin)
    }

    // Fetch current email before changing it (needed for audit log)
    const { data: targetUser, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(targetUserId)
    if (fetchError || !targetUser.user) {
        return json(404, { success: false, message: "Target user not found" }, origin)
    }
    const oldEmail = targetUser.user.email ?? ""

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        email: newEmail,
    })

    if (updateError) {
        return json(500, { success: false, message: `Email update failed: ${updateError.message}` }, origin)
    }

    // profiles.email is synced automatically by the on_auth_user_email_updated trigger.
    // This call only writes the audit entry with full actor context.
    const { error: auditError } = await supabaseAdmin.rpc("admin_audit_email_change", {
        p_target_user_id: targetUserId,
        p_old_email: oldEmail,
        p_new_email: newEmail,
        p_actor_id: actorUserId,
        p_actor_email: actorEmail,
    })

    if (auditError) {
        return json(500, { success: false, message: `Audit log failed: ${auditError.message}` }, origin)
    }

    return json(200, { success: true, message: "Email updated" }, origin)
})
