import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function DashboardPage() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <h1 className="font-semibold text-sm">MyApp</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
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
