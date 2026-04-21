import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { AuditEntry, PermissionDefinition, PermissionMatrix, RoleDefinition, SystemUser } from "./types"

interface RpcUser {
  id: string
  email: string
  display_name: string | null
  role: string
  hierarchy_level: number
  created_at: string
  last_login_at: string | null
}

interface RpcRole {
  name: string
  description: string | null
  hierarchy_level: number
}

interface RpcPermission {
  name: string
  description: string | null
  min_role_level: number
}

interface RpcRolePermissionMatrixRow {
  role: string
  permission: string
}

interface RpcAuditEntry {
  id: number
  action: string
  description: string
  actor_email: string
  target_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface SystemData {
  users: SystemUser[]
  roles: RoleDefinition[]
  permissions: PermissionDefinition[]
  matrix: PermissionMatrix
  auditEntries: AuditEntry[]
}

export async function fetchSystemData(canViewUsers: boolean): Promise<SystemData> {
  if (!supabase) throw new Error("Supabase is not configured")
  const client = supabase

  const usersPromise = canViewUsers
    ? client.rpc("get_all_users")
    : Promise.resolve({ data: [] as RpcUser[], error: null })

  const [usersResult, rolesResult, permissionsResult, matrixResult, auditResult] = await Promise.allSettled([
    usersPromise,
    client.rpc("get_all_roles"),
    client.rpc("get_all_permissions"),
    client.rpc("get_role_permission_matrix"),
    client.rpc("get_audit_log", { p_limit: 100, p_offset: 0 }),
  ])

  // Unwrap settled results — report the first rejection but continue rendering available data
  if (usersResult.status === "rejected") throw usersResult.reason
  if (rolesResult.status === "rejected") throw rolesResult.reason
  if (permissionsResult.status === "rejected") throw permissionsResult.reason
  if (matrixResult.status === "rejected") throw matrixResult.reason
  if (auditResult.status === "rejected") throw auditResult.reason

  const usersRes = usersResult.value
  const rolesRes = rolesResult.value
  const permissionsRes = permissionsResult.value
  const matrixRes = matrixResult.value
  const auditRes = auditResult.value

  if (usersRes.error) throw usersRes.error
  if (rolesRes.error) throw rolesRes.error
  if (permissionsRes.error) throw permissionsRes.error
  if (matrixRes.error) throw matrixRes.error
  if (auditRes.error) throw auditRes.error

  const roles: RoleDefinition[] = ((rolesRes.data ?? []) as RpcRole[])
    .map((role) => ({
      name: role.name,
      level: role.hierarchy_level,
      description: role.description ?? "",
      builtin: role.name === "owner" || role.name === "guest",
    }))
    .sort((a, b) => b.level - a.level)

  const permissions: PermissionDefinition[] = ((permissionsRes.data ?? []) as RpcPermission[])
    .map((permission) => ({
      name: permission.name,
      description: permission.description ?? "",
      minRoleLevel: permission.min_role_level,
    }))

  const matrix: PermissionMatrix = {}
  for (const role of roles) {
    matrix[role.name] = Object.fromEntries(permissions.map((p) => [p.name, false]))
  }

  const matrixRows = (matrixRes.data ?? []) as RpcRolePermissionMatrixRow[]
  for (const row of matrixRows) {
    if (matrix[row.role] && row.permission in matrix[row.role]) {
      matrix[row.role][row.permission] = true
    }
  }

  const ownerRole = roles.find((role) => role.level >= 100)
  if (ownerRole) {
    matrix[ownerRole.name] = Object.fromEntries(permissions.map((p) => [p.name, true]))
  }

  const users: SystemUser[] = ((usersRes.data ?? []) as RpcUser[]).map((user) => ({
    id: user.id,
    displayName: user.display_name ?? user.email.split("@")[0],
    email: user.email,
    role: user.role,
    status: user.last_login_at ? "active" : "inactive",
    hierarchyLevel: user.hierarchy_level,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  }))

  const auditEntries: AuditEntry[] = ((auditRes.data ?? []) as RpcAuditEntry[]).map((e) => ({
    id: e.id,
    action: e.action as AuditEntry["action"],
    description: e.description,
    actorEmail: e.actor_email,
    targetId: e.target_id,
    metadata: e.metadata ?? {},
    createdAt: e.created_at,
  }))

  return { users, roles, permissions, matrix, auditEntries }
}

export async function updateUserRole(userId: string, role: string) {
  if (!supabase) return { error: "Supabase is not configured" }
  const { error } = await supabase.rpc("update_user_role", { target_user_id: userId, new_role: role })
  if (error) { toast.error(error.message); return { error: error.message } }
  toast.success("User role updated")
  return { error: null }
}

export async function updateUserDisplayName(userId: string, displayName: string) {
  if (!supabase) return { error: "Supabase is not configured" }
  const { error } = await supabase.rpc("update_user_display_name", {
    target_user_id: userId,
    new_display_name: displayName,
  })
  if (error) { toast.error(error.message); return { error: error.message } }
  toast.success("User profile updated")
  return { error: null }
}

export async function updateUserEmail(userId: string, newEmail: string) {
  if (!supabase) throw new Error("Supabase is not configured")

  const { data, error } = await supabase.functions.invoke("admin-update-user-email", {
    body: { targetUserId: userId, newEmail },
  })

  if (error) throw new Error(error.message)

  const response = (data ?? {}) as { success?: boolean; message?: string }
  if (!response.success) throw new Error(response.message ?? "Email update failed")

  toast.success("Email updated")
}

export async function removeUser(userId: string) {
  if (!supabase) return { error: "Supabase is not configured" }
  const { error } = await supabase.rpc("delete_user", { target_user_id: userId })
  if (error) { toast.error(error.message); return { error: error.message } }
  toast.success("User removed")
  return { error: null }
}

export async function inviteUser(name: string, email: string, role: string) {
  if (!supabase) throw new Error("Supabase is not configured")

  const { data, error } = await supabase.functions.invoke("admin-invite-user", {
    body: { email, displayName: name, role },
  })

  if (error) throw new Error(error.message)

  const response = (data ?? {}) as { success?: boolean; message?: string }
  if (!response.success) throw new Error(response.message ?? "Invite failed")
}

export async function resetPasswordForUser(userId: string, newPassword: string) {
  if (!supabase) throw new Error("Supabase is not configured")

  const { data, error } = await supabase.functions.invoke("admin-reset-user-password", {
    body: { targetUserId: userId, newPassword },
  })

  if (error) throw new Error(error.message)

  const response = (data ?? {}) as { success?: boolean; message?: string }
  if (!response.success) throw new Error(response.message ?? "Password reset failed")
}

export async function addRole(role: RoleDefinition) {
  if (!supabase) return
  const { error } = await supabase.rpc("create_role", {
    role_name: role.name,
    role_description: role.description,
    role_level: role.level,
  })
  if (error) { toast.error(error.message); return }
  toast.success("Role created")
}

export async function editRole(original: string, updated: Partial<RoleDefinition>) {
  if (!supabase) return
  const { error } = await supabase.rpc("update_role", {
    role_name: original,
    new_name: updated.name ?? null,
    new_description: updated.description ?? null,
    new_level: updated.level ?? null,
  })
  if (error) { toast.error(error.message); return }
  toast.success("Role updated")
}

export async function duplicateRole(sourceName: string, newName: string) {
  if (!supabase) return
  const { error } = await supabase.rpc("duplicate_role", {
    p_source_role: sourceName,
    p_new_name: newName,
  })
  if (error) { toast.error(error.message); return }
  toast.success("Role duplicated")
}

export async function removeRole(name: string) {
  if (!supabase) return
  const { data, error } = await supabase.rpc("delete_role", { role_name: name })
  if (error) { toast.error(error.message); return }

  const details = (data ?? {}) as { downgraded_users?: number; fallback_role?: string }
  if (typeof details.downgraded_users === "number" && details.downgraded_users > 0) {
    toast.success(`Role deleted. ${details.downgraded_users} users downgraded to ${details.fallback_role}.`)
  } else {
    toast.success("Role deleted")
  }
}

export async function togglePermission(role: string, permission: string, enabled: boolean) {
  if (!supabase) return

  const rpc = enabled ? "assign_role_permission" : "remove_role_permission"
  const { error } = await supabase.rpc(rpc, { target_role: role, permission_name: permission })

  if (error) { toast.error(error.message); return }
  toast.success(enabled ? "Permission assigned" : "Permission removed")
}
