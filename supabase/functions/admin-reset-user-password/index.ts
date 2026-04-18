import { buildAdminContext, json } from "../_shared/admin-handler.ts"

Deno.serve(async (req: Request) => {
    const ctx = await buildAdminContext(req)
    if (ctx instanceof Response) return ctx

    const { supabaseAdmin, actorUserId, targetUserId, payload, origin } = ctx

    const newPassword = String(payload.newPassword ?? "")

    if (!newPassword) {
        return json(400, { success: false, message: "newPassword is required" }, origin)
    }

    if (newPassword.length < 8) {
        return json(400, { success: false, message: "Password must be at least 8 characters" }, origin)
    }

    if (targetUserId === actorUserId) {
        return json(400, { success: false, message: "You cannot reset your own password from this action" }, origin)
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
        user_metadata: {
            admin_password_reset_at: new Date().toISOString(),
            admin_password_reset_by: actorUserId,
        },
    })

    if (updateError) {
        console.error("Password update failed:", updateError.message)
        return json(500, { success: false, message: "Could not reset password" }, origin)
    }

    // Best-effort: invalida todas las sesiones activas para que una cuenta comprometida quede bloqueada de inmediato.
    const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(targetUserId, "global")
    if (signOutError) {
        console.error("Session invalidation failed after password reset:", signOutError.message)
    }

    return json(200, { success: true, message: "Password reset completed" }, origin)
})
