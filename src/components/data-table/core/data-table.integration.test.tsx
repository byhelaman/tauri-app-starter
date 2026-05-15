import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type { ColumnDef, ColumnFiltersState } from "@tanstack/react-table"
import { DataTable } from "./data-table"
import { createSelectColumn, multiValueFilter, renderCell } from "./data-table-cells"
import type { DataTableSelectionOperation, DataTableSelectionScope, DataTableSelectionState } from "./data-table-types"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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

function SelectStatusCell({ initialValue }: { initialValue: TestOrder["status"] }) {
  const [value, setValue] = useState<TestOrder["status"]>(initialValue)

  return (
    <Select value={value} onValueChange={(nextValue) => setValue(nextValue as TestOrder["status"])}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="pending">pending</SelectItem>
          <SelectItem value="processing">processing</SelectItem>
          <SelectItem value="shipped">shipped</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
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
  loadedIds,
  totalRowCount,
  unfilteredTotalRowCount,
  countBySelectionFn = countBySelection,
  onBulkAction,
}: {
  filters?: ColumnFiltersState
  loadedIds?: string[]
  totalRowCount?: number
  unfilteredTotalRowCount?: number
  countBySelectionFn?: typeof countBySelection
  onBulkAction?: (payload: {
    selectedLoadedRows: TestOrder[]
    selectedIds: string[]
    selection: DataTableSelectionState
    meta: { selectedCount: number; isSelectionCountPending: boolean }
  }) => void
} = {}) {
  const data = filteredRows(filters).filter((row) => !loadedIds || loadedIds.includes(row.id))
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
        totalRowCount: totalRowCount ?? data.length,
        unfilteredTotalRowCount: unfilteredTotalRowCount ?? rows.length,
        currentScope: {
          search: "",
          filters,
          sorting: [],
        },
        countBySelection: countBySelectionFn,
      }}
      toolbar={{
        searchable: true,
        selectionMode: "server",
        showViewOptions: false,
      }}
      bulkActions={(selectedLoadedRows, _clearSelection, selectedIds, selection, meta) => (
        <button
          type="button"
          onClick={() => onBulkAction?.({ selectedLoadedRows, selectedIds, selection, meta })}
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
    loadedIds,
    totalRowCount,
    unfilteredTotalRowCount,
    countBySelectionFn = countBySelection,
    onBulkAction,
  }: {
    filters?: ColumnFiltersState
    loadedIds?: string[]
    totalRowCount?: number
    unfilteredTotalRowCount?: number
    countBySelectionFn?: typeof countBySelection
    onBulkAction?: (payload: {
      selectedLoadedRows: TestOrder[]
      selectedIds: string[]
      selection: DataTableSelectionState
      meta: { selectedCount: number; isSelectionCountPending: boolean }
    }) => void
  } = {}
) {
  const data = filteredRows(filters).filter((row) => !loadedIds || loadedIds.includes(row.id))
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
        totalRowCount: totalRowCount ?? data.length,
        unfilteredTotalRowCount: unfilteredTotalRowCount ?? rows.length,
        currentScope: { search: "", filters, sorting: [] },
        countBySelection: countBySelectionFn,
      }}
      toolbar={{
        searchable: true,
        selectionMode: "server",
        showViewOptions: false,
      }}
      bulkActions={(selectedLoadedRows, _clearSelection, selectedIds, selection, meta) => (
        <button
          type="button"
          onClick={() => onBulkAction?.({ selectedLoadedRows, selectedIds, selection, meta })}
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
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn() },
    })
  })

  it("keeps arrow navigation moving across checkbox, text, select-like button, and badge cells", () => {
    const mixedColumns: ColumnDef<TestOrder>[] = [
      createSelectColumn<TestOrder>(),
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => row.original.code,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <button type="button">{row.original.status}</button>,
      },
      {
        accessorKey: "channel",
        header: "Channel",
        cell: ({ row }) => <span>{row.original.channel}</span>,
      },
    ]

    render(
      <DataTable
        tableId="grid-navigation-test"
        columns={mixedColumns}
        data={rows.slice(0, 2)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const firstRow = screen.getByText("ORD-A").closest("tr") as HTMLTableRowElement
    const firstRowCells = Array.from(firstRow.querySelectorAll<HTMLTableCellElement>("[data-grid-cell='true']"))

    firstRowCells[0].focus()
    fireEvent.keyDown(firstRowCells[0], { key: "ArrowRight" })
    expect(firstRowCells[1]).toHaveFocus()

    fireEvent.keyDown(firstRowCells[1], { key: "ArrowRight" })
    expect(firstRowCells[2]).toHaveFocus()

    fireEvent.keyDown(firstRowCells[2], { key: "ArrowRight" })
    expect(firstRowCells[3]).toHaveFocus()

    fireEvent.keyDown(firstRowCells[3], { key: "ArrowLeft" })
    expect(firstRowCells[2]).toHaveFocus()

    fireEvent.keyDown(firstRowCells[2], { key: "ArrowDown" })
    const secondRow = screen.getByText("ORD-B").closest("tr") as HTMLTableRowElement
    const secondRowCells = Array.from(secondRow.querySelectorAll<HTMLTableCellElement>("[data-grid-cell='true']"))
    expect(secondRowCells[2]).toHaveFocus()
  })

  it("enters inline edit mode from the focused grid cell with Enter", () => {
    const editableColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => renderCell(row.original.code, { enableEditing: true }),
      },
    ]

    render(
      <DataTable
        tableId="grid-edit-activation-test"
        columns={editableColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const cell = screen.getByText("ORD-A").closest("[data-grid-cell='true']") as HTMLTableCellElement
    cell.focus()
    fireEvent.keyDown(cell, { key: "Enter" })

    expect(screen.getByRole("textbox")).toHaveValue("ORD-A")
  })

  it("renders read-only cells with the same idle affordance but without edit mode", () => {
    const readonlyColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => renderCell(row.original.code),
      },
    ]

    render(
      <DataTable
        tableId="grid-readonly-cell-test"
        columns={readonlyColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const valueContainer = screen.getByText("ORD-A").parentElement as HTMLElement
    const cell = valueContainer.closest("[data-grid-cell='true']") as HTMLTableCellElement
    expect(valueContainer).not.toHaveAttribute("data-grid-editable")
    expect(valueContainer).toHaveAttribute("data-grid-readonly", "true")
    expect(valueContainer).toHaveAttribute("data-grid-copy-value", "ORD-A")
    expect(valueContainer).toHaveClass("hover:bg-input/30")
    expect(valueContainer).not.toHaveClass("select-text")

    fireEvent.mouseDown(valueContainer)
    expect(cell).toHaveFocus()
    fireEvent.keyDown(cell, { key: "Enter" })
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("copies read-only and editable cell values from the idle grid cell", () => {
    const mixedColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => renderCell(row.original.code),
      },
      {
        accessorKey: "channel",
        header: "Channel",
        cell: ({ row }) => renderCell(row.original.channel, { enableEditing: true }),
      },
    ]

    render(
      <DataTable
        tableId="grid-copy-cell-test"
        columns={mixedColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const readonlyCell = screen.getByText("ORD-A").closest("[data-grid-cell='true']") as HTMLTableCellElement
    readonlyCell.focus()
    fireEvent.keyDown(readonlyCell, { key: "c", ctrlKey: true })
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("ORD-A")

    const editableCell = screen.getByText("Online").closest("[data-grid-cell='true']") as HTMLTableCellElement
    editableCell.focus()
    fireEvent.keyDown(editableCell, { key: "c", ctrlKey: true })
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("Online")
  })

  it("copies the cell value even when the key event originates from cell content", () => {
    const readonlyColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => renderCell(row.original.code),
      },
    ]

    render(
      <DataTable
        tableId="grid-copy-content-test"
        columns={readonlyColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    fireEvent.keyDown(screen.getByText("ORD-A"), { key: "C", ctrlKey: true })
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("ORD-A")
  })

  it("keeps the grid cell as the only idle tab stop for editable cells", () => {
    const editableColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => renderCell(row.original.code, { enableEditing: true }),
      },
    ]

    render(
      <DataTable
        tableId="grid-single-focus-test"
        columns={editableColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const cell = screen.getByText("ORD-A").closest("[data-grid-cell='true']") as HTMLTableCellElement
    const idleContent = screen.getByText("ORD-A").closest("[data-grid-editable='true']") as HTMLElement
    expect(cell).toHaveAttribute("tabindex", "0")
    expect(idleContent).not.toHaveAttribute("tabindex")
    expect(idleContent).toHaveClass("rounded-lg")
    expect(idleContent).not.toHaveClass("focus:border-ring")
    expect(idleContent).not.toHaveClass("focus:ring-3")

    fireEvent.mouseDown(idleContent)
    expect(cell).toHaveFocus()
  })

  it("keeps the idle grid focus on the cell when clicking non-interactive content", () => {
    const editableColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => renderCell(row.original.code, { enableEditing: true }),
      },
    ]

    render(
      <DataTable
        tableId="grid-click-focus-test"
        columns={editableColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const cell = screen.getByText("ORD-A").closest("[data-grid-cell='true']") as HTMLTableCellElement
    expect(cell).toHaveClass("focus:after:border-ring")
    expect(cell).not.toHaveClass("focus-visible:after:border-ring")

    fireEvent.mouseDown(cell)
    expect(cell).toHaveFocus()
  })

  it("returns focus to the grid cell after cancelling inline edit with Escape", async () => {
    const editableColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => renderCell(row.original.code, { enableEditing: true }),
      },
    ]

    render(
      <DataTable
        tableId="grid-edit-cancel-focus-test"
        columns={editableColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const cell = screen.getByText("ORD-A").closest("[data-grid-cell='true']") as HTMLTableCellElement
    cell.focus()
    fireEvent.keyDown(cell, { key: "Enter" })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" })

    await waitFor(() => expect(cell).toHaveFocus())
  })

  it("activates a nested interactive control from the focused grid cell with Enter", () => {
    const onActivate = vi.fn()
    const interactiveColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <button type="button" onClick={() => onActivate(row.original.id)}>
            {row.original.status}
          </button>
        ),
      },
    ]

    render(
      <DataTable
        tableId="grid-interactive-activation-test"
        columns={interactiveColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const cell = screen.getByText("pending").closest("[data-grid-cell='true']") as HTMLTableCellElement
    cell.focus()
    fireEvent.keyDown(cell, { key: "Enter" })

    expect(screen.getByText("pending")).toHaveFocus()
    expect(onActivate).toHaveBeenCalledWith("a")
  })

  it("opens a select from the idle grid cell with Enter instead of only moving focus into the trigger", async () => {
    const selectColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <SelectStatusCell initialValue={row.original.status} />,
      },
    ]

    render(
      <DataTable
        tableId="grid-select-enter-test"
        columns={selectColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const cell = screen.getByText("pending").closest("[data-grid-cell='true']") as HTMLTableCellElement
    const trigger = within(cell).getByRole("combobox")
    cell.focus()

    fireEvent.keyDown(cell, { key: "Enter" })

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"))
  })

  it("reopens the same select with Enter after choosing a value and returning by grid navigation", async () => {
    const selectColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <SelectStatusCell initialValue={row.original.status} />,
      },
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => row.original.code,
      },
    ]

    render(
      <DataTable
        tableId="grid-select-reopen-test"
        columns={selectColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const statusCell = screen.getByText("pending").closest("[data-grid-cell='true']") as HTMLTableCellElement
    const trigger = within(statusCell).getByRole("combobox")
    statusCell.focus()
    fireEvent.keyDown(statusCell, { key: "Enter" })
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"))

    fireEvent.click(await screen.findByRole("option", { name: "processing" }))
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"))

    fireEvent.keyDown(trigger, { key: "ArrowRight" })
    const codeCell = screen.getByText("ORD-A").closest("[data-grid-cell='true']") as HTMLTableCellElement
    expect(codeCell).toHaveFocus()

    fireEvent.keyDown(codeCell, { key: "ArrowLeft" })
    expect(statusCell).toHaveFocus()

    fireEvent.keyDown(statusCell, { key: "Enter" })
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"))
  })

  it("opens a dropdown menu from the idle grid cell with Enter", async () => {
    const dropdownColumns: ColumnDef<TestOrder>[] = [
      {
        id: "actions",
        header: "Actions",
        cell: () => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button">Open menu</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>View details</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ]

    render(
      <DataTable
        tableId="grid-dropdown-enter-test"
        columns={dropdownColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const trigger = screen.getByText("Open menu")
    const cell = trigger.closest("[data-grid-cell='true']") as HTMLTableCellElement
    cell.focus()

    fireEvent.keyDown(cell, { key: "Enter" })

    await screen.findByText("View details")
  })

  it("delegates a background click in an interactive cell to its control", () => {
    const onActivate = vi.fn()
    const interactiveColumns: ColumnDef<TestOrder>[] = [
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <button type="button" onClick={() => onActivate(row.original.id)}>{row.original.status}</button>,
      },
    ]

    render(
      <DataTable
        tableId="grid-interactive-cell-click-test"
        columns={interactiveColumns}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const control = screen.getByText("pending")
    const cell = control.closest("[data-grid-cell='true']") as HTMLTableCellElement

    fireEvent.mouseDown(cell)

    expect(control).toHaveFocus()
    expect(onActivate).toHaveBeenCalledWith("a")
    expect(cell).not.toHaveFocus()
    expect(cell).not.toHaveClass("focus-within:after:border-ring")
  })

  it("navigates by the rendered pinned-column order", () => {
    window.localStorage.setItem(
      "table-pinning-grid-pinned-test",
      JSON.stringify({ left: ["channel"], right: ["code"] }),
    )

    render(
      <DataTable
        tableId="grid-pinned-test"
        columns={columns.slice(1)}
        data={rows.slice(0, 1)}
        getRowId={(row) => row.id}
        toolbar={{ showViewOptions: false }}
      />
    )

    const row = screen.getByText("ORD-A").closest("tr") as HTMLTableRowElement
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("[data-grid-cell='true']"))
    expect(cells.map((cell) => cell.textContent)).toEqual(["Online", "pending", "ORD-A"])
    expect(cells[0]).toHaveClass("focus:z-40")
    expect(cells[2]).toHaveClass("focus:z-40")
    expect(cells[0]).toHaveClass("focus:after:border-ring")
    expect(cells[2]).toHaveClass("focus:after:border-ring")
    expect(cells[0]).not.toHaveClass("after:rounded-lg")
    expect(cells[2]).not.toHaveClass("after:rounded-lg")

    cells[0].focus()
    fireEvent.keyDown(cells[0], { key: "ArrowRight" })
    expect(cells[1]).toHaveFocus()
    fireEvent.keyDown(cells[1], { key: "ArrowRight" })
    expect(cells[2]).toHaveFocus()
  })

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
    expect(payload.meta.selectedCount).toBe(3)
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
    expect(payload.meta.selectedCount).toBe(6)
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

  it("does not inflate the total selection counter while remote counts are pending", async () => {
    const pendingCounts: Array<(count: number) => void> = []
    const delayedCount = () => new Promise<number>((resolve) => {
      pendingCounts.push(resolve)
    })
    const view = renderOrdersTable({
      loadedIds: ["a", "b", "c"],
      totalRowCount: 100,
      unfilteredTotalRowCount: 100,
      countBySelectionFn: delayedCount,
    })

    // Select all globally — exact derivation: 100
    fireEvent.click(selectAllCheckbox())
    await screen.findByText("100 selected")

    // Filter to processingRetail and deselect-all —
    // exact derivation via subset-deselect: 100 - 10 = 90
    const processingRetailFilter = [
      { id: "status", value: ["processing"] },
      { id: "channel", value: ["Retail"] },
    ]
    rerenderOrdersTable(view, {
      filters: processingRetailFilter,
      loadedIds: ["b"],
      totalRowCount: 10,
      unfilteredTotalRowCount: 100,
      countBySelectionFn: delayedCount,
    })

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("90 selected")
    expect(screen.queryByText("110 selected")).not.toBeInTheDocument()

    // Filter to processingOnline and select-all —
    // can't derive overlap locally, falls to local count (no inflation)
    const processingOnlineFilter = [
      { id: "status", value: ["processing"] },
      { id: "channel", value: ["Online"] },
    ]
    rerenderOrdersTable(view, {
      filters: processingOnlineFilter,
      loadedIds: ["c"],
      totalRowCount: 12,
      unfilteredTotalRowCount: 100,
      countBySelectionFn: delayedCount,
    })

    fireEvent.click(selectAllCheckbox())
    // No inflation — never shows 102 or more
    expect(screen.queryByText("102 selected")).not.toBeInTheDocument()
    expect(screen.queryByText("110 selected")).not.toBeInTheDocument()

    // Return to unfiltered — select all: exact derivation: 100
    rerenderOrdersTable(view, {
      loadedIds: ["a", "b", "c"],
      totalRowCount: 100,
      unfilteredTotalRowCount: 100,
      countBySelectionFn: delayedCount,
    })

    fireEvent.click(selectAllCheckbox())
    await screen.findByText("100 selected")

    // Deselect all — should not show 200 or leave 100
    fireEvent.click(selectAllCheckbox())
    await waitFor(() => expect(screen.queryByText("100 selected")).not.toBeInTheDocument())
    expect(screen.queryByText("200 selected")).not.toBeInTheDocument()

    await act(async () => {
      pendingCounts.splice(0).forEach((resolve) => resolve(0))
      await Promise.resolve()
    })
  })
})
