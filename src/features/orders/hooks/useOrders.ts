import { useCallback, useState } from "react"
import { useInfiniteQuery, useQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { type ColumnFiltersState, type Updater } from "@tanstack/react-table"
import { toast } from "sonner"
import * as api from "../api"
import type { Order, EditableOrderField, Status } from "../columns"
import type { QueueOrder, QueueStatus } from "../modal-columns"
import { useOrdersRealtime } from "./useOrdersRealtime"

/** Número de filas por chunk en modo infinite scroll */
const ORDER_CHUNK = 100

export function useOrders({ dateFilter }: { dateFilter?: string } = {}) {
  const queryClient = useQueryClient()
  useOrdersRealtime()
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  // Resetea los filtros sin necesidad de resetear una página (ya no hay paginación)
  const handleSetColumnFilters = useCallback((updater: Updater<ColumnFiltersState>) => {
    setColumnFilters(prev => typeof updater === "function" ? updater(prev) : updater)
  }, [])

  const handleSetGlobalFilter = useCallback((updater: Updater<string>) => {
    setGlobalFilter(prev => typeof updater === "function" ? updater(prev) : updater)
  }, [])

  // Clave de query — incluye filtros para que al cambiar se refetche desde chunk 0
  const ordersQueryKey = ["orders", "infinite", columnFilters, globalFilter, dateFilter]

  const {
    data: infiniteData,
    isFetching: isPageFetching,
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
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Si la última página está llena, puede haber más
      if (lastPage.data.length < ORDER_CHUNK) return undefined
      return allPages.length * ORDER_CHUNK
    },
    enabled: true,
  })

  // Aplana todas las páginas en un único array para la DataTable
  const pageData = infiniteData?.pages.flatMap(p => p.data) ?? []
  // Usa el total de la última página cargada — es el más reciente del servidor
  const cachedRowCount = infiniteData?.pages[infiniteData.pages.length - 1]?.total ?? 0

  // TODO: Activar suscripción realtime de órdenes cuando las tablas de Supabase estén listas

  const { data: queueData, isLoading: isQueueLoading } = useQuery({
    queryKey: ["queueOrders"],
    queryFn: api.fetchQueueOrders,
    enabled: true,
  })

  const queueOrders = queueData?.data ?? []
  const totalQueueOrders = queueData?.total ?? 0

  // ── Order update mutation con rollback por entidad ────────────────────
  const updateOrderMutation = useMutation({
    mutationFn: api.updateOrder,
    onMutate: async (delta) => {
      await queryClient.cancelQueries({ queryKey: ordersQueryKey })
      const previous = queryClient.getQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey)
      // Parche optimista: actualiza la entidad en todas las páginas
      queryClient.setQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            data: page.data.map(o => o.id === delta.id ? { ...o, ...delta } : o)
          }))
        }
      })
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", "stats"] })
      queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, _delta, context) => {
      if (context?.previous) queryClient.setQueryData(ordersQueryKey, context.previous)
      toast.error("Failed to update order")
    },
  })

  // ── Order create mutation ─────────────────────────────────────────────
  const createOrderMutation = useMutation({
    mutationFn: api.createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
      toast.success("Order created successfully")
    },
    onError: () => {
      toast.error("Failed to create order")
    }
  })

  // ── Order delete mutation con rollback por entidad ────────────────────
  const deleteOrderMutation = useMutation({
    mutationFn: api.deleteOrder,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ordersQueryKey })
      const previous = queryClient.getQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey)
      queryClient.setQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map(page => {
            const hadOrder = page.data.some(o => o.id === id)
            return {
              data: page.data.filter(o => o.id !== id),
              total: hadOrder ? page.total - 1 : page.total,
            }
          })
        }
      })
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(ordersQueryKey, context.previous)
      toast.error("Failed to delete order")
    },
  })

  // ── Bulk delete mutation con rollback ─────────────────────────────────
  const deleteBulkOrdersMutation = useMutation({
    mutationFn: api.bulkDeleteOrders,
    onMutate: async (ids) => {
      const idSet = new Set(ids)
      await queryClient.cancelQueries({ queryKey: ordersQueryKey })
      const previous = queryClient.getQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey)
      queryClient.setQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map(page => {
            const removedCount = page.data.filter(o => idSet.has(o.id)).length
            return {
              data: page.data.filter(o => !idSet.has(o.id)),
              total: page.total - removedCount,
            }
          })
        }
      })
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(ordersQueryKey, context.previous)
      toast.error("Failed to delete orders")
    },
  })

  // ── Bulk delete por filtro — elimina TODAS las filas que coinciden con los filtros
  //    activos en el servidor, sin necesidad de cargar los IDs en el cliente.
  //    Ideal para datasets grandes con infinite scroll.
  const deleteBulkOrdersByFilterMutation = useMutation({
    mutationFn: (excludedIds: string[] = []) => api.bulkDeleteOrdersByFilter({
      search:  globalFilter,
      filters: columnFilters,
      date:    dateFilter,
      excludedIds,
    }),
    onSuccess: (deletedCount) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
      toast.success(`${deletedCount} orders deleted`)
    },
    onError: () => {
      toast.error("Failed to delete orders")
    },
  })

  // ── Queue order update mutation with entity-level rollback ────────────
  const updateQueueOrderMutation = useMutation({
    mutationFn: api.updateQueueOrder,
    onMutate: async (delta) => {
      await queryClient.cancelQueries({ queryKey: ["queueOrders"] })
      const previousOrder = queryClient.getQueryData<QueueOrder[]>(["queueOrders"])
        ?.find(o => o.code === delta.code)
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) =>
        old.map(o => o.code === delta.code ? { ...o, ...delta } : o)
      )
      return { previousOrder }
    },
    onError: (_err, delta, context) => {
      if (!context?.previousOrder) return
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) =>
        old.map(o => o.code === delta.code ? context.previousOrder! : o)
      )
    },
  })

  // ── Queue order delete mutation with entity-level rollback ────────────
  const deleteQueueOrderMutation = useMutation({
    mutationFn: api.deleteQueueOrder,
    onMutate: async (code) => {
      await queryClient.cancelQueries({ queryKey: ["queueOrders"] })
      const previousOrder = queryClient.getQueryData<QueueOrder[]>(["queueOrders"])
        ?.find(o => o.code === code)
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) =>
        old.filter(order => order.code !== code)
      )
      return { previousOrder }
    },
    onError: (_err, _code, context) => {
      if (!context?.previousOrder) return
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) =>
        [...old, context.previousOrder!]
      )
    },
  })

  const { mutate: doUpdateOrder } = updateOrderMutation
  const { mutate: doUpdateQueue } = updateQueueOrderMutation
  const { mutate: doDeleteQueue } = deleteQueueOrderMutation
  const { mutate: doDeleteOrder } = deleteOrderMutation
  const { mutate: doBulkDelete } = deleteBulkOrdersMutation

  // Delta mutation helper — only sends the changed fields to the server
  const updateOrderField = useCallback((orderId: string, delta: Partial<Order>) => {
    doUpdateOrder({ id: orderId, ...delta })
  }, [doUpdateOrder])

  const handleStatusChange = useCallback((orderId: string, status: Status) => {
    updateOrderField(orderId, { status })
  }, [updateOrderField])

  // Handles inline cell edits with an exhaustive switch over EditableOrderField.
  // If a new field is added to the union but not handled here, TypeScript will
  // produce a compile error on the `never` assignment in the default branch.
  const handleCellChange = useCallback((orderId: string, field: EditableOrderField, value: string, isValid: boolean) => {
    let delta: Partial<Order>
    switch (field) {
      case "date": delta = { date: value }; break
      case "customer": delta = { customer: value }; break
      case "product": delta = { product: value }; break
      case "category": delta = { category: value }; break
      case "start_time": delta = { start_time: value }; break
      case "end_time": delta = { end_time: value }; break
      case "code": delta = { code: value }; break
      case "channel": delta = { channel: value }; break
      case "priority": delta = { priority: value }; break
      case "region": delta = { region: value }; break
      case "payment": delta = { payment: value }; break
      case "quantity": {
        const normalized = value.trim()
        delta = { quantity: isValid ? Number.parseInt(normalized, 10) : value }
        break
      }
      default: {
        const _exhaustive: never = field
        console.warn(`Unhandled editable field: ${_exhaustive}`)
        return
      }
    }
    updateOrderField(orderId, delta)
  }, [updateOrderField])

  const handleQueueStatusChange = useCallback((code: string, status: QueueStatus) => {
    doUpdateQueue({ code, status })
  }, [doUpdateQueue])

  const handleQueuePriorityToggle = useCallback((code: string) => {
    const currentOrders = queryClient.getQueryData<QueueOrder[]>(["queueOrders"]) || []
    const order = currentOrders.find(o => o.code === code)
    if (order) {
      doUpdateQueue({ code, priority: !order.priority })
    }
  }, [queryClient, doUpdateQueue])

  const handleQueueRemove = useCallback((code: string) => {
    doDeleteQueue(code)
    toast.success("Removed from queue")
  }, [doDeleteQueue])

  const deleteOrder = useCallback((id: string) => {
    doDeleteOrder(id)
  }, [doDeleteOrder])

  const deleteBulkOrders = useCallback((ids: string[]) => {
    doBulkDelete(ids)
  }, [doBulkDelete])

  const deleteBulkOrdersByFilter = useCallback((excludedIds: string[] = []) => {
    deleteBulkOrdersByFilterMutation.mutate(excludedIds)
  }, [deleteBulkOrdersByFilterMutation])

  return {
    pageData,
    rowCount: cachedRowCount,
    isPageLoading: isPageFetching,
    // Props para infinite scroll en DataTable
    infiniteScroll: {
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
      totalRowCount: cachedRowCount,
      // Obtiene TODAS las filas del servidor vía RPC dedicada
      fetchAllByFilter: async (): Promise<Record<string, unknown>[]> => {
        // Si el total aún no está disponible (primera carga no completada), no hay filas que retornar
        if (!cachedRowCount) return []
        const rows = await api.fetchAllOrdersByFilter({
          search:     globalFilter,
          filters:    columnFilters,
          date:       dateFilter,
        })
        return rows as unknown as Record<string, unknown>[]
      },
      // Obtiene SOLO los IDs de TODAS las filas filtradas
      fetchAllIdsByFilter: async (overrideSearch?: string, overrideFilters?: any[]): Promise<string[]> => {
        const rows = await api.fetchAllOrdersByFilter({
          search:     overrideSearch ?? globalFilter,
          filters:    (overrideFilters as ColumnFiltersState) ?? columnFilters,
          date:       dateFilter,
        })
        return rows.map(r => r.id)
      },

    },

    columnFilters,
    setColumnFilters: handleSetColumnFilters,
    globalFilter,
    setGlobalFilter: handleSetGlobalFilter,
    queueOrders,
    totalQueueOrders,
    isQueueLoading,
    actions: {
      createOrder: createOrderMutation.mutate,
      deleteOrder,
      deleteBulkOrders,
      deleteBulkOrdersByFilter,
      handleStatusChange,
      handleCellChange,
      handleQueueStatusChange,
      handleQueuePriorityToggle,
      handleQueueRemove,
    },
    isPending: updateOrderMutation.isPending || createOrderMutation.isPending || deleteOrderMutation.isPending || deleteBulkOrdersMutation.isPending || deleteBulkOrdersByFilterMutation.isPending
  }
}
