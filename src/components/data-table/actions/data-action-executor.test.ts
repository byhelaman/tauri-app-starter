import { describe, expect, it, vi } from "vitest"
import type { Table } from "@tanstack/react-table"
import type { DataTableMeta, InfiniteScrollConfig } from "../core/data-table-types"
import { executeCopyAction, executeExportAction } from "./data-action-executor"

function createTableStub() {
  return {
    getSelectedRowModel: () => ({ rows: [] }),
    getFilteredRowModel: () => ({ rows: [] }),
    getCoreRowModel: () => ({ rows: [] }),
    getState: () => ({ rowSelection: {} }),
    getVisibleFlatColumns: () => [{ id: "code" }],
  } as unknown as Table<unknown>
}

function createLocalTableStub() {
  const rows = [
    { original: { code: "ORD-001" } },
    { original: { code: "ORD-002" } },
  ]

  return {
    getSelectedRowModel: () => ({ rows: rows.slice(0, 1) }),
    getFilteredRowModel: () => ({ rows }),
    getCoreRowModel: () => ({ rows }),
    getState: () => ({ rowSelection: { "0": true } }),
    getVisibleFlatColumns: () => [{ id: "code" }],
  } as unknown as Table<unknown>
}

function notifier() {
  return {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }
}

function scroll(exportByScope: InfiniteScrollConfig["exportByScope"]): InfiniteScrollConfig {
  return {
    fetchNextPage: () => undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    currentScope: { search: "", filters: [] },
    exportByScope,
  }
}

describe("data action executor", () => {
  it("runs server-side exports through the saver", async () => {
    const note = notifier()
    const saveFile = vi.fn().mockResolvedValue(true)

    await executeExportAction({
      table: createTableStub(),
      tableId: "orders",
      tableMeta: { isInfiniteScroll: true } satisfies DataTableMeta,
      infiniteScroll: scroll(vi.fn().mockResolvedValue({ content: "csv", rowCount: 20 })),
      effectiveScope: "all",
      selectedIds: [],
      scopeCount: 20,
      notifier: note,
      format: "csv",
      saveFile,
    })

    expect(saveFile).toHaveBeenCalledWith("csv", "orders-all.csv", "text/csv", "csv")
    expect(note.success).toHaveBeenCalledWith("Exported 20 rows as CSV", "export-scope")
  })

  it("runs server-side copies through the clipboard writer", async () => {
    const note = notifier()
    const writeClipboard = vi.fn().mockResolvedValue(undefined)

    await executeCopyAction({
      table: createTableStub(),
      tableId: "orders",
      tableMeta: { isInfiniteScroll: true } satisfies DataTableMeta,
      infiniteScroll: scroll(vi.fn().mockResolvedValue({ content: "copied", rowCount: 3 })),
      effectiveScope: "filtered",
      selectedIds: [],
      scopeCount: 3,
      notifier: note,
      format: "tsv",
      writeClipboard,
    })

    expect(writeClipboard).toHaveBeenCalledWith("copied")
    expect(note.success).toHaveBeenCalledWith("Copied 3 rows as TSV", "copy-scope")
  })

  it("falls back to local rows when export has no server scope", async () => {
    const note = notifier()
    const saveFile = vi.fn().mockResolvedValue(true)

    await executeExportAction({
      table: createLocalTableStub(),
      tableId: "orders",
      effectiveScope: "filtered",
      selectedIds: [],
      scopeCount: 2,
      notifier: note,
      format: "csv",
      saveFile,
    })

    expect(saveFile).toHaveBeenCalledWith(
      "code\nORD-001\nORD-002",
      "orders-filtered.csv",
      "text/csv",
      "csv",
    )
    expect(note.success).toHaveBeenCalledWith("Exported 2 rows as CSV")
  })

  it("falls back to local rows when copy has no server scope", async () => {
    const note = notifier()
    const writeClipboard = vi.fn().mockResolvedValue(undefined)

    await executeCopyAction({
      table: createLocalTableStub(),
      tableId: "orders",
      effectiveScope: "selected",
      selectedIds: ["0"],
      scopeCount: 1,
      notifier: note,
      format: "tsv",
      writeClipboard,
    })

    expect(writeClipboard).toHaveBeenCalledWith("ORD-001")
    expect(note.success).toHaveBeenCalledWith("Copied 1 rows as TSV")
  })

  it("dismisses the loading notification when a server export is cancelled", async () => {
    const note = notifier()

    await executeExportAction({
      table: createTableStub(),
      tableId: "orders",
      tableMeta: { isInfiniteScroll: true } satisfies DataTableMeta,
      infiniteScroll: scroll(vi.fn().mockResolvedValue({ content: "csv", rowCount: 20 })),
      effectiveScope: "all",
      selectedIds: [],
      scopeCount: 20,
      notifier: note,
      format: "csv",
      saveFile: vi.fn().mockResolvedValue(false),
    })

    expect(note.dismiss).toHaveBeenCalledWith("export-scope")
    expect(note.success).not.toHaveBeenCalled()
  })
})
