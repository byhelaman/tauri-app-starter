export type Role = "owner" | "admin" | "member" | "guest" | (string & {})
export type UserStatus = "active" | "inactive"
export type AuditAction =
  | "role_change"
  | "user_created"
  | "user_removed"
  | "account_deleted"
  | "display_name_change"
  | "permission_update"
  | "role_created"
  | "role_updated"
  | "role_deleted"
  | "password_reset"

export interface SystemUser {
  id: string
  displayName: string
  email: string
  role: string
  status: UserStatus
  hierarchyLevel: number
  createdAt: string
  lastLoginAt: string | null
}

export interface RoleDefinition {
  name: string
  level: number
  description: string
  builtin: boolean
}

export interface PermissionDefinition {
  name: string
  description: string
  minRoleLevel: number
}

export interface AuditEntry {
  id: number
  action: AuditAction
  description: string
  actorEmail: string
  targetId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type PermissionMatrix = Record<string, Record<string, boolean>>
