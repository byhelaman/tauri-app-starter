import type { ReactNode } from "react"
import type { ColumnDef, ColumnFiltersState, OnChangeFn, SortingState } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import type {
  DataTableResetContext,
  DataTableSelectionState,
  InfiniteScrollConfig,
} from "@/components/data-table/data-table-types"
import type { DeletedOrder } from "@/features/orders/api"
import type { Order } from "@/features/orders/columns"
import type { QueueOrder } from "@/features/orders/modal-columns"

interface OrdersTableModel<TData> {
  data: TData[]
  isLoading: boolean
  infiniteScroll: InfiniteScrollConfig
  columnFilters: ColumnFiltersState
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>
  globalFilter: string
  onGlobalFilterChange: OnChangeFn<string>
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  onSortingRefresh: () => void
}

type BulkActionsRenderer<TData> = (
  selectedLoadedRows: TData[],
  clearSelection: () => void,
  selectedIds: string[],
  selection: DataTableSelectionState,
  meta: { selectedCount: number; isSelectionCountPending: boolean }
) => ReactNode

interface OrdersDataTableProps extends OrdersTableModel<Order> {
  columns: ColumnDef<Order>[]
  allowDataExport: boolean
  allowDataCopy: boolean
  toolbar: React.ComponentProps<typeof DataTable<Order, unknown>>["toolbar"]
  sidePanel: (onClose: () => void) => ReactNode
  rowContextMenu: (row: Order) => ReactNode
  bulkActions: BulkActionsRenderer<Order>
  rowClassName?: (row: Order) => string | undefined
  onResetView?: (context: DataTableResetContext) => void
}

export function OrdersDataTable({
  columns,
  data,
  isLoading,
  infiniteScroll,
  allowDataExport,
  allowDataCopy,
  columnFilters,
  onColumnFiltersChange,
  globalFilter,
  onGlobalFilterChange,
  sorting,
  onSortingChange,
  onSortingRefresh,
  onResetView,
  toolbar,
  sidePanel,
  rowContextMenu,
  bulkActions,
  rowClassName,
}: OrdersDataTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      infiniteScroll={infiniteScroll}
      allowDataExport={allowDataExport}
      allowDataCopy={allowDataCopy}
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      globalFilter={globalFilter}
      onGlobalFilterChange={onGlobalFilterChange}
      sorting={sorting}
      onSortingChange={onSortingChange}
      onSortingRefresh={onSortingRefresh}
      onResetView={onResetView}
      tableId="orders"
      sidePanel={sidePanel}
      toolbar={toolbar}
      rowContextMenu={rowContextMenu}
      bulkActions={bulkActions}
      rowClassName={rowClassName}
      getRowId={(row) => row.id}
      defaultPageSize={25}
    />
  )
}

interface QueueDataTableProps extends OrdersTableModel<QueueOrder> {
  columns: ColumnDef<QueueOrder>[]
  allowDataCopy: boolean
  toolbar: React.ComponentProps<typeof DataTable<QueueOrder, unknown>>["toolbar"]
  bulkActions: BulkActionsRenderer<QueueOrder>
  rowContextMenu: (row: QueueOrder) => ReactNode
}

export function QueueDataTable({
  columns,
  data,
  isLoading,
  infiniteScroll,
  allowDataCopy,
  columnFilters,
  onColumnFiltersChange,
  globalFilter,
  onGlobalFilterChange,
  sorting,
  onSortingChange,
  onSortingRefresh,
  toolbar,
  bulkActions,
  rowContextMenu,
}: QueueDataTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      infiniteScroll={infiniteScroll}
      allowDataExport={false}
      allowDataCopy={allowDataCopy}
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      globalFilter={globalFilter}
      onGlobalFilterChange={onGlobalFilterChange}
      sorting={sorting}
      onSortingChange={onSortingChange}
      onSortingRefresh={onSortingRefresh}
      tableId="orders-queue"
      toolbar={toolbar}
      bulkActions={bulkActions}
      rowContextMenu={rowContextMenu}
      getRowId={(row) => row.id}
      layout={{
        scrollAreaClassName: "max-h-[min(calc(100svh-22rem),30rem)] [--table-bg:var(--color-popover)]",
      }}
    />
  )
}

interface TrashDataTableProps extends OrdersTableModel<DeletedOrder> {
  columns: ColumnDef<DeletedOrder>[]
  toolbar: React.ComponentProps<typeof DataTable<DeletedOrder, unknown>>["toolbar"]
  rowContextMenu: (row: DeletedOrder) => ReactNode
}

export function TrashDataTable({
  columns,
  data,
  isLoading,
  infiniteScroll,
  columnFilters,
  onColumnFiltersChange,
  globalFilter,
  onGlobalFilterChange,
  sorting,
  onSortingChange,
  onSortingRefresh,
  toolbar,
  rowContextMenu,
}: TrashDataTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      infiniteScroll={infiniteScroll}
      allowDataExport={false}
      allowDataCopy={false}
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      globalFilter={globalFilter}
      onGlobalFilterChange={onGlobalFilterChange}
      sorting={sorting}
      onSortingChange={onSortingChange}
      onSortingRefresh={onSortingRefresh}
      tableId="orders-trash"
      toolbar={toolbar}
      rowContextMenu={rowContextMenu}
      getRowId={(row) => row.id}
      layout={{
        scrollAreaClassName: "max-h-[min(calc(100svh-22rem),30rem)] [--table-bg:var(--color-popover)]",
      }}
    />
  )
}
