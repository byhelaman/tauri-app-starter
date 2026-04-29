import { useEffect, useMemo } from "react"
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { notificationsQueryOptions, type AppNotification } from "@/features/notifications/api"
import { toast } from "sonner"
import { BellIcon, CheckCheckIcon, XIcon, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { formatRelativeTime } from "@/lib/date-utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
} from "@/components/ui/item"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"


const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function sendOsNotification(title: string, body: string) {
  if (!isTauri) return
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    )
    let granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === "granted"
    if (granted) sendNotification({ title, body })
  } catch (err) {
    console.error("Notification failed", err)
  }
}



interface NotificationsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Local type for Realtime payload (snake_case from Postgres)
interface RpcNotification { id: number; title: string; body: string; created_at: string }

export function NotificationsModal({ open, onOpenChange }: NotificationsModalProps) {
  const queryClient = useQueryClient()

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(notificationsQueryOptions)

  const notifications = useMemo(() => data?.pages.flat() ?? [], [data])
  const unreadCount = notifications.filter((n) => !n.read).length


  // Realtime: actualiza la cache en INSERT (nuevas), UPDATE (leídas) y DELETE (descartadas)
  useEffect(() => {
    if (!supabase) return

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const row = payload.new as RpcNotification
          // Notificación al SO
          void sendOsNotification(row.title, row.body)
          void queryClient.invalidateQueries({ queryKey: ["notifications"] })
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        () => {
          // Mantiene el badge sincronizado cuando se marca como leída en otra pestaña
          void queryClient.invalidateQueries({ queryKey: ["notifications"] })
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications" },
        () => {
          // Elimina la notificación descartada en otra pestaña
          void queryClient.invalidateQueries({ queryKey: ["notifications"] })
        }
      )

    channel.subscribe()
    return () => { void supabase!.removeChannel(channel) }
  }, [queryClient])

  // Mutaciones con actualizaciones optimistas para una UI instantánea
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!supabase) return
      const { error } = await supabase.rpc("mark_all_notifications_read")
      if (error) throw error
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] })
      const previous = queryClient.getQueryData<InfiniteData<AppNotification[]>>(["notifications"])
      queryClient.setQueryData<InfiniteData<AppNotification[]>>(["notifications"], (old) => {
        if (!old) return old
        return { ...old, pages: old.pages.map(page => page.map(n => ({ ...n, read: true }))) }
      })
      return { previous }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(["notifications"], context?.previous)
      toast.error("Failed to mark all as read")
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
    }
  })

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!supabase) return
      const { error } = await supabase.rpc("mark_notification_read", { p_id: id })
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] })
      const previous = queryClient.getQueryData<InfiniteData<AppNotification[]>>(["notifications"])
      queryClient.setQueryData<InfiniteData<AppNotification[]>>(["notifications"], (old) => {
        if (!old) return old
        return { ...old, pages: old.pages.map(page => page.map(n => n.id === id ? { ...n, read: true } : n)) }
      })
      return { previous }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(["notifications"], context?.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
    }
  })

  const dismissMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!supabase) return
      const { error } = await supabase.rpc("dismiss_notification", { p_id: id })
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] })
      const previous = queryClient.getQueryData<InfiniteData<AppNotification[]>>(["notifications"])
      queryClient.setQueryData<InfiniteData<AppNotification[]>>(["notifications"], (old) => {
        if (!old) return old
        return { ...old, pages: old.pages.map(page => page.filter(n => n.id !== id)) }
      })
      return { previous }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(["notifications"], context?.previous)
      toast.error("Failed to dismiss notification")
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
    }
  })

  async function sendTest() {
    if (!import.meta.env.DEV) return
    const title = "Test notification"
    const body = "This came from the OS notification system."
    await sendOsNotification(title, body)
    void queryClient.invalidateQueries({ queryKey: ["notifications"] })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <div className="flex flex-col gap-2">
              <DialogTitle>Notifications</DialogTitle>
              <DialogDescription>
                {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
              </DialogDescription>
            </div>
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                <CheckCheckIcon />
                Mark all read
              </Button>
            )}
          </div>
        </DialogHeader>

        <DialogBody className="mt-1 py-1">
          {isLoading ? (
            <ItemGroup>
              {Array.from({ length: 4 }).map((_, i) => (
                <Item key={i} size="sm">
                  <ItemMedia variant="icon">
                    <Skeleton className="size-8 rounded-md" />
                  </ItemMedia>
                  <ItemContent className="space-y-1 py-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </ItemContent>
                  <ItemActions>
                    <Skeleton className="h-3 w-10" />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          ) : notifications.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BellIcon />
                </EmptyMedia>
                <EmptyTitle>No notifications</EmptyTitle>
                <EmptyDescription>
                  You'll see updates here when something happens.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void queryClient.invalidateQueries({ queryKey: ["notifications"] })}>
                  Refresh
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <ItemGroup>
              {notifications.map((n) => (
                <Item
                  key={n.id}
                  size="sm"
                  variant={n.read ? "default" : "muted"}
                  className={cn("cursor-pointer", !n.read && "hover:bg-muted/70")}
                  onClick={() => !n.read && markReadMutation.mutate(n.id)}
                >
                  <ItemMedia variant="icon">
                    <BellIcon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      {n.title}
                      {!n.read && <span className="size-1.5 rounded-full bg-amber-400" />}
                    </ItemTitle>
                    <ItemDescription>{n.body}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Dismiss notification"
                      disabled={dismissMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        dismissMutation.mutate(n.id)
                      }}
                    >
                      <XIcon />
                    </Button>
                  </ItemActions>
                </Item>
              ))}
              {hasNextPage && (
                <div className="w-full flex justify-center py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground gap-2"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : "Load more"}
                  </Button>
                </div>
              )}
            </ItemGroup>
          )}
        </DialogBody>

        {import.meta.env.DEV && (
          <DialogFooter>
            <Button variant="outline" onClick={() => void sendTest()}>
              Send test notification
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
