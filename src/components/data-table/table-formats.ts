import type { Row, Column, Table } from "@tanstack/react-table"
import { expandDataActionFields, readRecordField } from "./data-action-fields"

export type ExportFormat = "csv" | "tsv" | "json" | "md"
export type CopyFormat = ExportFormat
export type Scope = "selected" | "filtered" | "all"

export const FORMAT_META: Record<CopyFormat, { label: string; ext: string; mime: string }> = {
  csv: { label: "CSV", ext: "csv", mime: "text/csv" },
  tsv: { label: "TSV", ext: "tsv", mime: "text/tab-separated-values" },
  json: { label: "JSON", ext: "json", mime: "application/json" },
  md: { label: "Markdown", ext: "md", mime: "text/markdown" },
}

export function getScopeRows<T>(table: Table<T>, scope: Scope): Row<T>[] {
  if (scope === "selected") return table.getSelectedRowModel().rows
  if (scope === "filtered") return table.getFilteredRowModel().rows
  return table.getCoreRowModel().rows
}

export function getExportColumns<T>(table: Table<T>): Column<T, unknown>[] {
  return table.getVisibleFlatColumns().filter((c) => c.id !== "select" && c.id !== "actions")
}

export function getExportFieldIds<T>(table: Table<T>): string[] {
  return expandDataActionFields(getExportColumns(table).map((column) => column.id))
}

function rowRecord<T>(row: Row<T>): Record<string, unknown> {
  return typeof row.original === "object" && row.original !== null
    ? row.original as Record<string, unknown>
    : {}
}

function cellValue<T>(row: Row<T>, field: string): string {
  const record = rowRecord(row)
  const v = readRecordField(record, field)
  return v == null ? "" : String(v)
}

export function csvEscape(s: string): string {
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function formatRows<T>(
  table: Table<T>,
  rows: Row<T>[],
  format: CopyFormat,
  includeHeaders = true,
): string {
  const fields = getExportFieldIds(table)
  const headers = fields

  switch (format) {
    case "csv": {
      const lines = rows.map((r) => fields.map((field) => csvEscape(cellValue(r, field))).join(","))
      return includeHeaders
        ? [headers.map(csvEscape).join(","), ...lines].join("\n")
        : lines.join("\n")
    }
    case "tsv": {
      const lines = rows.map((r) =>
        fields.map((field) => cellValue(r, field).replace(/\t/g, " ")).join("\t"),
      )
      return includeHeaders ? [headers.join("\t"), ...lines].join("\n") : lines.join("\n")
    }
    case "json": {
      const data = rows.map((r) => {
        const o: Record<string, unknown> = {}
        fields.forEach((field) => { o[field] = readRecordField(rowRecord(r), field) })
        return o
      })
      return JSON.stringify(data, null, 2)
    }
    case "md": {
      const body = rows.map(
        (r) => `| ${fields.map((field) => cellValue(r, field).replace(/\|/g, "\\|")).join(" | ")} |`,
      )
      if (!includeHeaders) return body.join("\n")
      const head = `| ${headers.join(" | ")} |`
      const sep = `| ${headers.map(() => "---").join(" | ")} |`
      return [head, sep, ...body].join("\n")
    }
  }
}

/**
 * Formatea registros crudos del servidor (sin Row<T> de TanStack).
 * Usa los column IDs visibles de la tabla para mantener la misma estructura.
 */
export function formatRawRows<T>(
  table: Table<T>,
  records: Record<string, unknown>[],
  format: CopyFormat,
  includeHeaders = true,
): string {
  const fields = getExportFieldIds(table)
  const headers = fields
  const raw = (record: Record<string, unknown>, colId: string): string => {
    const v = readRecordField(record, colId)
    return v == null ? "" : String(v)
  }

  switch (format) {
    case "csv": {
      const lines = records.map((r) => fields.map((field) => csvEscape(raw(r, field))).join(","))
      return includeHeaders
        ? [headers.map(csvEscape).join(","), ...lines].join("\n")
        : lines.join("\n")
    }
    case "tsv": {
      const lines = records.map((r) =>
        fields.map((field) => raw(r, field).replace(/\t/g, " ")).join("\t"),
      )
      return includeHeaders ? [headers.join("\t"), ...lines].join("\n") : lines.join("\n")
    }
    case "json": {
      const data = records.map((r) => {
        const o: Record<string, unknown> = {}
        fields.forEach((field) => { o[field] = readRecordField(r, field) })
        return o
      })
      return JSON.stringify(data, null, 2)
    }
    case "md": {
      const body = records.map(
        (r) => `| ${fields.map((field) => raw(r, field).replace(/\|/g, "\\|")).join(" | ")} |`,
      )
      if (!includeHeaders) return body.join("\n")
      const head = `| ${headers.join(" | ")} |`
      const sep = `| ${headers.map(() => "---").join(" | ")} |`
      return [head, sep, ...body].join("\n")
    }
  }
}
