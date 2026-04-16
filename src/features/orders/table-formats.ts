import type { Row, Column, Table } from "@tanstack/react-table"

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

function cellValue<T>(row: Row<T>, column: Column<T, unknown>): string {
  const v = row.getValue(column.id)
  return v == null ? "" : String(v)
}

function csvEscape(s: string): string {
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function formatRows<T>(
  table: Table<T>,
  rows: Row<T>[],
  format: CopyFormat,
  includeHeaders = true,
): string {
  const columns = getExportColumns(table)
  const headers = columns.map((c) => c.id)

  switch (format) {
    case "csv": {
      const lines = rows.map((r) => columns.map((c) => csvEscape(cellValue(r, c))).join(","))
      return includeHeaders
        ? [headers.map(csvEscape).join(","), ...lines].join("\n")
        : lines.join("\n")
    }
    case "tsv": {
      const lines = rows.map((r) =>
        columns.map((c) => cellValue(r, c).replace(/\t/g, " ")).join("\t"),
      )
      return includeHeaders ? [headers.join("\t"), ...lines].join("\n") : lines.join("\n")
    }
    case "json": {
      const data = rows.map((r) => {
        const o: Record<string, unknown> = {}
        columns.forEach((c) => { o[c.id] = r.getValue(c.id) })
        return o
      })
      return JSON.stringify(data, null, 2)
    }
    case "md": {
      const body = rows.map(
        (r) => `| ${columns.map((c) => cellValue(r, c).replace(/\|/g, "\\|")).join(" | ")} |`,
      )
      if (!includeHeaders) return body.join("\n")
      const head = `| ${headers.join(" | ")} |`
      const sep = `| ${headers.map(() => "---").join(" | ")} |`
      return [head, sep, ...body].join("\n")
    }
  }
}
