import type { LucideIcon } from "lucide-react"
import { KeyRoundIcon, LogInIcon, ShieldIcon, UserMinusIcon, UserPlusIcon } from "lucide-react"
import type { AuditAction } from "./types"

export const PERMISSIONS = [
  { key: "view_content", label: "View content", description: "Read access to all content and resources" },
  { key: "create_content", label: "Create content", description: "Create new records, tasks and documents" },
  { key: "edit_content", label: "Edit content", description: "Modify existing content owned by anyone" },
  { key: "delete_content", label: "Delete content", description: "Permanently remove content and records" },
  { key: "manage_users", label: "Manage users", description: "Invite, deactivate and update user profiles" },
  { key: "manage_roles", label: "Manage roles", description: "Create, edit and assign roles to users" },
  { key: "system_config", label: "System config", description: "Access integrations and system settings" },
]

export const AUDIT_ACTION_META: Record<AuditAction, { icon: LucideIcon }> = {
  role_change:        { icon: ShieldIcon    },
  login:              { icon: LogInIcon     },
  permission_update:  { icon: KeyRoundIcon  },
  user_created:       { icon: UserPlusIcon  },
  user_removed:       { icon: UserMinusIcon },
}
