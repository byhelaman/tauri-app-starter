import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldContent,
  FieldGroup,
  FieldSet,
  FieldLegend,
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your preferences.</DialogDescription>
        </DialogHeader>

        <FieldSet>
          <FieldLegend variant="label">Notifications</FieldLegend>
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
        </FieldSet>

        <Separator />

        <FieldSet>
          <FieldLegend variant="label">Privacy</FieldLegend>
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
        </FieldSet>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
