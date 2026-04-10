import { toast } from "sonner"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export function TeamPage() {
  return (
    <main className="h-full flex items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>No team members</EmptyTitle>
          <EmptyDescription>
            Invite people to your workspace to start working together.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => toast.info("Team management coming soon")}>Invite member</Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
