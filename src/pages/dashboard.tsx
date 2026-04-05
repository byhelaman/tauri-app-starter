import { useAuth } from "@/contexts/auth-context"
import { UserNav } from "@/components/user-nav"
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

  return (
    <div className="flex min-h-svh flex-col">
      <header className="px-6 py-2 flex items-center gap-6">
        <nav className="flex items-center gap-1 flex-1">
          {NAV_ITEMS.map((label) => (
            <Button key={label} variant="ghost">
              {label}
            </Button>
          ))}
        </nav>
        <UserNav />
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
    </div>
  )
}
