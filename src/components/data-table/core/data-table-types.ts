import type { ReactNode } from "react"
import type { ColumnFiltersState, RowData, SortingState, Table } from "@tanstack/react-table"

declare module "@tanstack/react-table" {
  // Must keep TanStack's exact generic signature for declaration merging.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    grid?: DataTableGridCellMeta
  }
}

export type DataTableGridCellInteraction = "readonly" | "editable" | "control"

export interface DataTableGridCellMeta {
  /** Interacción primaria que la grilla debe aplicar al enfocar/activar la celda. */
  interaction: DataTableGridCellInteraction
}

export interface FacetedFilterOption {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}

export interface FacetedFilterConfig {
  columnId: string
  title: string
  options: FacetedFilterOption[]
}

export interface IntervalFilterConfig {
  columnId: string
  title?: string
  /** Horas disponibles obtenidas del servidor. Si se omite, se muestran 00-23. */
  hours?: string[]
}

export type ToolbarActionsRenderer<TData> = ReactNode | ((table: Table<TData>) => ReactNode)

export interface DataTableToolbarConfig<TData> {
  searchable?: boolean
  filterPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  intervalFilter?: IntervalFilterConfig
  actions?: ToolbarActionsRenderer<TData>
  showViewOptions?: boolean
  viewActionsMode?: "full" | "bulk-copy" | "view" | "none"
  viewMenuItems?: ReactNode | ((table: Table<TData>) => ReactNode)
  resultCountMode?: "server" | "client"
  selectionMode?: "server" | "client"
  /** Opciones de autocompletado para la barra de búsqueda (server-side). */
  searchAutocomplete?: { label: string; value: string }[]
  /** Inyecta un buscador personalizado, ideal para aislar estados de autocompletado y debounce. */
  renderSearchInput?: (props: {
    value: string
    onChange: (value: string) => void
    onCommit: (selectedValue?: string) => void
    placeholder?: string
  }) => ReactNode
}

export interface DataTableLayoutConfig {
  fitHeight?: boolean
  scrollAreaClassName?: string
  tableHeaderClassName?: string
}

export interface DataTableResetContext {
  closeSidePanel: () => void
  resetScroll: () => void
}

export interface DataTableSelectionScope {
  search: string
  filters: ColumnFiltersState
  date?: string
  sorting?: SortingState
}

export type DataTableSelectionOperation =
  | { type: "select"; scope: DataTableSelectionScope; total: number }
  | { type: "deselect"; scope: DataTableSelectionScope; total: number }
  | { type: "selectIds"; ids: string[] }
  | { type: "deselectIds"; ids: string[] }

export type DataTableSelectionState =
  | { mode: "ids"; ids: string[] }
  | {
      mode: "operations"
      operations: DataTableSelectionOperation[]
    }

export type ServerExportFormat = "csv" | "tsv" | "json" | "md" | "lines" | "custom"

export interface ServerScopeExportRequest {
  scope: DataTableSelectionScope
  operations?: DataTableSelectionOperation[]
  purpose?: "copy" | "export"
  format: ServerExportFormat
  fields: string[]
  headers?: boolean
  template?: string
}

export interface ServerScopeExportResult {
  content: string
  rowCount: number
}

/** Configuración para modo infinite scroll (sin paginación visible) */
export interface InfiniteScrollConfig {
  /** Obtiene la siguiente página de datos */
  fetchNextPage: () => void
  /** Indica si hay más páginas disponibles */
  hasNextPage: boolean
  /** Indica si está cargando la siguiente página */
  isFetchingNextPage: boolean
  /** Filas antes del final del dataset que disparan el fetch (default 100) */
  threshold?: number
  /** Total de filas en la BD para los filtros actuales (para el banner select-all) */
  totalRowCount?: number
  /** Total de filas sin filtros de tabla activos */
  unfilteredTotalRowCount?: number
  /** Scope actual de servidor usado cuando el usuario hace select-all. */
  currentScope?: DataTableSelectionScope
  /** Genera contenido server-side para scopes grandes sin cargar registros en memoria del cliente. */
  exportByScope?: (request: ServerScopeExportRequest) => Promise<ServerScopeExportResult>
  /** Cuenta exactamente la selección por operaciones en backend. */
  countBySelection?: (selection: DataTableSelectionState, scope?: DataTableSelectionScope) => Promise<number>
}

// ────────────────────────────────────────────────────────────────────────────
// DataTable Meta — compartido entre DataTable y column definitions vía
// table.options.meta. Permite que las columnas accedan al estado de selección.
// ────────────────────────────────────────────────────────────────────────────
export interface DataTableMeta {
  /** Indica si la tabla está cargando datos */
  isLoading?: boolean
  /** Indica si la tabla está funcionando en modo infinite scroll */
  isInfiniteScroll?: boolean
  /** Selecciona todas las filas del scope/filtro actual sin descargar IDs. */
  selectAll?: () => Promise<void>
  /** Deselecciona todas las filas filtradas globalmente */
  deselectAll?: () => Promise<void>
  /** Indica si el fetch de IDs para "Select All" está en progreso */
  isSelectingAll?: "selectAll" | "deselectAll" | false
  /** Cantidad de filas seleccionadas que coinciden con el filtro actual */
  visibleSelectedCount?: number
  /** IDs seleccionados que coinciden con el filtro actual */
  visibleSelectedIds?: string[]
  /** Selección completa: IDs exactos u operaciones ordenadas por scope. */
  selectionState?: DataTableSelectionState
  /** Total seleccionado real: ids.length o conteo/evaluación de operaciones. */
  selectedCount?: number
  /** El conteo global está pendiente de confirmación remota. */
  isSelectionCountPending?: boolean
  /** Conteo mostrado cuando el filtro visible es solo una intersección de la selección real. */
  displaySelectedCount?: number
  /** Total seleccionado dentro del scope/filtro activo de la tabla. */
  currentScopeSelectedCount?: number
  /** Cantidad total de filas en el filtro actual */
  totalRowCount?: number
  /** Refresca datos cuando el usuario re-aplica el mismo ordenamiento remoto */
  refreshSorting?: () => void
  /** Maneja la selección de filas con soporte para Shift+Clic (selección por rango) */
  handleRowSelect?: (rowId: string, value: boolean, isShift: boolean) => void
}

export interface HistoryDetail {
  recordId?: string
  recordCode?: string
  field: string
  oldValue?: string | number | boolean | null
  newValue?: string | number | boolean | null
}

export interface HistorySummary {
  rowCount?: number
  search?: string | null
  status?: string[] | null
}

export interface HistoryEntry {
  id: string
  action: "create" | "update" | "delete"
  description: string
  actorEmail: string
  createdAt: string
  orderId?: string
  recordCode?: string
  details?: HistoryDetail[]
  summary?: HistorySummary
}
