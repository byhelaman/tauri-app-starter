import type { Table } from "@tanstack/react-table"
import type { DataTableMeta, InfiniteScrollConfig } from "../core/data-table-types"
import { buildServerDataActionRequest } from "./data-actions"
import {
  FORMAT_META,
  formatRows,
  getScopeRows,
  type CopyFormat,
  type ExportFormat,
  type Scope,
} from "./table-formats"

export interface DataActionNotifier {
  loading: (message: string, id: string) => void
  success: (message: string, id?: string) => void
  error: (message: string, id?: string) => void
  dismiss: (id: string) => void
}

interface SharedDataActionInput<TData> {
  table: Table<TData>
  tableId: string
  tableMeta?: DataTableMeta
  infiniteScroll?: InfiniteScrollConfig
  effectiveScope: Scope
  selectedIds: string[]
  scopeCount: number
  notifier: DataActionNotifier
}

export interface ExportActionInput<TData> extends SharedDataActionInput<TData> {
  format: ExportFormat
  saveFile: (content: string, filename: string, mime: string, ext: string) => Promise<boolean>
}

export interface CopyActionInput<TData> extends SharedDataActionInput<TData> {
  format: CopyFormat
  writeClipboard: (content: string) => Promise<void>
}

export async function executeExportAction<TData>({
  table,
  tableId,
  tableMeta,
  infiniteScroll,
  effectiveScope,
  selectedIds,
  scopeCount,
  notifier,
  format,
  saveFile,
}: ExportActionInput<TData>) {
  const meta = FORMAT_META[format]
  const serverRequest = buildServerDataActionRequest({
    table,
    tableMeta,
    infiniteScroll,
    effectiveScope,
    selectedIds,
    purpose: "export",
    format,
  })

  if (serverRequest && infiniteScroll?.exportByScope) {
    const toastId = "export-scope"
    notifier.loading(`Generating ${scopeCount.toLocaleString()} rows...`, toastId)
    try {
      const result = await infiniteScroll.exportByScope(serverRequest)
      const saved = await saveFile(result.content, `${tableId}-${effectiveScope}.${meta.ext}`, meta.mime, meta.ext)
      if (saved) notifier.success(`Exported ${result.rowCount.toLocaleString()} rows as ${meta.label}`, toastId)
      else notifier.dismiss(toastId)
    } catch (error) {
      notifier.error(error instanceof Error ? error.message : "Failed to export rows", toastId)
    }
    return
  }

  const rows = getScopeRows(table, effectiveScope)
  const content = formatRows(table, rows, format, true)
  const saved = await saveFile(content, `${tableId}-${effectiveScope}.${meta.ext}`, meta.mime, meta.ext)
  if (saved) notifier.success(`Exported ${rows.length} rows as ${meta.label}`)
}

export async function executeCopyAction<TData>({
  table,
  tableMeta,
  infiniteScroll,
  effectiveScope,
  selectedIds,
  scopeCount,
  notifier,
  format,
  writeClipboard,
}: CopyActionInput<TData>) {
  const serverRequest = buildServerDataActionRequest({
    table,
    tableMeta,
    infiniteScroll,
    effectiveScope,
    selectedIds,
    purpose: "copy",
    format,
  })

  if (serverRequest && infiniteScroll?.exportByScope) {
    const toastId = "copy-scope"
    notifier.loading(`Generating ${scopeCount.toLocaleString()} rows...`, toastId)
    try {
      const result = await infiniteScroll.exportByScope(serverRequest)
      await writeClipboard(result.content)
      notifier.success(`Copied ${result.rowCount.toLocaleString()} rows as ${FORMAT_META[format].label}`, toastId)
    } catch (error) {
      notifier.error(error instanceof Error ? error.message : "Failed to copy rows", toastId)
    }
    return
  }

  const rows = getScopeRows(table, effectiveScope)
  const content = formatRows(table, rows, format, false)
  await writeClipboard(content)
  notifier.success(`Copied ${rows.length} rows as ${FORMAT_META[format].label}`)
}
