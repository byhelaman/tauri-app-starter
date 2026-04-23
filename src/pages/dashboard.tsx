import { useState } from "react"
import { CalendarDaysIcon } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"

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

import { ACTIVITY, STATS, UPCOMING } from "@/mocks/dashboard"

export function DashboardPage() {
  const { user } = useAuth()
  const [crash, setCrash] = useState(false)

  if (crash) return <ThrowError />

  return (
    <main className="flex flex-col flex-1 p-6 w-full gap-6">
      <PageHeader title="Welcome back!" description={`Signed in as ${user?.email}`} />
      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>Your starter template is ready.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Start building your app here. Remove this card when you no longer need it.
          </p>
          <Button variant="destructive" size="sm" className="mt-3" onClick={() => setCrash(true)}>
            [Demo] Throw error
          </Button>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Statistics</h2>
          <span className="text-xs text-muted-foreground">Last 7 days</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STATS.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.label}>
                <CardHeader className="pb-2">
                  <CardDescription>{stat.label}</CardDescription>
                  <CardTitle className="text-2xl font-mono">{stat.value}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3 pt-0">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{stat.detail}</span>
                    <Badge
                      variant={stat.tone === "warning" ? "destructive" : stat.tone === "positive" ? "secondary" : "outline"}
                      className="w-fit"
                    >
                      {stat.change}
                    </Badge>
                  </div>
                  <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Latest team actions</CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {ACTIVITY.map((a, i) => {
                const Icon = a.icon
                return (
                  <Item key={i} size="sm">
                    <ItemMedia>
                      <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="text-sm font-normal">
                        <span className="font-medium">{a.user}</span>
                        <span className="text-muted-foreground"> {a.action} </span>
                        <span className="font-medium">{a.target}</span>
                      </ItemTitle>
                      <ItemDescription>{a.time}</ItemDescription>
                    </ItemContent>
                  </Item>
                )
              })}
            </ItemGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
            <CardDescription>Scheduled events and deadlines</CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {UPCOMING.map((u, i) => (
                <Item key={i} size="sm">
                  <ItemMedia>
                    <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                      <CalendarDaysIcon className="size-4 text-muted-foreground" />
                    </div>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{u.title}</ItemTitle>
                    <ItemDescription>{u.description}</ItemDescription>
                  </ItemContent>
                  <ItemActions className="flex-col items-end gap-1">
                    <Badge variant="outline">{u.tag}</Badge>
                    <span className="text-xs text-muted-foreground">{u.when}</span>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
