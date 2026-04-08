import { columns, type Task } from "@/features/tasks/columns"
import { DataTable } from "@/features/tasks/data-table"

const TASKS: Task[] = [
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
  return (
    <main className="flex-1 p-6 w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">Manage and track your team's work.</p>
      </div>
      <DataTable
        columns={columns}
        data={TASKS}
        filterColumn="title"
        filterPlaceholder="Filter tasks..."
      />
    </main>
  )
}
