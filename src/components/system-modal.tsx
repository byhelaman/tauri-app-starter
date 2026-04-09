import { CheckCircle2Icon, XCircleIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface SystemModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ROLES = [
  { name: "super_admin", level: 100, description: "Full access to all resources" },
  { name: "admin", level: 80, description: "Manage users and content" },
  { name: "member", level: 10, description: "Standard access" },
  { name: "guest", level: 0, description: "Read-only access" },
]

const INTEGRATIONS = [
  { name: "Supabase", description: "Auth and database provider", connected: true },
  { name: "Stripe", description: "Payment processing", connected: false },
  { name: "Resend", description: "Transactional email", connected: false },
]

const AUDIT_LOG = [
  { event: "User role updated to admin", time: "2m ago" },
  { event: "New user registered", time: "1h ago" },
  { event: "Permission matrix updated", time: "3h ago" },
  { event: "Database backup completed", time: "6h ago" },
]

export function SystemModal({ open, onOpenChange }: SystemModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>System</DialogTitle>
          <DialogDescription>Application configuration and administration.</DialogDescription>
        </DialogHeader>

        <DialogBody>
        <Tabs defaultValue="roles">
          <TabsList className="w-full">
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="mt-4">
            <div className="flex flex-col divide-y rounded-lg border text-sm">
              {ROLES.map((role) => (
                <div key={role.name} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <p className="font-medium font-mono">{role.name}</p>
                    <p className="text-xs text-muted-foreground">{role.description}</p>
                  </div>
                  <Badge variant="outline">Level {role.level}</Badge>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="mt-4">
            <div className="flex flex-col divide-y rounded-lg border text-sm">
              {INTEGRATIONS.map((integration) => (
                <div key={integration.name} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {integration.connected
                      ? <CheckCircle2Icon className="size-4 text-green-500 shrink-0" />
                      : <XCircleIcon className="size-4 text-muted-foreground shrink-0" />
                    }
                    <div>
                      <p className="font-medium">{integration.name}</p>
                      <p className="text-xs text-muted-foreground">{integration.description}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    {integration.connected ? "Configure" : "Connect"}
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <div className="flex flex-col divide-y rounded-lg border text-sm">
              {AUDIT_LOG.map((entry, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-3 py-2.5">
                  <span>{entry.event}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{entry.time}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        </DialogBody>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
