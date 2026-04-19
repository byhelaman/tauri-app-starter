import { buildActorContext, json } from "../_shared/admin-handler.ts"

Deno.serve(async (req: Request) => {
    const ctx = await buildActorContext(req)
    if (ctx instanceof Response) return ctx

    const { supabaseAdmin, actorUserId, actorEmail, payload, origin } = ctx

    const email = String(payload.email ?? "").trim().toLowerCase()
    const name  = String(payload.displayName ?? "").trim()
    const role  = String(payload.role ?? "guest").trim()

    if (!email) {
        return json(400, { success: false, message: "email is required" }, origin)
    }

    const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { display_name: name || email.split("@")[0] },
    })

    if (inviteError) {
        console.error("Invite failed:", inviteError.message)
        return json(500, { success: false, message: "Could not send invitation" }, origin)
    }

    const invitedUserId = data.user.id

    if (role !== "guest") {
        const { error: roleError } = await supabaseAdmin.rpc("set_new_user_role", {
            target_user_id: invitedUserId,
            target_role: role,
        })

        if (roleError) {
            console.error("Role assignment failed:", roleError.message)
            const { error: rollbackError } = await supabaseAdmin.rpc("delete_user", {
                target_user_id: invitedUserId,
            })

            if (rollbackError) {
                console.error("Rollback failed after role assignment error:", rollbackError.message)
                return json(500, {
                    success: false,
                    message: "Could not assign role, and rollback failed. Please remove the invited user manually.",
                }, origin)
            }

            return json(500, { success: false, message: "Could not assign role - invitation cancelled" }, origin)
        }
    }

    await supabaseAdmin.rpc("log_audit_event_as_admin", {
        p_action: "user_invited",
        p_description: `User ${email} invited with role ${role}`,
        p_actor_id: actorUserId,
        p_actor_email: actorEmail,
        p_target_id: invitedUserId,
        p_metadata: { email, role },
    })

    return json(200, { success: true, message: "Invitation sent" }, origin)
})
