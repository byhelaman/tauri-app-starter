import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { chatHistoryKey } from "@/features/chat/use-chat"
import { getSessionClockStatus, parseClaims } from "@/lib/auth-utils"
import { AuthContext } from "./auth-context-value"
import type { AuthHealth } from "./auth-context-value"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const refreshingRef = useRef(false)
  const claims = useMemo(() => parseClaims(session), [session])
  const health = useMemo<AuthHealth>(() => {
    const clockStatus = getSessionClockStatus(session)
    if (clockStatus === "clock-behind") return { status: "clock-skew", direction: "behind" }
    if (clockStatus === "clock-ahead" && refreshFailed) return { status: "clock-skew", direction: "ahead" }
    if (refreshFailed) return { status: "refresh-error" }
    return { status: "ok" }
  }, [refreshFailed, session])

  const hasPermission = useCallback((permission: string) => {
    if (claims.hierarchyLevel >= 100) return true
    return claims.permissions.includes(permission)
  }, [claims])

  const refreshClaimsSession = useCallback(async () => {
    if (!supabase || refreshingRef.current) return

    refreshingRef.current = true
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        console.error("Failed to refresh session after RBAC change:", error)
        setRefreshFailed(true)
        return
      }

      setRefreshFailed(false)
      setSession(data.session ?? null)
    } catch (error) {
      console.error("Unexpected refresh error:", error)
      setRefreshFailed(true)
    } finally {
      refreshingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setRefreshFailed(false)
        setSession(session)
      })
      .catch((err) => {
        console.error("Failed to get session:", err)
      })
      .finally(() => {
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setRefreshFailed(false)
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      void refreshClaimsSession()
    }
    window.addEventListener("online", handleOnline)
    return () => window.removeEventListener("online", handleOnline)
  }, [refreshClaimsSession])

  useEffect(() => {
    if (!supabase || !session?.user?.id) return
    const client = supabase

    const channel = client
      .channel(`auth-rbac-sync-${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${session.user.id}`,
        },
        async (payload) => {
          const beforeRole = (payload.old as { role?: string } | null)?.role
          const afterRole = (payload.new as { role?: string } | null)?.role

          if (beforeRole === afterRole) return
          await refreshClaimsSession()
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "role_permissions",
          filter: `role=eq.${claims.userRole}`,
        },
        async () => {
          await refreshClaimsSession()
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "roles",
          filter: `name=eq.${claims.userRole}`,
        },
        async () => {
          await refreshClaimsSession()
        }
      )

    // Los owners reciben todos los permisos dinámicamente, por lo que cambios en el catálogo afectan sus claims.
    if (claims.hierarchyLevel >= 100) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "permissions",
        },
        async () => {
          await refreshClaimsSession()
        }
      )
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Auth RBAC realtime channel failed")
      }
    })

    return () => {
      void client.removeChannel(channel)
    }
  }, [session?.user?.id, claims.userRole, claims.hierarchyLevel, refreshClaimsSession])

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: new Error("Supabase is not configured") }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    // Capturar el userId antes de cerrar sesión para limpiar PII y credenciales locales
    const userId = session?.user?.id
    await supabase?.auth.signOut()
    if (userId) {
      try { localStorage.removeItem(chatHistoryKey(userId)) } catch { /* ignore */ }
      // Hemos removido la limpieza artificial de apiKeyStorageKey y modelStorageKey
      // para que el usuario no pierda su configuración local al cerrar su sesión.
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        claims,
        loading,
        health,
        refreshSession: refreshClaimsSession,
        signIn,
        signOut,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

