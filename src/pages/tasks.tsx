import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleDashed,
  Copy,
  ListTodo,
  LoaderCircle,
  Trash2Icon,
  XCircle,
} from "lucide-react"
import { createColumns, type Status, type Task } from "@/features/tasks/columns"
import { DataTable, type FacetedFilterOption } from "@/features/tasks/data-table"
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
  { id: "TASK-001", title: "Set up CI/CD pipeline", status: "done", priority: "high", assignee: "Alex Turner", date: "2026-04-01", time: "09:00 - 11:30", amount: 1500.00 },
  { id: "TASK-002", title: "Design onboarding flow", status: "in progress", priority: "high", assignee: "Sara Chen", date: "2026-04-02", time: "10:00 - 12:00", amount: 3200.00 },
  { id: "TASK-003", title: "Fix login redirect bug", status: "todo", priority: "medium", assignee: "Alex Turner", date: "2026-04-03", time: "14:00 - 15:30", amount: 450.00 },
  { id: "TASK-004", title: "Write API documentation", status: "backlog", priority: "low", assignee: "John Rivera", date: "2026-04-04", time: "08:00 - 10:00", amount: 800.50 },
  { id: "TASK-005", title: "Add dark mode support", status: "done", priority: "medium", assignee: "Sara Chen", date: "2026-04-05", time: "13:00 - 14:30", amount: 975.00 },
  { id: "TASK-006", title: "Optimize database queries", status: "in progress", priority: "high", assignee: "John Rivera", date: "2026-04-06", time: "17:15 - 18:00", amount: 2100.00 },
  { id: "TASK-007", title: "Implement push notifications", status: "backlog", priority: "medium", assignee: "Alex Turner", date: "2026-04-07", time: "11:00 - 12:30", amount: 4500.00 },
  { id: "TASK-008", title: "Audit accessibility (a11y)", status: "todo", priority: "high", assignee: "Sara Chen", date: "2026-04-08", time: "09:30 - 11:00", amount: 1250.00 },
  { id: "TASK-009", title: "Update dependencies", status: "cancelled", priority: "low", assignee: "John Rivera", date: "2026-04-09", time: "15:00 - 16:00", amount: 300.00 },
  { id: "TASK-010", title: "Add rate limiting to API", status: "todo", priority: "high", assignee: "Alex Turner", date: "2026-04-10", time: "10:30 - 12:00", amount: 1800.75 },
  { id: "TASK-011", title: "Migrate to Supabase Storage", status: "backlog", priority: "medium", assignee: "Sara Chen", date: "2026-04-11", time: "14:00 - 16:30", amount: 2750.00 },
  { id: "TASK-012", title: "Set up error monitoring", status: "in progress", priority: "medium", assignee: "John Rivera", date: "2026-04-12", time: "16:00 - 17:30", amount: 650.00 },
]

const STATUS_FILTER_OPTIONS: FacetedFilterOption[] = [
  { label: "Backlog", value: "backlog", icon: CircleDashed },
  { label: "Todo", value: "todo", icon: ListTodo },
  { label: "In Progress", value: "in progress", icon: LoaderCircle },
  { label: "Done", value: "done", icon: CheckCircle2 },
  { label: "Cancelled", value: "cancelled", icon: XCircle },
]

const PRIORITY_FILTER_OPTIONS: FacetedFilterOption[] = [
  { label: "Low", value: "low", icon: ArrowDown },
  { label: "Medium", value: "medium", icon: ListTodo },
  { label: "High", value: "high", icon: ArrowUp },
]

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS)
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ selected: Task[], clearSelection: () => void } | null>(null)

  const handleDelete = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleStatusChange = useCallback((id: string, status: Status) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status } : t))
  }, [])

  const columns = useMemo(() => createColumns(handleDelete, handleStatusChange), [handleDelete, handleStatusChange])

  return (
    <main className="h-full overflow-hidden flex flex-col p-6 gap-6">
      <PageHeader title="Tasks" description="Manage and track your team's work." />
      <DataTable
        columns={columns}
        data={tasks}
        filterColumn="title"
        filterPlaceholder="Filter tasks..."
        facetedFilters={[
          { columnId: "status", title: "Status", options: STATUS_FILTER_OPTIONS },
          { columnId: "priority", title: "Priority", options: PRIORITY_FILTER_OPTIONS },
        ]}
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
              variant="destructive"
              size="sm"
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
