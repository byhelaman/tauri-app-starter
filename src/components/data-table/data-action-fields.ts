const FIELD_EXPANSIONS: Record<string, string[]> = {
    time: ["start_time", "end_time"],
}

export function expandDataActionFields(fields: string[]): string[] {
    const expanded: string[] = []
    for (const field of fields) {
        for (const nextField of FIELD_EXPANSIONS[field] ?? [field]) {
            if (!expanded.includes(nextField)) expanded.push(nextField)
        }
    }
    return expanded
}

export function readRecordField(record: Record<string, unknown>, field: string): unknown {
    if (field in record) return record[field]
    if (field === "start_time" && "time" in record) return record.time
    if (field === "end_time" && "time" in record) return ""
    return undefined
}
