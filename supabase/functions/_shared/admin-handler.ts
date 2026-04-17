import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export type JsonObject = Record<string, unknown>

const defaultAllowedOrigins = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://tauri.localhost",
    "tauri://localhost",
]

const configuredOrigins = (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin: string) => origin.trim())
    .filter((origin: string) => origin.length > 0)

const allowedOrigins = new Set(configuredOrigins.length > 0 ? configuredOrigins : defaultAllowedOrigins)

export function corsHeaders(origin: string | null): Record<string, string> {
    const headers: Record<string, string> = {
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    }

    if (origin) {
        headers["Access-Control-Allow-Origin"] = origin
        headers["Vary"] = "Origin"
    }

    return headers
}

export function securityHeaders(): Record<string, string> {
    return {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    }
}

export function json(status: number, body: JsonObject, origin: string | null): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders(origin),
            ...securityHeaders(),
            "Content-Type": "application/json",
        },
    })
}

export type AdminContext = {
    supabaseAdmin: SupabaseClient
    actorUserId: string
    actorEmail: string
    targetUserId: string
    actorLevel: number
    targetLevel: number
    payload: JsonObject
    origin: string | null
}

/**
 * Validates the incoming request and resolves actor/target permissions.
 * Returns an AdminContext on success, or a Response on any validation/auth failure.
 */
export async function buildAdminContext(req: Request): Promise<AdminContext | Response> {
    const origin = req.headers.get("Origin")

    if (origin && !allowedOrigins.has(origin)) {
        return json(403, { success: false, message: "Origin not allowed" }, null)
    }

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders(origin) })
    }

    if (req.method !== "POST") {
        return json(405, { success: false, message: "Method not allowed" }, origin)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !serviceRoleKey) {
        return json(500, { success: false, message: "Missing Supabase service configuration" }, origin)
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
        return json(401, { success: false, message: "Missing bearer token" }, origin)
    }

    const accessToken = authHeader.slice("Bearer ".length)

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })

    const {
        data: { user: actorUser },
        error: actorError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (actorError || !actorUser) {
        return json(401, { success: false, message: "Invalid session" }, origin)
    }

    let payload: JsonObject
    try {
        payload = (await req.json()) as JsonObject
    } catch {
        return json(400, { success: false, message: "Invalid JSON body" }, origin)
    }

    const targetUserId = String(payload.targetUserId ?? "").trim()
    if (!targetUserId) {
        return json(400, { success: false, message: "targetUserId is required" }, origin)
    }

    const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
        .from("profiles")
        .select("id, role, roles!inner(hierarchy_level)")
        .eq("id", actorUser.id)
        .single()

    if (actorProfileError || !actorProfile) {
        return json(403, { success: false, message: "Could not resolve actor profile" }, origin)
    }

    const actorRole = String(actorProfile.role)
    const actorRoleRow = (actorProfile as { roles?: { hierarchy_level?: number } }).roles
    const actorLevel = Number(actorRoleRow?.hierarchy_level ?? 0)

    const { data: permissionRows, error: permissionError } = await supabaseAdmin
        .from("role_permissions")
        .select("permission")
        .eq("role", actorRole)
        .eq("permission", "users.manage")

    if (permissionError) {
        return json(500, { success: false, message: "Could not resolve actor permissions" }, origin)
    }

    const hasManageUsers = actorLevel >= 100 || (permissionRows?.length ?? 0) > 0
    if (!hasManageUsers) {
        return json(403, { success: false, message: "Permission denied: requires users.manage" }, origin)
    }

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
        .from("profiles")
        .select("id, role, roles!inner(hierarchy_level)")
        .eq("id", targetUserId)
        .single()

    if (targetProfileError || !targetProfile) {
        return json(404, { success: false, message: "Target user not found" }, origin)
    }

    const targetRoleRow = (targetProfile as { roles?: { hierarchy_level?: number } }).roles
    const targetLevel = Number(targetRoleRow?.hierarchy_level ?? 0)

    if (targetLevel >= actorLevel) {
        return json(403, {
            success: false,
            message: "Permission denied: cannot perform action on equal/higher hierarchy user",
        }, origin)
    }

    return {
        supabaseAdmin,
        actorUserId: actorUser.id,
        actorEmail: actorUser.email ?? "",
        targetUserId,
        actorLevel,
        targetLevel,
        payload,
        origin,
    }
}
