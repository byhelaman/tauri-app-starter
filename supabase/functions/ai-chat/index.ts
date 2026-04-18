import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders, json } from "../_shared/admin-handler.ts"

const VERCEL_AI_GATEWAY = "https://ai-gateway.vercel.sh/v1"

// Operadores permitidos para filtros — se mapean directamente a métodos del cliente Supabase
const ALLOWED_FILTER_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"])

const TOOLS = [
    {
        type: "function",
        function: {
            name: "get_schema",
            description: "Returns the schema of all available tables including columns and foreign key relationships. Call this before querying if you are unsure of the structure.",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    {
        type: "function",
        function: {
            name: "query_table",
            description: `Queries a table via the Supabase REST API. Supports column selection, filters, ordering, and pagination.
For related data use dot notation in select, e.g. "id,name,orders(id,total)".
Always include a limit. Maximum allowed is 200.`,
            parameters: {
                type: "object",
                properties: {
                    table: { type: "string", description: "Table name to query" },
                    select: {
                        type: "string",
                        description: "Comma-separated columns. Use table(col1,col2) for related data. Defaults to *.",
                        default: "*",
                    },
                    filters: {
                        type: "array",
                        description: "Filters to apply",
                        items: {
                            type: "object",
                            properties: {
                                column: { type: "string" },
                                op: { type: "string", enum: [...ALLOWED_FILTER_OPS] },
                                value: { description: "Filter value. Use array for 'in'." },
                            },
                            required: ["column", "op", "value"],
                        },
                    },
                    order: {
                        type: "string",
                        description: "Order by column: 'column_name:asc' or 'column_name:desc'",
                    },
                    limit: {
                        type: "integer",
                        description: "Max rows to return (1–200). Defaults to 50.",
                        default: 50,
                    },
                },
                required: ["table"],
            },
        },
    },
]

const SYSTEM_PROMPT = `You are a data assistant connected to a PostgreSQL database via Supabase REST API.
You have tools to inspect the schema and query tables. Never fabricate data.
To query related data, use nested select notation: "id,name,orders(id,total)".
Always set a reasonable limit. Use filters to narrow results before returning data.
Always respond in the user's language. Format tabular results as markdown tables.`

type ChatMessage = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }

type FilterArg = { column: string; op: string; value: unknown }
type QueryTableArgs = {
    table: string
    select?: string
    filters?: FilterArg[]
    order?: string
    limit?: number
}

Deno.serve(async (req: Request) => {
    const origin = req.headers.get("Origin")

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders(origin) })
    }

    if (req.method !== "POST") {
        return json(405, { success: false, message: "Method not allowed" }, origin)
    }

    // Validar JWT del usuario
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
        return json(401, { success: false, message: "Missing bearer token" }, origin)
    }
    const userToken = authHeader.slice("Bearer ".length)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
        return json(500, { success: false, message: "Server misconfigured" }, origin)
    }

    // Validar token con cliente admin
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(userToken)
    if (authError || !user) {
        return json(401, { success: false, message: "Invalid session" }, origin)
    }

    // Parsear y validar body
    let body: { messages?: unknown; apiKey?: string; model?: string }
    try {
        body = await req.json()
    } catch {
        return json(400, { success: false, message: "Invalid JSON body" }, origin)
    }

    const { messages, apiKey, model } = body

    if (typeof apiKey !== "string" || apiKey.trim().length < 8 || apiKey.length > 512) {
        return json(400, { success: false, message: "Invalid apiKey" }, origin)
    }
    if (typeof model !== "string" || model.trim().length === 0 || model.length > 128) {
        return json(400, { success: false, message: "Invalid model" }, origin)
    }
    if (!Array.isArray(messages)) {
        return json(400, { success: false, message: "messages must be an array" }, origin)
    }
    if (messages.length > 100) {
        return json(400, { success: false, message: "Too many messages (max 100)" }, origin)
    }

    // Validar estructura de cada mensaje — solo roles user/assistant con contenido string
    const validRoles = new Set(["user", "assistant"])
    for (const msg of messages) {
        if (
            typeof msg !== "object" || msg === null ||
            !validRoles.has((msg as Record<string, unknown>).role as string) ||
            typeof (msg as Record<string, unknown>).content !== "string"
        ) {
            return json(400, { success: false, message: "Invalid message format" }, origin)
        }
    }

    // Cliente con JWT del usuario para que RLS se aplique en todas las queries
    const supabaseUser = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${userToken}` } },
    })

    // Verificar permiso ai.chat antes de proceder
    const { data: hasPerm, error: permError } = await supabaseUser.rpc("has_permission", {
        required_permission: "ai.chat",
    })
    if (permError || !hasPerm) {
        return json(403, { success: false, message: "Permission denied: requires ai.chat" }, origin)
    }

    // Loop agéntico: llama al modelo, ejecuta herramientas, repite hasta respuesta final
    const chatMessages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(messages as ChatMessage[]),
    ]

    const MAX_ITERATIONS = 6
    let finalResponse: string | null = null

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const aiRes = await fetch(`${VERCEL_AI_GATEWAY}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: chatMessages,
                tools: TOOLS,
                tool_choice: "auto",
            }),
        })

        if (!aiRes.ok) {
            const errText = await aiRes.text()
            console.error("AI Gateway error:", errText)
            return json(502, { success: false, message: "AI service error" }, origin)
        }

        const aiData = await aiRes.json() as { choices?: Array<{ message: ChatMessage; finish_reason: string }> }
        const choice = aiData.choices?.[0]
        if (!choice) {
            return json(502, { success: false, message: "Empty response from AI service" }, origin)
        }

        const assistantMessage = choice.message
        chatMessages.push(assistantMessage)

        // Sin tool calls — respuesta final del modelo
        if (!assistantMessage.tool_calls?.length) {
            finalResponse = assistantMessage.content ?? ""
            break
        }

        // Ejecutar cada tool call y añadir resultados al contexto
        for (const toolCall of assistantMessage.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>) {
            const fnName = toolCall.function.name
            let toolResult: unknown

            try {
                const args = JSON.parse(toolCall.function.arguments ?? "{}")

                if (fnName === "get_schema") {
                    const { data, error } = await supabaseUser.rpc("get_ai_schema")
                    toolResult = error ? { error: error.message } : data

                } else if (fnName === "query_table") {
                    const { table, select = "*", filters = [], order, limit = 50 } = args as QueryTableArgs

                    // Limitar filas para evitar payloads masivos
                    const safeLimit = Math.min(Math.max(1, limit ?? 50), 200)

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let q: any = supabaseUser.from(table).select(select).limit(safeLimit)

                    for (const f of filters) {
                        if (!ALLOWED_FILTER_OPS.has(f.op)) continue
                        q = q[f.op](f.column, f.value)
                    }

                    if (order) {
                        const [col, dir] = order.split(":")
                        q = q.order(col, { ascending: dir !== "desc" })
                    }

                    const { data, error } = await q
                    toolResult = error ? { error: error.message } : data

                } else {
                    toolResult = { error: "Unknown tool" }
                }
            } catch (err) {
                toolResult = { error: String(err) }
            }

            chatMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(toolResult),
            })
        }
    }

    if (finalResponse === null) {
        return json(500, { success: false, message: "No response generated" }, origin)
    }

    return json(200, { success: true, message: finalResponse }, origin)
})
