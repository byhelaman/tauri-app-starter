import { useDeferredValue, useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"
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
import { AUDIT_ACTION_META } from "./data"
import type { AuditEntry } from "./types"

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
  if (days < 7) return `${days}d ago`

  return new Date(iso).toLocaleDateString()
}

interface AuditTabProps {
  entries: AuditEntry[]
}

export function AuditTab({ entries }: AuditTabProps) {
  const [search, setSearch] = useState("")

  const deferredSearch = useDeferredValue(search)

  const filtered = useMemo(() => entries.filter(
    (e) =>
      e.description.toLowerCase().includes(deferredSearch.toLowerCase()) ||
      e.actorEmail.toLowerCase().includes(deferredSearch.toLowerCase())
  ), [entries, deferredSearch])

  return (
    <div className="flex flex-col gap-3">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search events..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
        {search && (
          <InputGroupAddon align="inline-end">{filtered.length} results</InputGroupAddon>
        )}
      </InputGroup>

      {filtered.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No events found.</p>
      ) : (
        <ItemGroup>
          {filtered.map((entry) => {
            const meta = AUDIT_ACTION_META[entry.action]
            const Icon = meta?.icon ?? SearchIcon
            return (
              <Item key={entry.id} size="sm">
                <ItemMedia variant="icon">
                  <Icon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{entry.description}</ItemTitle>
                  <ItemDescription>{entry.actorEmail}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(entry.createdAt)}</span>
                </ItemActions>
              </Item>
            )
          })}
        </ItemGroup>
      )}
    </div>
  )
}
