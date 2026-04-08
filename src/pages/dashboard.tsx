import { useAuth } from "@/contexts/auth-context"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const ACTIVITY = [
  { user: "alex@company.com", action: "pushed to", target: "main", time: "2m ago" },
  { user: "sara@company.com", action: "opened PR in", target: "mobile-app", time: "18m ago" },
  { user: "john@company.com", action: "closed issue in", target: "api", time: "1h ago" },
  { user: "alex@company.com", action: "commented on", target: "design-system", time: "3h ago" },
  { user: "sara@company.com", action: "merged PR in", target: "website", time: "5h ago" },
]

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <main className="flex-1 p-6 max-w-4xl w-full space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Latest team actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ACTIVITY.map((a, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <div className="mt-1.5 size-1.5 rounded-full bg-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="leading-snug">
                  <span className="font-medium">{a.user.split("@")[0]}</span>
                  <span className="text-muted-foreground"> {a.action} </span>
                  <span className="font-medium">{a.target}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.time}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  )
}
