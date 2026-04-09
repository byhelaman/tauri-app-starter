import type { AuditAction, AuditEntry, PermissionMatrix, RoleDefinition, SystemUser } from "./types"

export const DEMO_USERS: SystemUser[] = [
  { id: 1, name: "Alex Thompson", email: "alex@company.com", role: "super_admin", status: "active" },
  { id: 2, name: "Maria Garcia", email: "maria@company.com", role: "admin", status: "active" },
  { id: 3, name: "John Smith", email: "john@company.com", role: "member", status: "active" },
  { id: 4, name: "Sarah Lee", email: "sarah@company.com", role: "member", status: "inactive" },
  { id: 5, name: "Guest User", email: "guest@company.com", role: "guest", status: "active" },
]

export const INITIAL_ROLES: RoleDefinition[] = [
  { name: "super_admin", level: 100, description: "Full access to all resources and settings", builtin: true },
  { name: "admin", level: 80, description: "Manage users, content and configurations", builtin: false },
  { name: "member", level: 10, description: "Create and manage own content", builtin: false },
  { name: "guest", level: 0, description: "Read-only access to content", builtin: true },
]

export const PERMISSIONS = [
  { key: "view_content", label: "View content", description: "Read access to all content and resources" },
  { key: "create_content", label: "Create content", description: "Create new records, tasks and documents" },
  { key: "edit_content", label: "Edit content", description: "Modify existing content owned by anyone" },
  { key: "delete_content", label: "Delete content", description: "Permanently remove content and records" },
  { key: "manage_users", label: "Manage users", description: "Invite, deactivate and update user profiles" },
  { key: "manage_roles", label: "Manage roles", description: "Create, edit and assign roles to users" },
  { key: "system_config", label: "System config", description: "Access integrations and system settings" },
]

export const INITIAL_PERMISSION_MATRIX: PermissionMatrix = {
  super_admin: { view_content: true, create_content: true, edit_content: true, delete_content: true, manage_users: true, manage_roles: true, system_config: true },
  admin: { view_content: true, create_content: true, edit_content: true, delete_content: true, manage_users: true, manage_roles: false, system_config: false },
  member: { view_content: true, create_content: true, edit_content: true, delete_content: false, manage_users: false, manage_roles: false, system_config: false },
  guest: { view_content: true, create_content: false, edit_content: false, delete_content: false, manage_users: false, manage_roles: false, system_config: false },
}

export const AUDIT_LOG: AuditEntry[] = [
  { id: 1, action: "role_change", description: "Changed john@company.com role to member", actor: "maria@company.com", time: "2m ago" },
  { id: 2, action: "user_created", description: "New user guest@company.com registered", actor: "system", time: "1h ago" },
  { id: 3, action: "permission_update", description: "Permission matrix updated for admin role", actor: "alex@company.com", time: "3h ago" },
  { id: 4, action: "login", description: "Sign-in from new device (Windows 11, New York)", actor: "sarah@company.com", time: "5h ago" },
  { id: 5, action: "role_change", description: "Changed sarah@company.com status to inactive", actor: "alex@company.com", time: "Yesterday" },
  { id: 6, action: "user_removed", description: "User temp@company.com removed from workspace", actor: "maria@company.com", time: "2 days ago" },
  { id: 7, action: "login", description: "Sign-in from new device (macOS, London)", actor: "john@company.com", time: "2 days ago" },
  { id: 8, action: "permission_update", description: "Permission 'delete_content' revoked from member role", actor: "alex@company.com", time: "3 days ago" },
  { id: 9, action: "user_created", description: "New user contractor@company.com invited", actor: "maria@company.com", time: "4 days ago" },
  { id: 10, action: "role_change", description: "Changed contractor@company.com role to guest", actor: "maria@company.com", time: "4 days ago" },
]

import type { LucideIcon } from "lucide-react"
import { KeyRoundIcon, LogInIcon, ShieldIcon, UserMinusIcon, UserPlusIcon } from "lucide-react"

export const AUDIT_ACTION_META: Record<AuditAction, { icon: LucideIcon }> = {
  role_change:        { icon: ShieldIcon    },
  login:              { icon: LogInIcon     },
  permission_update:  { icon: KeyRoundIcon  },
  user_created:       { icon: UserPlusIcon  },
  user_removed:       { icon: UserMinusIcon },
}
