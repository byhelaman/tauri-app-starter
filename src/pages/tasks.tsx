import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Copy, Trash2Icon } from "lucide-react"
import { createColumns, type Task } from "@/features/tasks/columns"
import { DataTable } from "@/features/tasks/data-table"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const INITIAL_TASKS: Task[] = [
  { id: "TASK-001", title: "Set up CI/CD pipeline", status: "done", priority: "high", assignee: "alex" },
  { id: "TASK-002", title: "Design onboarding flow", status: "in progress", priority: "high", assignee: "sara" },
  { id: "TASK-003", title: "Fix login redirect bug", status: "todo", priority: "medium", assignee: "alex" },
  { id: "TASK-004", title: "Write API documentation", status: "backlog", priority: "low", assignee: "john" },
  { id: "TASK-005", title: "Add dark mode support", status: "done", priority: "medium", assignee: "sara" },
  { id: "TASK-006", title: "Optimize database queries", status: "in progress", priority: "high", assignee: "john" },
  { id: "TASK-007", title: "Implement push notifications", status: "backlog", priority: "medium", assignee: "alex" },
  { id: "TASK-008", title: "Audit accessibility (a11y)", status: "todo", priority: "high", assignee: "sara" },
  { id: "TASK-009", title: "Update dependencies", status: "cancelled", priority: "low", assignee: "john" },
  { id: "TASK-010", title: "Add rate limiting to API", status: "todo", priority: "high", assignee: "alex" },
  { id: "TASK-011", title: "Migrate to Supabase Storage", status: "backlog", priority: "medium", assignee: "sara" },
  { id: "TASK-012", title: "Set up error monitoring", status: "in progress", priority: "medium", assignee: "john" },
]

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS)
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ selected: Task[], clearSelection: () => void } | null>(null)

  const handleDelete = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const columns = useMemo(() => createColumns(handleDelete), [])

  return (
    <main className="h-full overflow-hidden flex flex-col p-6 gap-6">
      <PageHeader title="Tasks" description="Manage and track your team's work." />
      <DataTable
        columns={columns}
        data={tasks}
        filterColumn="title"
        filterPlaceholder="Filter tasks..."
        bulkActions={(selected, clearSelection) => (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(selected.map((t) => t.id).join(", "))
                toast.success(`${selected.length} IDs copied`)
              }}
            >
              <Copy />
              Copy IDs
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setBulkDeleteTarget({ selected, clearSelection })}
            >
              <Trash2Icon />
              Delete
            </Button>
          </>
        )}
      />

      <AlertDialog
        open={!!bulkDeleteTarget}
        onOpenChange={(open) => { if (!open) setBulkDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkDeleteTarget?.selected.length} tasks?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected tasks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!bulkDeleteTarget) return
                const ids = bulkDeleteTarget.selected.map((t) => t.id)
                setTasks((prev) => prev.filter((t) => !ids.includes(t.id)))
                toast.success(`${bulkDeleteTarget.selected.length} tasks deleted`)
                bulkDeleteTarget.clearSelection()
                setBulkDeleteTarget(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
