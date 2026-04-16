import { useCallback, useEffect, useState } from "react"
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
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    onUnreadCountChange?.(unreadCount)
  }, [unreadCount, onUnreadCountChange])

  const fetchNotifications = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc("get_my_notifications", { p_limit: 50 })
      if (error) throw error
      setNotifications(
        ((data ?? []) as RpcNotification[]).map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          type: n.type as Notification["type"],
          read: n.read,
          createdAt: n.created_at,
        }))
      )
    } catch (err) {
      console.error("Failed to fetch notifications", err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on open
  useEffect(() => {
    if (open) void fetchNotifications()
  }, [open, fetchNotifications])

  // Realtime subscription — always active to keep badge updated
  useEffect(() => {
    if (!supabase) return

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const row = payload.new as RpcNotification
          const notification: Notification = {
            id: row.id,
            title: row.title,
            body: row.body,
            type: row.type as Notification["type"],
            read: row.read,
            createdAt: row.created_at,
          }
          setNotifications((prev) => [notification, ...prev])
          void sendOsNotification(notification.title, notification.body)
        }
      )

    channel.subscribe()
    return () => { void supabase!.removeChannel(channel) }
  }, [])

  // Periodic refresh (every 60s) for badge accuracy
  useEffect(() => {
    if (!supabase) return
    const interval = setInterval(() => void fetchNotifications(), 60_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  async function markAllRead() {
    if (!supabase) return
    const { error } = await supabase.rpc("mark_all_notifications_read")
    if (error) { toast.error(error.message); return }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  async function markRead(id: number) {
    if (!supabase) return
    const { error } = await supabase.rpc("mark_notification_read", { p_id: id })
    if (error) { toast.error(error.message); return }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  async function dismiss(id: number) {
    if (!supabase) return
    const { error } = await supabase.rpc("dismiss_notification", { p_id: id })
    if (error) { toast.error(error.message); return }
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  async function sendTest() {
    const title = "Test notification"
    const body = "This came from the OS notification system."
    await sendOsNotification(title, body)
    setNotifications((prev) => [
      { id: Date.now(), title, body, type: "info", read: false, createdAt: new Date().toISOString() },
      ...prev,
    ])
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
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                <CheckCheckIcon />
                Mark all read
              </Button>
            )}
          </div>
        </DialogHeader>

        <DialogBody className="mt-1 p-1">
          {notifications.length === 0 ? (
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
            </Empty>
          ) : (
            <ItemGroup>
              {notifications.map((n) => (
                <Item
                  key={n.id}
                  size="sm"
                  variant={n.read ? "default" : "muted"}
                  className={cn("cursor-pointer", !n.read && "hover:bg-muted/70")}
                  onClick={() => void markRead(n.id)}
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
                      onClick={(e) => {
                        e.stopPropagation()
                        void dismiss(n.id)
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
