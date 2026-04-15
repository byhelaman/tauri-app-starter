import { useEffect, useState } from "react"
import { toast } from "sonner"
import { BellIcon, CheckCheckIcon, XIcon } from "lucide-react"
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
  time: string
  read: boolean
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function sendOsNotification(title: string, body: string) {
  if (!isTauri) {
    toast.info(`${title} — ${body}`)
    return
  }
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    )
    let granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === "granted"
    if (granted) sendNotification({ title, body })
    else toast.error("Notification permission denied")
  } catch (err) {
    console.error("Notification failed", err)
  }
}

interface NotificationsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUnreadCountChange?: (count: number) => void
}

export function NotificationsModal({ open, onOpenChange, onUnreadCountChange }: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    onUnreadCountChange?.(unreadCount)
  }, [unreadCount, onUnreadCountChange])

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  function markRead(id: number) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  function dismiss(id: number) {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  async function sendTest() {
    const title = "Test notification"
    const body = "This came from the OS notification system."
    await sendOsNotification(title, body)
    setNotifications((prev) => [
      { id: Date.now(), title, body, time: "just now", read: false },
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
                  onClick={() => markRead(n.id)}
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
                    <span className="text-xs text-muted-foreground">{n.time}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        dismiss(n.id)
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

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={sendTest}>
            Send test notification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
