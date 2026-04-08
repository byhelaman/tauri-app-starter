import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"

function ThrowError(): never {
  throw new Error(
    "TypeError: Cannot read properties of undefined (reading 'map')\n\n" +
    "The above error occurred in the <DashboardPage> component:\n\n" +
    "    at DashboardPage (src/pages/dashboard.tsx:42:18)\n" +
    "    at RenderedRoute (react-router-dom@7.1.3/dist/index.js:412:5)\n" +
    "    at Routes (react-router-dom@7.1.3/dist/index.js:515:3)\n" +
    "    at AuthGuard (src/components/auth-guard.tsx:12:9)\n" +
    "    at AppLayout (src/components/app-layout.tsx:20:5)\n" +
    "    at BrowserRouter (react-router-dom@7.1.3/dist/index.js:188:3)\n" +
    "    at AuthProvider (src/contexts/auth-context.tsx:8:3)\n" +
    "    at UpdaterProvider (src/components/updater-context.tsx:8:3)\n" +
    "    at ThemeProvider (next-themes@0.4.4/dist/index.js:55:3)\n\n" +
    "Consider adding an error boundary to your tree to customize error handling behavior.\n" +
    "Visit https://reactjs.org/link/error-boundaries to learn more about error boundaries."
  )
}
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
  const [crash, setCrash] = useState(false)

  if (crash) return <ThrowError />

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
          <Button variant="destructive" size="sm" className="mt-3" onClick={() => setCrash(true)}>
            [Demo] Throw error
          </Button>
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
