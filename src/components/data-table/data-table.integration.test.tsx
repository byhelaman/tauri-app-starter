import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ColumnDef, ColumnFiltersState } from "@tanstack/react-table"
import { DataTable } from "./data-table"
import { createSelectColumn, multiValueFilter } from "./data-table-cells"
import type { DataTableSelectionOperation, DataTableSelectionScope, DataTableSelectionState } from "./data-table-types"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
      index,
      key: index,
      start: index * 48,
      end: (index + 1) * 48,
      size: 48,
      lane: 0,
    })),
    getTotalSize: () => count * 48,
    scrollToIndex: () => undefined,
  }),
}))

type TestOrder = {
  id: string
  code: string
  status: "pending" | "processing" | "shipped"
  channel: "Online" | "Retail"
}

const rows: TestOrder[] = [
  { id: "a", code: "ORD-A", status: "pending", channel: "Online" },
  { id: "b", code: "ORD-B", status: "processing", channel: "Retail" },
  { id: "c", code: "ORD-C", status: "processing", channel: "Online" },
  { id: "d", code: "ORD-D", status: "shipped", channel: "Retail" },
  { id: "e", code: "ORD-E", status: "shipped", channel: "Online" },
  { id: "f", code: "ORD-F", status: "pending", channel: "Retail" },
]

const columns: ColumnDef<TestOrder>[] = [
  createSelectColumn<TestOrder>(),
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => row.original.code,
  },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: multiValueFilter,
    cell: ({ row }) => row.original.status,
  },
  {
    accessorKey: "channel",
    header: "Channel",
    filterFn: multiValueFilter,
    cell: ({ row }) => row.original.channel,
  },
]

function filteredRows(filters: ColumnFiltersState) {
  return rows.filter((row) => filters.every((filter) => {
    const value = filter.value
    if (!Array.isArray(value) || value.length === 0) return true
    return value.map(String).includes(String(row[filter.id as keyof TestOrder]))
  }))
}

function rowMatchesScope(row: TestOrder, scope: DataTableSelectionScope) {
  const search = scope.search.trim().toLowerCase()
  if (search && !Object.values(row).join(" ").toLowerCase().includes(search)) return false
  return filteredRows(scope.filters).some((item) => item.id === row.id)
}

function operationMatches(row: TestOrder, operation: DataTableSelectionOperation) {
  if (operation.type === "selectIds" || operation.type === "deselectIds") {
    return operation.ids.includes(row.id)
  }
  return rowMatchesScope(row, operation.scope)
}

async function countBySelection(selection: DataTableSelectionState, scope?: DataTableSelectionScope) {
  if (selection.mode === "ids") {
    return selection.ids.filter((id) => !scope || rowMatchesScope(rows.find((row) => row.id === id)!, scope)).length
  }

  return rows.filter((row) => {
    let selected = false
    for (const operation of selection.operations) {
      if (operationMatches(row, operation)) {
        selected = operation.type === "select" || operation.type === "selectIds"
      }
    }
    return selected && (!scope || rowMatchesScope(row, scope))
  }).length
}

function renderOrdersTable({
  filters = [],
  onBulkAction,
}: {
  filters?: ColumnFiltersState
  onBulkAction?: (payload: {
    selectedLoadedRows: TestOrder[]
    selectedIds: string[]
    selection: DataTableSelectionState
  }) => void
} = {}) {
  const data = filteredRows(filters)
  return render(
    <DataTable
      tableId="orders-integration-test"
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      columnFilters={filters}
      onColumnFiltersChange={() => undefined}
      globalFilter=""
      onGlobalFilterChange={() => undefined}
      infiniteScroll={{
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
        totalRowCount: data.length,
        currentScope: {
          search: "",
          filters,
          sorting: [],
        },
        countBySelection,
      }}
      toolbar={{
        searchable: true,
        searchDebounceMs: 0,
        selectionMode: "server",
        showViewOptions: false,
      }}
      bulkActions={(selectedLoadedRows, _clearSelection, selectedIds, selection) => (
        <button
          type="button"
          onClick={() => onBulkAction?.({ selectedLoadedRows, selectedIds, selection })}
        >
          Copy
        </button>
      )}
    />
  )
}

