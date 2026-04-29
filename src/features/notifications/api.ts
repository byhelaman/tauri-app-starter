import { infiniteQueryOptions } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

// Types

export interface AppNotification {
  id:        number
  title:     string
  body:      string
  type:      "info" | "success" | "warning"
  read:      boolean
  createdAt: string
}

interface RpcNotification {
  id:         number
  title:      string
  body:       string
  type:       string
  read:       boolean
  created_at: string
}

// Constantes

export const NOTIFICATIONS_PAGE_SIZE = 20

// Opciones de query (fuente única de verdad)
// Tanto app-layout.tsx como notifications-modal.tsx DEBEN usar esto para
// garantizar el mismo queryKey y shape de datos. Mezclar queryFn con
// shapes distintos en el mismo key provoca "Invalid Date" y
// ".filter is not a function" en tiempo de ejecución.

export const notificationsQueryOptions = infiniteQueryOptions({
  queryKey: ["notifications"] as const,
  queryFn: async ({ pageParam = 0 }) => {
    if (!supabase) return [] as AppNotification[]
    const { data, error } = await supabase.rpc("get_my_notifications", {
      p_limit:  NOTIFICATIONS_PAGE_SIZE,
      p_offset: pageParam as number,
    })
    if (error) throw new Error(error.message)
    return ((data ?? []) as RpcNotification[]).map((n): AppNotification => ({
      id:        n.id,
      title:     n.title,
      body:      n.body,
      type:      n.type as AppNotification["type"],
      read:      n.read,
      createdAt: n.created_at, // mapeo snake_case → camelCase
    }))
  },
  initialPageParam: 0,
  getNextPageParam: (lastPage, allPages) => {
    // Si la página tiene menos items que el límite, no hay más páginas
    if (lastPage.length < NOTIFICATIONS_PAGE_SIZE) return undefined
    return allPages.length * NOTIFICATIONS_PAGE_SIZE
  },
  enabled: !!supabase,
})

