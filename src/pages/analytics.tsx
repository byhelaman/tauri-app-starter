import { BarChart2 } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export function AnalyticsPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BarChart2 />
          </EmptyMedia>
          <EmptyTitle>No data to display</EmptyTitle>
          <EmptyDescription>
            Analytics will appear here once your app starts collecting events.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  )
}
