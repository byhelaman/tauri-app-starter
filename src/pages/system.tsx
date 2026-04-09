import { CheckCircle2Icon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const RECENT_ACTIVITY = [
  { description: "User john@example.com role updated to admin", time: "2m ago" },
  { description: "New user sara@example.com registered", time: "1h ago" },
  { description: "Permission matrix updated by super_admin", time: "3h ago" },
  { description: "Database backup completed successfully", time: "6h ago" },
]

export function SystemPage() {
  return (
    <main className="flex-1 p-6 space-y-6">
      <PageHeader title="System" description="Manage users, roles, and system configuration." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* User Management */}
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>View and manage user accounts and their roles.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-3xl font-semibold">—</p>
            </div>
            <Button variant="outline">Manage Users</Button>
          </CardContent>
        </Card>

        {/* Database Status */}
        <Card>
          <CardHeader>
            <CardTitle>Database Status</CardTitle>
            <CardDescription>Supabase connection and database health.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-green-500">
              <CheckCircle2Icon className="size-4" />
              Connected
            </div>
            <div className="grid grid-cols-2 text-sm gap-y-1">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-medium">Supabase</span>
              <span className="text-muted-foreground">Region</span>
              <span className="font-medium">—</span>
            </div>
          </CardContent>
        </Card>

        {/* Roles & Permissions */}
        <Card>
          <CardHeader>
            <CardTitle>Roles & Permissions</CardTitle>
            <CardDescription>Configure role hierarchies and permission assignments.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {["super_admin", "admin", "member", "guest"].map((role) => (
                <Badge key={role} variant="secondary" className="font-mono">{role}</Badge>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="outline">Manage Roles</Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>System events and audit log.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {RECENT_ACTIVITY.map((item, i) => (
                <li key={i} className="flex items-start justify-between gap-4 py-2 text-sm">
                  <span>{item.description}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
