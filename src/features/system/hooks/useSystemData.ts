import { useEffect, useTransition } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import * as api from "@/features/system/api"
import type { RoleDefinition } from "@/features/system/types"

export function useSystemData(open: boolean) {
    const { hasPermission, claims } = useAuth()
    const queryClient = useQueryClient()
    const [isPending, startTransition] = useTransition()

    const canManageUsers = hasPermission("users.manage")
    const canViewUsers = hasPermission("users.view") || canManageUsers || claims.hierarchyLevel >= 80
    const canManageRoles = hasPermission("system.manage") || claims.hierarchyLevel >= 100
    const canViewSystem = hasPermission("system.view") || canViewUsers || canManageRoles

    const { data, isLoading, error } = useQuery({
        queryKey: ["system-data", canViewUsers],
        queryFn: () => api.fetchSystemData(canViewUsers),
        enabled: open && canViewSystem,
    })

    // Sincronización en tiempo real
    useEffect(() => {
        if (!supabase || !open || !canViewSystem) return
        const client = supabase

        const handleRefresh = () => {
            void queryClient.invalidateQueries({ queryKey: ["system-data"] })
        }

        const channel = client
            .channel("system-modal-rbac-sync")
            .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, handleRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "roles" }, handleRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "permissions" }, handleRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "role_permissions" }, handleRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "audit_log" }, handleRefresh)

        channel.subscribe()

        return () => {
            void client.removeChannel(channel)
        }
    }, [open, canViewSystem, queryClient])

    useEffect(() => {
        if (error) {
            const message = error instanceof Error ? error.message : "Could not load system data"
            toast.error(message)
        }
    }, [error])

    const invalidate = () => {
        startTransition(() => {
            void queryClient.invalidateQueries({ queryKey: ["system-data"] })
        })
    }

    const updateUserRole = async (userId: string, role: string) => {
        const result = await api.updateUserRole(userId, role)
        if (result.error) toast.error(result.error)
        else invalidate()
    }

    const updateUserDisplayName = async (userId: string, displayName: string) => {
        const result = await api.updateUserDisplayName(userId, displayName)
        if (result.error) toast.error(result.error)
        else invalidate()
    }

    const removeUser = async (userId: string) => {
        const result = await api.removeUser(userId)
        if (result.error) toast.error(result.error)
        else invalidate()
    }

    const togglePermission = async (role: string, permission: string, enabled: boolean) => {
        try {
            await api.togglePermission(role, permission, enabled)
            invalidate()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to toggle permission")
        }
    }

    const addRole = async (role: RoleDefinition) => {
        try {
            await api.addRole(role)
            invalidate()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create role")
        }
    }

    const duplicateRole = async (sourceName: string, newName: string) => {
        try {
            await api.duplicateRole(sourceName, newName)
            invalidate()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to duplicate role")
        }
    }

    const editRole = async (original: string, updated: Partial<RoleDefinition>) => {
        try {
            await api.editRole(original, updated)
            invalidate()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update role")
        }
    }

    const removeRole = async (name: string) => {
        try {
            await api.removeRole(name)
            invalidate()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete role")
        }
    }

    return {
        data: {
            users: data?.users ?? [],
            roles: data?.roles ?? [],
            permissions: data?.permissions ?? [],
            matrix: data?.matrix ?? {},
            auditEntries: data?.auditEntries ?? [],
        },
        isLoading: isLoading || isPending,
        canViewUsers,
        canManageUsers,
        canManageRoles,
        canViewSystem,
        claims,
        actions: {
            updateUserRole,
            updateUserDisplayName,
            removeUser,
            togglePermission,
            addRole,
            duplicateRole,
            editRole,
            removeRole,
        }
    }
}
