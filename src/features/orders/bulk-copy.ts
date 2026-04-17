import { z } from "zod"

export type BulkCopyFormat = "lines" | "csv" | "tsv" | "json" | "custom"

export interface BulkCopySettings {
    format: BulkCopyFormat
    headers: boolean
    template: string
    fields: string[]
}

// Esquema Zod para validar los ajustes leídos de localStorage en tiempo de ejecución.
const bulkCopySettingsSchema = z.object({
    format: z.enum(["lines", "csv", "tsv", "json", "custom"]).optional(),
    headers: z.boolean().optional(),
    template: z.string().optional(),
    fields: z.array(z.string()).optional(),
})

const BULK_COPY_SETTINGS_PREFIX = "bulk-copy-settings:"
export const BULK_COPY_DEFAULT_TEMPLATE = "{code} - {customer} - {amount}"

export function bulkCopySettingsKey(tableId: string): string {
    return `${BULK_COPY_SETTINGS_PREFIX}${tableId}`
}

export type BulkCopyToken =
    | { type: "text"; value: string }
    | { type: "field"; name: string; valid: boolean }

type Token = BulkCopyToken

function pushText(tokens: Token[], value: string) {
    const last = tokens[tokens.length - 1]
    if (last && last.type === "text") {
        last.value += value
        return
    }
    tokens.push({ type: "text", value })
}

export function parseBulkCopyTemplate(template: string, fieldSet: Set<string>): Token[] {
    const tokens: Token[] = []
    const re = /\{([a-zA-Z_][\w]*)\}|\\n|\\t|\\\\|\\\{|\\\}|[^\\{]+|\\|\{/g
    let match: RegExpExecArray | null

    while ((match = re.exec(template)) !== null) {
        const raw = match[0]
        if (match[1] !== undefined) {
            const name = match[1]
            tokens.push({ type: "field", name, valid: fieldSet.has(name) })
            continue
        }
        if (raw === "\\n") { pushText(tokens, "\n"); continue }
        if (raw === "\\t") { pushText(tokens, "\t"); continue }
        if (raw === "\\\\") { pushText(tokens, "\\"); continue }
        if (raw === "\\{") { pushText(tokens, "{"); continue }
        if (raw === "\\}") { pushText(tokens, "}"); continue }
        pushText(tokens, raw)
    }

    return tokens
}

export function csvEscape(value: string): string {
    return /[,"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function readBulkCopySettings(tableId: string): Partial<BulkCopySettings> | null {
    if (typeof window === "undefined") return null
    try {
        const raw = localStorage.getItem(bulkCopySettingsKey(tableId))
        if (!raw) return null
        const result = bulkCopySettingsSchema.safeParse(JSON.parse(raw))
        return result.success ? result.data : null
    } catch {
        return null
    }
}

export function buildBulkCopyText(records: Record<string, unknown>[], tableId: string): string {
    if (records.length === 0) return ""
    const settings = readBulkCopySettings(tableId) ?? {}
    const format: BulkCopyFormat =
        settings.format === "lines" || settings.format === "csv" ||
        settings.format === "tsv" || settings.format === "json" ||
        settings.format === "custom"
            ? settings.format
            : "lines"
    const headers = settings.headers ?? true
    const template = settings.template ?? BULK_COPY_DEFAULT_TEMPLATE
    const fieldSet = new Set(Object.keys(records[0] ?? {}))
    const fields = (settings.fields ?? Array.from(fieldSet).slice(0, 1))
        .filter((field) => fieldSet.has(field))
    const parsed = parseBulkCopyTemplate(template, fieldSet)

    if (format === "custom") {
        return records.map((record) => {
            let out = ""
            for (const token of parsed) {
                if (token.type === "text") { out += token.value; continue }
                if (!token.valid) { out += `{${token.name}}`; continue }
                const value = record[token.name]
                out += value == null ? "" : String(value)
            }
            return out
        }).join("\n")
    }

    if (fields.length === 0) return ""

    if (format === "json") {
        return JSON.stringify(
            records.map((record) => Object.fromEntries(fields.map((field) => [field, record[field]]))),
            null, 2,
        )
    }

    const separator = format === "csv" ? "," : format === "tsv" ? "\t" : " - "
    const lines = records.map((record) => fields.map((field) => {
        const value = record[field]
        const text = value == null ? "" : String(value)
        if (format === "csv") return csvEscape(text)
        if (format === "tsv") return text.replace(/\t/g, " ")
        return text
    }).join(separator))

    if ((format === "csv" || format === "tsv") && headers) {
        const headerLine = format === "csv"
            ? fields.map(csvEscape).join(",")
            : fields.join("\t")
        return [headerLine, ...lines].join("\n")
    }

    return lines.join("\n")
}
