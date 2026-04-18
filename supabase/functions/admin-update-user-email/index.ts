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

    // Obtiene el usuario para leer el email anterior y verificar que no tenga invite pendiente.
    const { data: targetUser, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(targetUserId)
    if (fetchError || !targetUser.user) {
        return json(404, { success: false, message: "Target user not found" }, origin)
    }

    if (!targetUser.user.last_sign_in_at) {
        return json(400, { success: false, message: "Cannot change email while invitation is pending" }, origin)
    }

    const oldEmail = targetUser.user.email ?? ""

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        email: newEmail,
    })

    if (updateError) {
        console.error("Email update failed:", updateError.message)
        return json(500, { success: false, message: "Could not update email" }, origin)
    }

    // profiles.email se sincroniza automáticamente via el trigger on_auth_user_email_updated.
    // Esta llamada solo escribe la entrada de auditoría con el contexto completo del actor.
    const { error: auditError } = await supabaseAdmin.rpc("admin_audit_email_change", {
        p_target_user_id: targetUserId,
        p_old_email: oldEmail,
        p_new_email: newEmail,
        p_actor_id: actorUserId,
        p_actor_email: actorEmail,
    })

    if (auditError) {
        console.error("Audit log failed after email update:", auditError.message)
    }

    return json(200, { success: true, message: "Email updated" }, origin)
})
