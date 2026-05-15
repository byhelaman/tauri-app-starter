import { useCallback, useMemo, useState } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnFiltersState, SortingState, Updater } from "@tanstack/react-table"
import { toast } from "sonner"
import * as api from "../api"

const ORDER_CHUNK = 1000

export function useDeletedOrders({
  sorting = [],
  enabled = true,
}: {
  sorting?: SortingState
  enabled?: boolean
} = {}) {
  const queryClient = useQueryClient()
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  const handleSetColumnFilters = useCallback((updater: Updater<ColumnFiltersState>) => {
    setColumnFilters(prev => typeof updater === "function" ? updater(prev) : updater)
  }, [])

  const handleSetGlobalFilter = useCallback((updater: Updater<string>) => {
    setGlobalFilter(prev => typeof updater === "function" ? updater(prev) : updater)
  }, [])

  const deletedOrdersQueryKey = useMemo(
    () => ["orders", "trash", "infinite", columnFilters, globalFilter, sorting] as const,
    [columnFilters, globalFilter, sorting]
  )

  const {
    data: infiniteData,
    isLoading: isPageLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: deletedOrdersQueryKey,
    queryFn: ({ pageParam = 0 }) => api.fetchDeletedOrders({
      limit: ORDER_CHUNK,
      offset: pageParam as number,
      search: globalFilter,
      filters: columnFilters,
      sorting,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.data.length < ORDER_CHUNK) return undefined
      return allPages.length * ORDER_CHUNK
    },
    enabled,
  })

  const pages = infiniteData?.pages
  const pageData = useMemo(() => pages?.flatMap(p => p.data) ?? [], [pages])
  const cachedRowCount = useMemo(() => pages?.[pages.length - 1]?.total ?? 0, [pages])

  const { data: unfilteredCountData } = useQuery({
    queryKey: ["orders", "trash", "unfiltered-count"],
    queryFn: () => api.fetchDeletedOrders({ limit: 1, offset: 0 }),
    staleTime: 60_000,
    enabled,
  })

  const emptyTrashMutation = useMutation({
    mutationFn: api.emptyOrdersTrash,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "trash"] })
      queryClient.invalidateQueries({ queryKey: ["orders", "trash", "unfiltered-count"] })
      queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
      queryClient.invalidateQueries({ queryKey: ["orders", "deleted", "startHours"] })
      toast.success(`Emptied trash: ${count.toLocaleString()} orders permanently deleted`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not empty trash")
    },
  })

  const removeDeletedOrderMutation = useMutation({
    mutationFn: api.removeDeletedOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", "trash"] })
      queryClient.invalidateQueries({ queryKey: ["orders", "trash", "unfiltered-count"] })
      queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
      queryClient.invalidateQueries({ queryKey: ["orders", "deleted", "startHours"] })
      toast.success("Order removed from trash")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not remove order")
    },
  })

  const refreshCurrentOrderSort = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: deletedOrdersQueryKey })
  }, [deletedOrdersQueryKey, queryClient])

  return {
    pageData,
    rowCount: cachedRowCount,
    isPageLoading,
    infiniteScroll: {
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
      totalRowCount: cachedRowCount,
      unfilteredTotalRowCount: unfilteredCountData?.total ?? cachedRowCount,
      currentScope: {
        search: globalFilter,
        filters: columnFilters,
        sorting,
      },
    },
    columnFilters,
    setColumnFilters: handleSetColumnFilters,
    globalFilter,
    setGlobalFilter: handleSetGlobalFilter,
    refreshCurrentOrderSort,
    actions: {
      emptyTrash: emptyTrashMutation.mutateAsync,
      removeDeletedOrder: removeDeletedOrderMutation.mutateAsync,
    },
    isPending: emptyTrashMutation.isPending || removeDeletedOrderMutation.isPending,
  }
}
