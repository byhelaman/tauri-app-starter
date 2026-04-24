import { useDeferredValue, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, SearchIcon, PlusIcon, PencilIcon, TrashIcon, XIcon, LoaderCircle } from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
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
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { filterByMultiSearch } from "@/lib/utils"
import type { HistoryEntry } from "./data-table-types"
import { fetchOrderHistory } from "@/features/orders/api"

interface TableHistoryCardProps {
  onClose: () => void
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

export function TableHistoryCard({ onClose, tableId }: TableHistoryCardProps) {
  const [search, setSearch] = useState("")
  const [showAll, setShowAll] = useState(false)
  const deferredSearch = useDeferredValue(search)

  const { data: fullHistory = [], isLoading } = useQuery({
    queryKey: [tableId, "history"],
    queryFn: fetchOrderHistory,
  })

  const history = useMemo(() => {
    if (showAll) return fullHistory
    const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000
    return fullHistory.filter(h => new Date(h.createdAt).getTime() > eightHoursAgo)
  }, [fullHistory, showAll])

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
    <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
      <CardHeader className="flex flex-row justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Changes</CardTitle>
          <CardDescription>
            Review recent activity for {tableId}.
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <XIcon />
        </Button>
      </CardHeader>
      
      <div className="px-4">
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
      </div>

      <CardContent className="flex-1 min-h-0 overflow-y-auto px-3 flex flex-col gap-2 scrollbar">
        {isLoading ? (
          <ItemGroup>
            {Array.from({ length: 5 }).map((_, i) => (
              <Item key={i} size="sm">
                <ItemMedia variant="icon">
                  <Skeleton className="size-8 rounded-md" />
                </ItemMedia>
                <ItemContent className="space-y-1 py-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </ItemContent>
                <ItemActions>
                  <Skeleton className="h-4 w-12" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : filtered.length === 0 ? (
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
            {!showAll && fullHistory.length > history.length && (
              <div className="w-full flex justify-center">
                <Button 
                  variant="ghost" 
                  className="w-fit text-muted-foreground" 
                  onClick={() => setShowAll(true)}
                >
                  Load more changes
                </Button>
              </div>
            )}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}
