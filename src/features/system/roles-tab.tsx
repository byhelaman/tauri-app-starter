import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ChevronRightIcon, MoreHorizontalIcon, PlusIcon, SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldError,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import {
  FieldDescription,
  FieldContent,
} from "@/components/ui/field"
import { cn } from "@/lib/utils"
import type { PermissionMatrix, RoleDefinition } from "./types"
import { PERMISSIONS } from "./data"

// ─── Schemas ────────────────────────────────────────────────────────────────

const roleFormSchema = z.object({
  name: z
    .string()
    .min(1, "Required")
    .regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers and underscores"),
  level: z.coerce
    .number({ invalid_type_error: "Must be a number" })
    .int()
    .min(0, "Min 0")
    .max(99, "Max 99"),
  description: z.string(),
})

type RoleFormValues = z.infer<typeof roleFormSchema>

const editRoleSchema = roleFormSchema.extend({
  name: z.string().min(1, "Required"),
  level: z.coerce.number({ invalid_type_error: "Must be a number" }).int().min(0).max(100),
})

type EditRoleValues = z.infer<typeof editRoleSchema>

// ─── New Role Dialog ─────────────────────────────────────────────────────────

interface NewRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: RoleFormValues) => void
}

function NewRoleDialog({ open, onOpenChange, onSubmit }: NewRoleDialogProps) {
  const { control, handleSubmit, reset } = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { name: "", level: "" as unknown as number, description: "" },
  })

  function handleClose(v: boolean) {
    onOpenChange(v)
    if (!v) reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>Define a name, level, and description for the new role.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <div className="flex gap-3">
              <Controller
                name="name"
                control={control}
                render={({ field, fieldState }) => (
                  <Field className="flex-1" data-invalid={fieldState.invalid}>
                    <FieldLabel>Name</FieldLabel>
                    <Input {...field} placeholder="e.g. moderator" aria-invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="level"
                control={control}
                render={({ field, fieldState }) => (
                  <Field className="w-24" data-invalid={fieldState.invalid}>
                    <FieldLabel>Level</FieldLabel>
                    <Input {...field} type="number" placeholder="0–99" aria-invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="description"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Description</FieldLabel>
                  <Input {...field} placeholder="Optional" aria-invalid={fieldState.invalid} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter showCloseButton className="mt-4">
            <Button type="submit">Add role</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Role Dialog ─────────────────────────────────────────────────────────

interface EditRoleDialogProps {
  role: RoleDefinition | null
  onOpenChange: (open: boolean) => void
  onSubmit: (original: string, values: EditRoleValues) => void
}

function EditRoleDialog({ role, onOpenChange, onSubmit }: EditRoleDialogProps) {
  const { control, handleSubmit, reset } = useForm<EditRoleValues>({
    resolver: zodResolver(editRoleSchema),
    values: role
      ? { name: role.name, level: role.level, description: role.description }
      : { name: "", level: 0, description: "" },
  })

  function handleClose(v: boolean) {
    onOpenChange(v)
    if (!v) reset()
  }

  return (
    <Dialog open={!!role} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit role</DialogTitle>
          <DialogDescription>
            {role?.builtin
              ? "For built-in roles, only the description can be updated."
              : "Update the name, level, or description of this role."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => role && onSubmit(role.name, values))}>
          <FieldGroup>
            <div className="flex gap-3">
              <Controller
                name="name"
                control={control}
                render={({ field, fieldState }) => (
                  <Field className="flex-1" data-invalid={fieldState.invalid}>
                    <FieldLabel>Name</FieldLabel>
                    <Input {...field} disabled={role?.builtin} aria-invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="level"
                control={control}
                render={({ field, fieldState }) => (
                  <Field className="w-24" data-invalid={fieldState.invalid}>
                    <FieldLabel>Level</FieldLabel>
                    <Input {...field} type="number" disabled={role?.builtin} aria-invalid={fieldState.invalid} />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="description"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Description</FieldLabel>
                  <Input {...field} placeholder="Optional" aria-invalid={fieldState.invalid} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter showCloseButton className="mt-4">
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Roles Tab ───────────────────────────────────────────────────────────────

interface RolesTabProps {
  roles: RoleDefinition[]
  matrix: PermissionMatrix
  onMatrixChange: (matrix: PermissionMatrix) => void
  onAddRole: (role: RoleDefinition) => void
  onEditRole: (original: string, updated: Partial<RoleDefinition>) => void
  onRemoveRole: (name: string) => void
}

export function RolesTab({ roles, matrix, onMatrixChange, onAddRole, onEditRole, onRemoveRole }: RolesTabProps) {
  const [openRole, setOpenRole] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [editTarget, setEditTarget] = useState<RoleDefinition | null>(null)
  const [removeTarget, setRemoveTarget] = useState<RoleDefinition | null>(null)

  const filtered = roles.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase())
  )

  function togglePermission(role: string, permission: string) {
    onMatrixChange({
      ...matrix,
      [role]: { ...matrix[role], [permission]: !matrix[role]?.[permission] },
    })
  }

  function handleAddRole(values: RoleFormValues) {
    const newRole: RoleDefinition = {
      name: values.name,
      level: values.level,
      description: values.description,
      builtin: false,
    }
    onAddRole(newRole)
    onMatrixChange({
      ...matrix,
      [newRole.name]: Object.fromEntries(PERMISSIONS.map((p) => [p.key, false])),
    })
    setShowNew(false)
  }

  function handleDuplicateRole(role: RoleDefinition) {
    const baseName = role.name.replace(/_copy(\d*)$/, "")
    const copies = roles.filter((r) => r.name.startsWith(baseName + "_copy"))
    const suffix = copies.length > 0 ? `_copy${copies.length}` : "_copy"
    const duplicate: RoleDefinition = {
      name: baseName + suffix,
      level: role.level,
      description: role.description,
      builtin: false,
    }
    onAddRole(duplicate)
    onMatrixChange({
      ...matrix,
      [duplicate.name]: { ...(matrix[role.name] ?? {}) },
    })
  }

  function handleEditRole(originalName: string, values: EditRoleValues) {
    const updated: Partial<RoleDefinition> = { description: values.description }
    if (!editTarget?.builtin) {
      updated.name = values.name
      updated.level = values.level
    }
    onEditRole(originalName, updated)
    setEditTarget(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <NewRoleDialog open={showNew} onOpenChange={setShowNew} onSubmit={handleAddRole} />
      <EditRoleDialog role={editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }} onSubmit={handleEditRole} />
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove role?</AlertDialogTitle>
            <AlertDialogDescription>
              The role <span className="font-medium">{removeTarget?.name}</span> will be permanently deleted. Users assigned to it will need a new role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => { if (removeTarget) { onRemoveRole(removeTarget.name); setRemoveTarget(null) } }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search roles..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
          {search && (
            <InputGroupAddon align="inline-end">{filtered.length} results</InputGroupAddon>
          )}
        </InputGroup>
        <Button variant="outline" size="sm" onClick={() => setShowNew(true)}>
          <PlusIcon data-icon="inline-start" />
          New role
        </Button>
      </div>

      <div className="divide-y text-sm">
        {filtered.map((role) => (
          <Collapsible
            key={role.name}
            open={openRole === role.name}
            onOpenChange={(open) => setOpenRole(open ? role.name : null)}
          >
            <CollapsibleTrigger asChild>
              <div className={cn(
                "flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors select-none",
                openRole === role.name && "bg-muted/40"
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRightIcon className={cn(
                    "size-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                    openRole === role.name && "rotate-90"
                  )} />
                  <div className="min-w-0">
                    <p className="font-medium">{role.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground truncate">{role.description || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Badge variant="outline">Level {role.level}</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontalIcon data-icon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {/* <DropdownMenuLabel>Actions</DropdownMenuLabel> */}
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(role.name)}>
                          Copy name
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditTarget(role) }}>
                          Edit role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicateRole(role)}>
                          Duplicate role
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={role.builtin}
                          onClick={() => setRemoveTarget(role)}
                        >
                          Remove role
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="border-t bg-muted/20 px-4 py-3 flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">Permissions</p>
                <div className="grid grid-cols-2 gap-4 pb-2">
                  {PERMISSIONS.map((perm) => {
                    const isLocked = role.name === "owner"
                    const checked = isLocked ? true : (matrix[role.name]?.[perm.key] ?? false)
                    return (
                      <Field key={perm.key} orientation="horizontal">
                        <Checkbox
                          checked={checked}
                          disabled={isLocked}
                          onCheckedChange={() => togglePermission(role.name, perm.key)}
                        />
                        <FieldContent>
                          <FieldLabel className="text-sm">{perm.label}</FieldLabel>
                          <FieldDescription>{perm.description}</FieldDescription>
                        </FieldContent>
                      </Field>
                    )
                  })}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No roles found.</p>
        )}
      </div>
    </div>
  )
}
