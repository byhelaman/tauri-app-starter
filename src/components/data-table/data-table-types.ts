import type { ReactNode } from "react"
import type { ColumnFiltersState, SortingState, Table } from "@tanstack/react-table"

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
  searchDebounceMs?: number
  showViewOptions?: boolean
}

export interface DataTableLayoutConfig {
  fitHeight?: boolean
  scrollAreaClassName?: string
  tableHeaderClassName?: string
}

export interface DataTableSelectionScope {
  search: string
  filters: ColumnFiltersState
  date?: string
  sorting?: SortingState
}

export type DataTableSelectionState =
  | { mode: "ids"; ids: string[] }
  | {
      mode: "filter"
      scope: DataTableSelectionScope
      total: number
      excludedIds: string[]
    }

export type ServerExportFormat = "csv" | "tsv" | "json" | "md" | "lines" | "custom"

export interface ServerScopeExportRequest {
  scope: DataTableSelectionScope
  excludedIds?: string[]
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
  /** Máximo de filas permitido para acciones masivas que cargan datos completos en el cliente */
  bulkActionRowLimit?: number
  /**
   * Obtiene filas completas que coinciden con los filtros actuales desde el servidor.
   * El backend puede aplicar bulkActionRowLimit; no debe usarse para scopes mayores a ese límite.
   */
  fetchAllByFilter?: () => Promise<Record<string, unknown>[]>
  /** Obtiene filas completas sin filtros de tabla activos. Usado por scope "All" en infinite scroll. */
  fetchAllUnfiltered?: () => Promise<Record<string, unknown>[]>
  /** Obtiene filas completas por IDs exactos. Usado cuando la selección incluye filas no cargadas. */
  fetchByIds?: (ids: string[]) => Promise<Record<string, unknown>[]>
  /** Scope actual de servidor usado cuando el usuario hace select-all. */
  currentScope?: DataTableSelectionScope
  /** Genera contenido server-side para scopes grandes sin cargar registros en memoria del cliente. */
  exportByScope?: (request: ServerScopeExportRequest) => Promise<ServerScopeExportResult>
}

// ────────────────────────────────────────────────────────────────────────────
// DataTable Meta — compartido entre DataTable y column definitions vía
// table.options.meta. Permite que las columnas accedan al estado de selección.
// ────────────────────────────────────────────────────────────────────────────
export interface DataTableMeta {
  /** Indica si la tabla está funcionando en modo infinite scroll */
  isInfiniteScroll?: boolean
  /** Ejecuta el fetch de IDs y selecciona todas las filas filtradas globalmente */
  selectAll?: () => Promise<void>
  /** Deselecciona todas las filas filtradas globalmente */
  deselectAll?: () => Promise<void>
  /** Indica si el fetch de IDs para "Select All" está en progreso */
  isSelectingAll?: "selectAll" | "deselectAll" | false
  /** Cantidad de filas seleccionadas que coinciden con el filtro actual */
  visibleSelectedCount?: number
  /** IDs seleccionados que coinciden con el filtro actual */
  visibleSelectedIds?: string[]
  /** Selección completa: IDs exactos o scope/filtro + exclusiones. */
  selectionState?: DataTableSelectionState
  /** Total seleccionado real: ids.length o scope.total - excludedIds.length. */
  selectedCount?: number
  /** Cantidad total de filas en el filtro actual */
  totalRowCount?: number
  /** Refresca datos cuando el usuario re-aplica el mismo ordenamiento remoto */
  refreshSorting?: () => void
}

export interface HistoryDetail {
  recordId?: string
  recordCode?: string
  field: string
  oldValue?: string | number | boolean | null
  newValue?: string | number | boolean | null
}

export interface HistoryRecordRef {
  recordId: string
  recordCode?: string
}

export interface HistorySummary {
  rowCount?: number
  sampleRecords?: HistoryRecordRef[]
  omittedCount?: number
  search?: string | null
  status?: string[] | null
  excludedIds?: string[] | null
  deletedIds?: string[] | null
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
