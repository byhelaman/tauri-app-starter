import { useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { BellIcon, CheckCheckIcon, XIcon } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
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

interface Notification {
  id: number
  title: string
  body: string
  type: "info" | "success" | "warning"
  read: boolean
  createdAt: string
}

interface RpcNotification {
  id: number
  title: string
  body: string
  type: string
  read: boolean
  created_at: string
}

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

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "yesterday"
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

interface NotificationsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUnreadCountChange?: (count: number) => void
}

export function NotificationsModal({ open, onOpenChange, onUnreadCountChange }: NotificationsModalProps) {
  const queryClient = useQueryClient()

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      if (!supabase) return []
      const { data, error } = await supabase.rpc("get_my_notifications", { p_limit: 50 })
      if (error) throw error
      return ((data ?? []) as RpcNotification[]).map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type as Notification["type"],
        read: n.read,
        createdAt: n.created_at,
      }))
    },
    enabled: !!supabase,
  })

  const unreadCount = notifications.filter((n) => !n.read).length

  // Sincronización del contador hacia el padre (badge del sidebar/navbar)
  useEffect(() => {
    onUnreadCountChange?.(unreadCount)
  }, [unreadCount, onUnreadCountChange])

  // Realtime subscription — Actualización reactiva basada en invalidación
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
          // Invalidamos la cache para que React Query refresque los datos de forma limpia
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
      const previous = queryClient.getQueryData<Notification[]>(["notifications"])
      queryClient.setQueryData<Notification[]>(["notifications"], (old) => 
        old?.map(n => ({ ...n, read: true }))
      )
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
      const previous = queryClient.getQueryData<Notification[]>(["notifications"])
      queryClient.setQueryData<Notification[]>(["notifications"], (old) => 
        old?.map(n => n.id === id ? { ...n, read: true } : n)
      )
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
      const previous = queryClient.getQueryData<Notification[]>(["notifications"])
      queryClient.setQueryData<Notification[]>(["notifications"], (old) => 
        old?.filter(n => n.id !== id)
      )
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
    const title = "Test notification"
    const body = "This came from the OS notification system."
    await sendOsNotification(title, body)
    // Para tests, simplemente invalidamos para ver si llega algo nuevo (si el RPC lo creara)
    // Opcionalmente podríamos añadirlo manualmente a la cache, pero invalidar es más limpio.
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
          {notifications.length === 0 && !isLoading ? (
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