function rerenderOrdersTable(
  view: ReturnType<typeof renderOrdersTable>,
  {
    filters = [],
    onBulkAction,
  }: {
    filters?: ColumnFiltersState
    onBulkAction?: (payload: {
      selectedLoadedRows: TestOrder[]
      selectedIds: string[]
      selection: DataTableSelectionState
    }) => void
  } = {}
) {
  const data = filteredRows(filters)
  view.rerender(
    <DataTable
      tableId="orders-integration-test"
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      columnFilters={filters}
      onColumnFiltersChange={() => undefined}
      globalFilter=""
      onGlobalFilterChange={() => undefined}
      infiniteScroll={{
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
        totalRowCount: data.length,
        currentScope: { search: "", filters, sorting: [] },
        countBySelection,
      }}
      toolbar={{
        searchable: true,
        searchDebounceMs: 0,
        selectionMode: "server",
        showViewOptions: false,
      }}
      bulkActions={(selectedLoadedRows, _clearSelection, selectedIds, selection) => (
        <button
          type="button"
          onClick={() => onBulkAction?.({ selectedLoadedRows, selectedIds, selection })}
        >
          Copy
        </button>
      )}
    />
  )
}

function selectAllCheckbox() {
  return screen.getByLabelText("Select all")
}

function rowCheckboxes() {
  return screen.getAllByLabelText("Select row")
}

