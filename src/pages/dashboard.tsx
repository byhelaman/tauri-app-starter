import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { BellIcon } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { UserNav } from "@/components/user-nav"
import { CommandPalette } from "@/components/command-palette"
import { NotificationsModal, DEMO_NOTIFICATIONS } from "@/components/notifications-modal"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const NAV_ITEMS = ["Dashboard", "Projects", "Team", "Analytics"]

export function DashboardPage() {
  const { user } = useAuth()
  const [version, setVersion] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(() => DEMO_NOTIFICATIONS.filter((n) => !n.read).length)

  useEffect(() => {
    getVersion().then(setVersion).catch(() => null)
  }, [])

  return (
    <div className="flex min-h-svh flex-col">
      <header className="px-4 py-2 flex items-center gap-6">
        <nav className="flex items-center gap-1 flex-1">
          {NAV_ITEMS.map((label) => (
            <Button key={label} variant="ghost">
              {label}
            </Button>
          ))}
        </nav>
        <CommandPalette />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative" onClick={() => setNotificationsOpen(true)}>
            <BellIcon />
            {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />}
          </Button>
          <UserNav onOpenNotifications={() => setNotificationsOpen(true)} />
        </div>
      </header>
      <main className="flex-1 p-6 max-w-4xl w-full">
        <Card>
          <CardHeader>
            <CardTitle>Welcome back!</CardTitle>
            <CardDescription>Signed in as {user?.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your starter template is ready. Start building here.
            </p>
          </CardContent>
        </Card>
      </main>
      <NotificationsModal open={notificationsOpen} onOpenChange={setNotificationsOpen} onUnreadCountChange={setUnreadCount} />
      {version && (
        <footer className="px-6 py-3 text-xs text-muted-foreground text-right">
          v{version}
        </footer>
      )}
    </div>
  )
}
