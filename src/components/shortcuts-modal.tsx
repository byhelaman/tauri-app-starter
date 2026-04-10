import { isMac } from "@/lib/utils"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

interface Shortcut {
  label: string
  mac: string
  win: string
}

const SHORTCUT_GROUPS: { heading: string; items: Shortcut[] }[] = [
  {
    heading: "General",
    items: [
      { label: "Command palette", mac: "⌘K", win: "Ctrl + K" },
      { label: "Settings", mac: "⌘,", win: "Ctrl + ," },
      { label: "Notifications", mac: "⌘N", win: "Ctrl + N" },
      { label: "Keyboard shortcuts", mac: "⌘/", win: "Ctrl + /" },
      { label: "Close dialog", mac: "Esc", win: "Esc" },
    ],
  },
  {
    heading: "Panels",
    items: [
      { label: "Profile", mac: "⇧⌘P", win: "Ctrl + Shift + P" },
      { label: "System", mac: "⇧⌘S", win: "Ctrl + Shift + S" },
    ],
  },
  {
    heading: "Navigation",
    items: [
      { label: "Dashboard", mac: "⌘1", win: "Ctrl + 1" },
      { label: "Projects", mac: "⌘2", win: "Ctrl + 2" },
      { label: "Team", mac: "⌘3", win: "Ctrl + 3" },
      { label: "Analytics", mac: "⌘4", win: "Ctrl + 4" },
      { label: "Tasks", mac: "⌘5", win: "Ctrl + 5" },
    ],
  },
]

interface ShortcutsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutsModal({ open, onOpenChange }: ShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md!">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Quick reference for available shortcuts.</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-4 p-1">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.heading}>
                <p className="text-sm font-medium text-muted-foreground mb-2">{group.heading}</p>
                <div className="rounded-lg border divide-y text-sm">
                  {group.items.map((shortcut) => (
                    <div key={shortcut.label} className="flex items-center justify-between px-3 py-2">
                      <span>{shortcut.label}</span>
                      <KbdGroup>
                        <Kbd>{isMac ? shortcut.mac : shortcut.win}</Kbd>
                      </KbdGroup>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogBody>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
