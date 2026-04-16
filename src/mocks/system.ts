import type { AuditEntry, PermissionMatrix, RoleDefinition, SystemUser } from "@/features/system/types"

export const DEMO_USERS: SystemUser[] = [
  { id: "00000000-0000-0000-0000-000000000001", displayName: "Alex Thompson", email: "alex@company.com", role: "owner", status: "active", hierarchyLevel: 100, createdAt: "2026-01-01T00:00:00Z", lastLoginAt: "2026-04-01T10:00:00Z" },
  { id: "00000000-0000-0000-0000-000000000002", displayName: "Maria Garcia", email: "maria@company.com", role: "admin", status: "active", hierarchyLevel: 80, createdAt: "2026-01-02T00:00:00Z", lastLoginAt: "2026-04-01T10:00:00Z" },
  { id: "00000000-0000-0000-0000-000000000003", displayName: "John Smith", email: "john@company.com", role: "member", status: "active", hierarchyLevel: 10, createdAt: "2026-01-03T00:00:00Z", lastLoginAt: "2026-04-01T10:00:00Z" },
  { id: "00000000-0000-0000-0000-000000000004", displayName: "Sarah Lee", email: "sarah@company.com", role: "member", status: "inactive", hierarchyLevel: 10, createdAt: "2026-01-04T00:00:00Z", lastLoginAt: null },
  { id: "00000000-0000-0000-0000-000000000005", displayName: "Guest User", email: "guest@company.com", role: "guest", status: "active", hierarchyLevel: 0, createdAt: "2026-01-05T00:00:00Z", lastLoginAt: "2026-04-01T10:00:00Z" },
]

export const INITIAL_ROLES: RoleDefinition[] = [
  { name: "owner", level: 100, description: "Full access to all resources and settings", builtin: true },
  { name: "admin", level: 80, description: "Manage users, content and configurations", builtin: false },
  { name: "member", level: 10, description: "Create and manage own content", builtin: false },
  { name: "guest", level: 0, description: "Read-only access to content", builtin: true },
]

export const INITIAL_PERMISSION_MATRIX: PermissionMatrix = {
  owner: { "profile.read": true, "profile.update": true, "users.view": true, "users.manage": true, "system.view": true, "system.manage": true },
  admin: { "profile.read": true, "profile.update": true, "users.view": true, "users.manage": true, "system.view": true, "system.manage": false },
  member: { "profile.read": true, "profile.update": true, "users.view": false, "users.manage": false, "system.view": false, "system.manage": false },
  guest: { "profile.read": false, "profile.update": false, "users.view": false, "users.manage": false, "system.view": false, "system.manage": false },
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
