import { useCallback, useMemo, useState } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ColumnFiltersState, type Updater, type SortingState } from "@tanstack/react-table"
import * as api from "../api"
import { useOrdersRealtime } from "./useOrdersRealtime"
import { useOrderMutations } from "./useOrderMutations"

/** Número de filas por chunk en modo infinite scroll */
const ORDER_CHUNK = 1000

export function useOrders({
  dateFilter,
  sorting = [],
  queryScope: _queryScope = "orders",
  realtime = true,
  enabled = true,
}: {
  dateFilter?: string
  sorting?: SortingState
  queryScope?: string
  realtime?: boolean
  enabled?: boolean
} = {}) {
  const queryClient = useQueryClient()
  useOrdersRealtime(realtime)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  // Resetea los filtros sin necesidad de resetear una página (ya no hay paginación)
  const handleSetColumnFilters = useCallback((updater: Updater<ColumnFiltersState>) => {
    setColumnFilters(prev => typeof updater === "function" ? updater(prev) : updater)
  }, [])

  const handleSetGlobalFilter = useCallback((updater: Updater<string>) => {
    setGlobalFilter(prev => typeof updater === "function" ? updater(prev) : updater)
  }, [])

  // Clave de query unificada — la caché se comparte si los filtros coinciden
  const ordersQueryKey = useMemo(
    () => ["orders", "infinite", columnFilters, globalFilter, dateFilter, sorting] as const,
    [columnFilters, dateFilter, globalFilter, sorting]
  )

  const {
    data: infiniteData,
    isLoading: isPageLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ordersQueryKey,
    queryFn: ({ pageParam = 0 }) => api.fetchOrders({
      limit:   ORDER_CHUNK,
      offset:  pageParam as number,
      search:  globalFilter,
      filters: columnFilters,
      date:    dateFilter,
      sorting,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Si la última página está llena, puede haber más
      if (lastPage.data.length < ORDER_CHUNK) return undefined
      return allPages.length * ORDER_CHUNK
    },
    enabled,
  })

  const pages = infiniteData?.pages
  // Aplana todas las páginas solo cuando cambia la data del infinite query.
  const pageData = useMemo(() => pages?.flatMap(p => p.data) ?? [], [pages])
  // Usa el total de la última página cargada — es el más reciente del servidor.
  const cachedRowCount = useMemo(() => pages?.[pages.length - 1]?.total ?? 0, [pages])

  const { data: unfilteredCountData } = useQuery({
    queryKey: ["orders", "unfiltered-count"],
    queryFn: () => api.fetchOrders({ limit: 1, offset: 0 }),
    staleTime: 60_000,
    enabled,
  })

  const mutations = useOrderMutations({
    ordersQueryKey,
    activeQuery: {
      filters: columnFilters,
      search: globalFilter,
      date: dateFilter,
    },
  })

  const refreshCurrentOrderSort = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ordersQueryKey })
  }, [queryClient, ordersQueryKey])



  return {
    pageData,
    rowCount: cachedRowCount,
    isPageLoading,
    // Props para infinite scroll en DataTable
    infiniteScroll: {
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
      totalRowCount: cachedRowCount,
      unfilteredTotalRowCount: unfilteredCountData?.total ?? cachedRowCount,
      currentScope: {
        search: globalFilter,
        filters: columnFilters,
        date: dateFilter,
        sorting,
      },
      exportByScope: api.exportOrdersByScope,
      countBySelection: api.countOrdersBySelection,
    },

    columnFilters,
    setColumnFilters: handleSetColumnFilters,
    globalFilter,
    setGlobalFilter: handleSetGlobalFilter,
    refreshCurrentOrderSort,
    actions: {
      createOrder: mutations.createOrder,
      deleteOrder: mutations.deleteOrder,
      deleteBulkOrders: mutations.deleteBulkOrders,
      handleStatusChange: mutations.handleStatusChange,
      handleCellChange: mutations.handleCellChange,
    },
    isPending: mutations.isPending,
  }
}
