import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { useUpdaterContext } from "@/components/updater-context"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldContent,
  FieldGroup,
} from "@/components/ui/field"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function SettingRow({
  id,
  label,
  description,
  defaultChecked = false,
}: {
  id: string
  label: string
  description?: string
  defaultChecked?: boolean
}) {
  const [checked, setChecked] = useState(defaultChecked)
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={setChecked} />
    </Field>
  )
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { checkForUpdates, isChecking } = useUpdaterContext()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your preferences.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="notifications">
          <TabsList className="w-full">
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="application">Application</TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="mt-4">
            <FieldGroup>
              <SettingRow
                id="email-notif"
                label="Email notifications"
                description="Receive updates via email"
                defaultChecked
              />
              <SettingRow
                id="push-notif"
                label="Push notifications"
                description="Notify me about activity"
              />
              <SettingRow
                id="digest"
                label="Weekly digest"
                description="Summary of activity every Monday"
                defaultChecked
              />
            </FieldGroup>
          </TabsContent>

          <TabsContent value="privacy" className="mt-4">
            <FieldGroup>
              <SettingRow
                id="online-status"
                label="Show online status"
                description="Let others see when you're active"
                defaultChecked
              />
              <SettingRow
                id="analytics"
                label="Usage analytics"
                description="Help improve the app with anonymous data"
                defaultChecked
              />
            </FieldGroup>
          </TabsContent>

          <TabsContent value="application" className="mt-4">
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border bg-muted/40 divide-y text-sm">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono font-medium">v1.0.0</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground">Platform</span>
                  <span>Windows x64</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground">Release channel</span>
                  <Badge variant="secondary">stable</Badge>
                </div>
              </div>

              <FieldGroup>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel>Auto-update</FieldLabel>
                    <FieldDescription>Download and install updates automatically</FieldDescription>
                  </FieldContent>
                  <Switch id="auto-update" defaultChecked />
                </Field>
              </FieldGroup>

              <Button variant="outline" className="w-full" onClick={checkForUpdates} disabled={isChecking}>
                {isChecking ? "Checking..." : "Check for updates"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
