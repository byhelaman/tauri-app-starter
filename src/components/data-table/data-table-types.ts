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
   * Usado por Export/Copy/Bulk Copy.
   */
  fetchAllByFilter?: () => Promise<Record<string, unknown>[]>
  /**
   * Obtiene SOLO los IDs de TODAS las filas que coinciden con los filtros actuales.
   * Usado para "Select All" y para calcular intersecciones en modo infinito.
   */
  fetchAllIdsByFilter?: (globalFilter?: string, columnFilters?: any[]) => Promise<string[]>
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
  isSelectingAll?: boolean
  /** Cantidad de filas seleccionadas que coinciden con el filtro actual */
  visibleSelectedCount?: number
  /** Cantidad total de filas en el filtro actual */
  totalRowCount?: number
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
