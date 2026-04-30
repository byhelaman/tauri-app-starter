import type { ReactNode } from "react"
import type { Table } from "@tanstack/react-table"

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
  /**
   * Obtiene TODAS las filas que coinciden con los filtros actuales desde el servidor.
   * @param excludedIds IDs a excluir de los resultados (patrón "select all minus deselected")
   * Usado por Export/Copy/Bulk Copy cuando el scope es 'filtered' o 'all'.
   */
  fetchAllByFilter?: (excludedIds?: string[]) => Promise<Record<string, unknown>[]>
}

// ────────────────────────────────────────────────────────────────────────────
// DataTable Meta — compartido entre DataTable y column definitions vía
// table.options.meta. Permite que las columnas accedan al estado de selección
// "por filtro" sin prop drilling.
// ────────────────────────────────────────────────────────────────────────────
export interface DataTableMeta {
  /** Indica si el modo "seleccionar todos los registros del filtro" está activo */
  isSelectAllByFilter: boolean
  /** IDs de filas excluidas explícitamente mientras isSelectAllByFilter=true */
  excludedIds: Set<string>
  /** Alterna la exclusión de una fila (desmarca en modo select-all-by-filter) */
  toggleExclusion: (id: string) => void
  /** Activa manualmente el modo "seleccionar todos los registros del filtro" */
  selectAll: () => void
  /** Limpia toda la selección, incluyendo exclusiones y el flag de select-all */
  clearSelection: () => void
  /** Indica si la tabla está funcionando en modo infinite scroll */
  isInfiniteScroll?: boolean
}

export interface HistoryDetail {
  field: string
  oldValue?: string | number
  newValue?: string | number
}

export interface HistoryEntry {
  id: string
  action: "create" | "update" | "delete"
  description: string
  actorEmail: string
  createdAt: string
  details?: HistoryDetail[]
}