describe("DataTable integration", () => {
  it("keeps a global select-all selected when the current server scope changes", async () => {
    const view = renderOrdersTable()

    fireEvent.click(selectAllCheckbox())

    await screen.findByText("6 selected")

    const processingFilter = [{ id: "status", value: ["processing"] }]
    rerenderOrdersTable(view, { filters: processingFilter })

    await screen.findByText("6 selected")
    expect(screen.getByText("2 of 2 in view")).toBeInTheDocument()
    expect(selectAllCheckbox()).toHaveAttribute("aria-checked", "true")
    expect(rowCheckboxes()).toHaveLength(2)
    rowCheckboxes().forEach((checkbox) => expect(checkbox).toHaveAttribute("aria-checked", "true"))
  })

  it("selects only the filtered server scope when select-all starts from a filtered view", async () => {
    const processingFilter = [{ id: "status", value: ["processing"] }]
    const view = renderOrdersTable({ filters: processingFilter })

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("2 selected")

    rerenderOrdersTable(view)

    await screen.findByText("2 selected")
    const rowByCode = (code: string) => screen.getByText(code).closest("tr") as HTMLElement
    expect(within(rowByCode("ORD-B")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "true")
    expect(within(rowByCode("ORD-C")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "true")
    expect(within(rowByCode("ORD-A")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "false")
    expect(selectAllCheckbox()).toHaveAttribute("aria-checked", "mixed")
  })

  it("accumulates manual rows and later filtered select-all into one bulk action selection", async () => {
    const onBulkAction = vi.fn()
    const view = renderOrdersTable({ onBulkAction })

    fireEvent.click(within(screen.getByText("ORD-A").closest("tr") as HTMLElement).getByLabelText("Select row"))
    await screen.findByText("1 selected")

    const shippedFilter = [{ id: "status", value: ["shipped"] }]
    rerenderOrdersTable(view, { filters: shippedFilter, onBulkAction })

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("3 selected")

    fireEvent.click(screen.getByText("Copy"))

    await waitFor(() => expect(onBulkAction).toHaveBeenCalledTimes(1))
    const payload = onBulkAction.mock.calls[0][0]
    expect(payload.selectedIds).toEqual(["d", "e"])
    expect(payload.selectedLoadedRows.map((row: TestOrder) => row.id)).toEqual(["d", "e"])
    expect(payload.selection.mode).toBe("operations")
    expect(payload.selection.selectedCount).toBe(3)
  })

  it("deselects only the active filtered scope after a global select-all", async () => {
    const view = renderOrdersTable()

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("6 selected")

    const processingFilter = [{ id: "status", value: ["processing"] }]
    rerenderOrdersTable(view, { filters: processingFilter })
    await screen.findByText("6 selected")

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("4 selected")
    expect(screen.getByText("0 of 2 in view")).toBeInTheDocument()
    rowCheckboxes().forEach((checkbox) => expect(checkbox).toHaveAttribute("aria-checked", "false"))

    rerenderOrdersTable(view)
    await screen.findByText("4 selected")

    const rowByCode = (code: string) => screen.getByText(code).closest("tr") as HTMLElement
    expect(within(rowByCode("ORD-B")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "false")
    expect(within(rowByCode("ORD-C")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "false")
    expect(within(rowByCode("ORD-A")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "true")
    expect(within(rowByCode("ORD-D")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "true")
  })

  it("passes the global selection to bulk actions while exposing only visible selected ids", async () => {
    const onBulkAction = vi.fn()
    const view = renderOrdersTable({ onBulkAction })

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("6 selected")

    const processingFilter = [{ id: "status", value: ["processing"] }]
    rerenderOrdersTable(view, { filters: processingFilter, onBulkAction })

    await screen.findByText("6 selected")
    fireEvent.click(screen.getByText("Copy"))

    await waitFor(() => expect(onBulkAction).toHaveBeenCalledTimes(1))
    const payload = onBulkAction.mock.calls[0][0]
    expect(payload.selectedIds).toEqual(["b", "c"])
    expect(payload.selectedLoadedRows.map((row: TestOrder) => row.id)).toEqual(["b", "c"])
    expect(payload.selection.mode).toBe("operations")
    expect(payload.selection.selectedCount).toBe(6)
  })

  it("does not drift counts when toggling the same filtered scope repeatedly", async () => {
    const view = renderOrdersTable()

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("6 selected")

    const processingFilter = [{ id: "status", value: ["processing"] }]
    rerenderOrdersTable(view, { filters: processingFilter })

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(selectAllCheckbox())
      await screen.findByText("4 selected")
      expect(screen.getByText("0 of 2 in view")).toBeInTheDocument()
      rowCheckboxes().forEach((checkbox) => expect(checkbox).toHaveAttribute("aria-checked", "false"))

      fireEvent.click(selectAllCheckbox())
      await screen.findByText("6 selected")
      expect(screen.getByText("2 of 2 in view")).toBeInTheDocument()
      rowCheckboxes().forEach((checkbox) => expect(checkbox).toHaveAttribute("aria-checked", "true"))
    }
  })

  it("keeps overlapping filter scopes consistent when one scope is deselected and another is selected", async () => {
    const view = renderOrdersTable()

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("6 selected")

    const processingFilter = [{ id: "status", value: ["processing"] }]
    rerenderOrdersTable(view, { filters: processingFilter })

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("4 selected")
    expect(screen.getByText("0 of 2 in view")).toBeInTheDocument()

    const onlineFilter = [{ id: "channel", value: ["Online"] }]
    rerenderOrdersTable(view, { filters: onlineFilter })

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("5 selected")
    expect(screen.getByText("3 of 3 in view")).toBeInTheDocument()

    rerenderOrdersTable(view)
    await screen.findByText("5 selected")

    const rowByCode = (code: string) => screen.getByText(code).closest("tr") as HTMLElement
    expect(within(rowByCode("ORD-A")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "true")
    expect(within(rowByCode("ORD-B")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "false")
    expect(within(rowByCode("ORD-C")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "true")
    expect(within(rowByCode("ORD-D")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "true")
    expect(within(rowByCode("ORD-E")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "true")
    expect(within(rowByCode("ORD-F")).getByLabelText("Select row")).toHaveAttribute("aria-checked", "true")
    expect(selectAllCheckbox()).toHaveAttribute("aria-checked", "mixed")
  })

  it("does not increase selected count above the dataset total when a row is deselected and reselected", async () => {
    const view = renderOrdersTable()

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("6 selected")

    const row = screen.getByText("ORD-A").closest("tr") as HTMLElement
    fireEvent.click(within(row).getByLabelText("Select row"))
    await screen.findByText("5 selected")

    fireEvent.click(within(row).getByLabelText("Select row"))
    await screen.findByText("6 selected")
    expect(screen.queryByText("7 selected")).not.toBeInTheDocument()

    rerenderOrdersTable(view)
    await screen.findByText("6 selected")
    expect(selectAllCheckbox()).toHaveAttribute("aria-checked", "true")
  })
})
