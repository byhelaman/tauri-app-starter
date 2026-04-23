import { useDeferredValue, useMemo, useState } from "react"
import { ArrowRight, SearchIcon, PlusIcon, PencilIcon, TrashIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog"
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
} from "@/components/ui/item"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { filterByMultiSearch } from "@/lib/utils"
import type { HistoryEntry } from "./data-table-types"
import { TABLE_HISTORY_MOCK } from "./table-history-mock"

interface TableHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tableId: string
  history?: HistoryEntry[]
}

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "yesterday"
  return new Date(iso).toLocaleDateString()
}

export function TableHistoryDialog({ open, onOpenChange, tableId, history = TABLE_HISTORY_MOCK }: TableHistoryDialogProps) {
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)

  const filtered = useMemo(
    () => filterByMultiSearch(history, deferredSearch, (e) => [e.description, e.actorEmail, e.action]),
    [history, deferredSearch],
  )

  const getActionIcon = (action: HistoryEntry["action"]) => {
    switch (action) {
      case "create": return <PlusIcon />
      case "update": return <PencilIcon />
      case "delete": return <TrashIcon />
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Table Changes</DialogTitle>
          <DialogDescription>
            Review recent activity for {tableId}.
          </DialogDescription>
        </DialogHeader>
        
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
          {search && (
            <InputGroupAddon align="inline-end">{filtered.length} results</InputGroupAddon>
          )}
        </InputGroup>

        <DialogBody>
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No events found.</p>
          ) : (
            <ItemGroup>
              {filtered.map((entry) => (
                <Item key={entry.id} size="sm">
                  <ItemMedia variant="icon">
                    {getActionIcon(entry.action)}
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{entry.description}</ItemTitle>
                    <ItemDescription>{entry.actorEmail}</ItemDescription>
                    
                    {entry.details && entry.details.length > 0 && (
                      <div className="mt-2 space-y-1.5 border-l-2 border-muted pl-3">
                        {entry.details.map((detail, idx) => (
                          <div key={idx} className="text-sm">
                            <span className="text-muted-foreground capitalize mr-2">{detail.field}: {detail.oldValue}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <ArrowRight className="size-3.5" />
                              <span className="font-medium">{detail.newValue}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ItemContent>
                  
                  <ItemActions>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
