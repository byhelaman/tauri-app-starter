import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
} from "@/components/ui/collapsible"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
    Field,
    FieldLabel,
    FieldDescription,
    FieldContent,
} from "@/components/ui/field"
import { cn } from "@/lib/utils"
import type { PermissionDefinition, PermissionMatrix, RoleDefinition } from "../types"

interface RoleItemProps {
    role: RoleDefinition
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    permissions: PermissionDefinition[]
    matrix: PermissionMatrix
    onTogglePermission: (role: string, permission: string) => Promise<void>
    onEdit: (role: RoleDefinition) => void
    onDuplicate: (role: RoleDefinition) => void
    onRemove: (role: RoleDefinition) => void
    canManageRoles: boolean
    busy?: boolean
}

export function RoleItem({
    role,
    isOpen,
    onOpenChange,
    permissions,
    matrix,
    onTogglePermission,
    onEdit,
    onDuplicate,
    onRemove,
    canManageRoles,
    busy,
}: RoleItemProps) {
    return (
        <Collapsible
            open={isOpen}
            onOpenChange={onOpenChange}
        >
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <CollapsibleTrigger asChild>
                        <div className={cn(
                            "flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors select-none",
                            isOpen && "bg-muted/40"
                        )}>
                            <div className="flex items-center gap-2 min-w-0">
                                <ChevronRightIcon className={cn(
                                    "size-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                                    isOpen && "rotate-90"
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
                                        <DropdownMenuGroup>
                                            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(role.name)}>
                                                Copy name
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(role) }} disabled={!canManageRoles || busy}>
                                                Edit role
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => void onDuplicate(role)} disabled={!canManageRoles || busy}>
                                                Duplicate role
                                            </DropdownMenuItem>
                                        </DropdownMenuGroup>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuGroup>
                                            <DropdownMenuItem
                                                disabled={role.builtin || !canManageRoles || busy}
                                                onClick={() => onRemove(role)}
                                            >
                                                Remove role
                                            </DropdownMenuItem>
                                        </DropdownMenuGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </CollapsibleTrigger>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onSelect={() => navigator.clipboard.writeText(role.name)}>
                        Copy name
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onEdit(role)} disabled={!canManageRoles || busy}>Edit role</ContextMenuItem>
                    <ContextMenuItem onSelect={() => onDuplicate(role)} disabled={!canManageRoles || busy}>Duplicate role</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        disabled={role.builtin || !canManageRoles || busy}
                        onSelect={() => onRemove(role)}
                    >
                        Remove role
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            <CollapsibleContent>
                <div className="border-t bg-muted/20 px-4 py-3 flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">Permissions</p>
                    <div className="grid grid-cols-2 gap-4 pb-2">
                        {permissions.map((permission) => {
                            const isLocked = role.builtin
                            const checked = isLocked && role.name === "owner" ? true : (matrix[role.name]?.[permission.name] ?? false)
                            return (
                                <Field key={permission.name} orientation="horizontal">
                                    <Checkbox
                                        checked={checked}
                                        disabled={isLocked || !canManageRoles || busy}
                                        onCheckedChange={() => void onTogglePermission(role.name, permission.name)}
                                    />
                                    <FieldContent>
                                        <FieldLabel className="text-sm">{permission.name}</FieldLabel>
                                        <FieldDescription>{permission.description || "No description"}</FieldDescription>
                                    </FieldContent>
                                </Field>
                            )
                        })}
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}
