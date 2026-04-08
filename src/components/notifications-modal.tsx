import { useEffect, useState } from "react"
import { CheckCheckIcon, ShieldCheckIcon, UserPlusIcon, XIcon, ZapIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { cn } from "@/lib/utils"

type NotificationIcon = typeof ShieldCheckIcon

interface Notification {
  id: number
  icon: NotificationIcon
  title: string
  body: string
  time: string
  read: boolean
}

export const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    icon: ShieldCheckIcon,
    title: "Security update",
    body: "A new version with security patches is available.",
    time: "2m ago",
    read: false,
  },
  {
    id: 2,
    icon: UserPlusIcon,
    title: "New team member",
    body: "alex@company.com joined the workspace.",
    time: "1h ago",
    read: false,
  },
  {
    id: 3,
    icon: ZapIcon,
    title: "Usage limit",
    body: "You've used 80% of your monthly quota.",
    time: "3h ago",
    read: true,
  },
  {
    id: 4,
    icon: CheckCheckIcon,
    title: "All tasks completed",
    body: "Your scheduled tasks finished successfully.",
    time: "Yesterday",
    read: true,
  },
]

interface NotificationsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUnreadCountChange?: (count: number) => void
}

export function NotificationsModal({ open, onOpenChange, onUnreadCountChange }: NotificationsModalProps) {
  const [notifications, setNotifications] = useState(DEMO_NOTIFICATIONS)
  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    onUnreadCountChange?.(unreadCount)
  }, [unreadCount, onUnreadCountChange])

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  function markRead(id: number) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }

  function dismiss(id: number) {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
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
              <Button variant="ghost" size="sm" className="text-xs" onClick={markAllRead}>
                Mark all read
              </Button>
            )}
          </div>
        </DialogHeader>

        {notifications.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No notifications.
          </p>
        ) : (
          <ItemGroup>
            {notifications.map((n) => {
              const Icon = n.icon
              return (
                <Item
                  key={n.id}
                  size="sm"
                  variant={n.read ? "default" : "muted"}
                  className={cn("cursor-pointer", !n.read && "hover:bg-muted/70")}
                  onClick={() => markRead(n.id)}
                >
                  <ItemMedia variant="icon">
                    <Icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      {n.title}
                      {!n.read && (
                        <span className="size-1.5 rounded-full bg-amber-400" />
                      )}
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
              )
            })}
          </ItemGroup>
        )}
      </DialogContent>
    </Dialog>
  )
}
