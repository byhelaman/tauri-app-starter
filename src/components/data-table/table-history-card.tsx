import { useDeferredValue, useMemo, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { ArrowRight, SearchIcon, PlusIcon, PencilIcon, TrashIcon, XIcon, Loader2 } from "lucide-react"
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
import { formatRelativeTime } from "@/lib/date-utils"
import { filterByMultiSearch } from "@/lib/utils"
import type { HistoryEntry, HistorySummary } from "./data-table-types"

interface TableHistoryCardProps {
  onClose: () => void
  tableId: string
  queryKey: unknown[]
  queryFn: (params: { limit: number, offset: number }) => Promise<HistoryEntry[]>
  pageSize?: number
}

function formatHistoryValue(value: unknown) {
  if (value === null || value === undefined) return "-"
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

function getHistorySearchValues(entry: HistoryEntry) {
  return [
    entry.description,
    entry.actorEmail,
    entry.action,
    entry.orderId,
    entry.recordCode,
    ...(entry.details?.flatMap((detail) => [
      detail.recordId,
      detail.recordCode,
      detail.field,
      formatHistoryValue(detail.oldValue),
      formatHistoryValue(detail.newValue),
    ]) ?? []),
  ]
}

export function TableHistoryCard({
  onClose,
  tableId,
  queryKey,
  queryFn,
  pageSize = 20
}: TableHistoryCardProps) {
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 0 }) => queryFn({ limit: pageSize, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < pageSize) return undefined
      return allPages.length * pageSize
    },
  })

  const allEntries = useMemo(() => data?.pages.flat() ?? [], [data])

  const filtered = useMemo(
    () => filterByMultiSearch(allEntries, deferredSearch, getHistorySearchValues),
    [allEntries, deferredSearch],
  )

  const getActionIcon = (action: HistoryEntry["action"]) => {
    switch (action) {
      case "create": return <PlusIcon />
      case "update": return <PencilIcon />
      case "delete": return <TrashIcon />
    }
  }

  function renderSummary(summary: HistorySummary) {
    return (
      <div className="mt-2 space-y-1.5 border-l-2 border-muted pl-3">
        {typeof summary.rowCount === "number" && (
          <div className="text-sm text-muted-foreground">
            {summary.rowCount.toLocaleString()} affected records
          </div>
        )}
      </div>
    )
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
                  <Skeleton className="h-3 w-10" />
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
                  <ItemTitle className="max-w-full min-w-0">
                    <span className="truncate">{entry.description}</span>
                    {entry.recordCode && (
                      <span className="shrink-0 font-mono">{entry.recordCode}</span>
                    )}
                  </ItemTitle>
                  <ItemDescription>
                    {entry.actorEmail}
                  </ItemDescription>

                  {entry.details && entry.details.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-l-2 border-muted pl-3">
                      {entry.details.map((detail, idx) => (
                        <div key={idx} className="text-sm">
                          <span className="text-muted-foreground mr-2">
                            <span className="capitalize">{detail.field}</span>: {formatHistoryValue(detail.oldValue)}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <ArrowRight className="size-3.5" />
                            <span className="font-medium">{formatHistoryValue(detail.newValue)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {entry.summary && renderSummary(entry.summary)}
                </ItemContent>

                <ItemActions>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </ItemActions>
              </Item>
            ))}
            {hasNextPage && (
              <div className="w-full flex justify-center mt-2 mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit text-muted-foreground gap-2"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Load More Changes"
                  )}
                </Button>
              </div>
            )}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}
