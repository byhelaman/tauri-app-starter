import { useState } from "react"
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
import { AUDIT_ACTION_META, AUDIT_LOG } from "./data"

export function AuditTab() {
  const [search, setSearch] = useState("")

  const filtered = AUDIT_LOG.filter(
    (e) =>
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.actor.toLowerCase().includes(search.toLowerCase())
  )

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
            const { icon: Icon } = AUDIT_ACTION_META[entry.action]
            return (
              <Item key={entry.id} size="xs">
                <ItemMedia variant="icon">
                  <Icon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{entry.description}</ItemTitle>
                  <ItemDescription>{entry.actor}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span className="text-xs text-muted-foreground shrink-0">{entry.time}</span>
                </ItemActions>
              </Item>
            )
          })}
        </ItemGroup>
      )}
    </div>
  )
}
