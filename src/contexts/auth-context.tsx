import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { z } from "zod"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { chatHistoryKey } from "@/components/use-chat"
import { apiKeyStorageKey, modelStorageKey } from "@/components/chat-storage"

type AuthClaims = {
  userRole: string
  hierarchyLevel: number
  permissions: string[]
}

const EMPTY_CLAIMS: AuthClaims = {
  userRole: "guest",
  hierarchyLevel: 0,
  permissions: [],
}

// Esquema para validar los campos del payload JWT en tiempo de ejecución.
// NOTA: los claims solo se usan para controlar la UI (mostrar/ocultar elementos).
// La autorización real se aplica en el servidor mediante RLS y RPCs de Supabase.
const jwtClaimsSchema = z.object({
  user_role: z.string().optional(),
  hierarchy_level: z.union([z.number(), z.string()]).optional(),
  permissions: z.array(z.string()).optional(),
})

function parseClaims(session: Session | null): AuthClaims {
  const token = session?.access_token
  if (!token) return EMPTY_CLAIMS

  try {
    const [, payload] = token.split(".")
    if (!payload) return EMPTY_CLAIMS
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    // atob produce bytes, no UTF-8 — decodificar explícitamente para soportar caracteres no-ASCII
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const raw: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const parsed = jwtClaimsSchema.parse(raw)

    return {
      userRole: parsed.user_role ?? "guest",
      hierarchyLevel: Number(parsed.hierarchy_level ?? 0),
      permissions: parsed.permissions ?? [],
    }
  } catch {
    return EMPTY_CLAIMS
  }
}

type AuthContextType = {
  session: Session | null
  user: User | null
  claims: AuthClaims
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const refreshingRef = useRef(false)
  const claims = useMemo(() => parseClaims(session), [session])

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
        return
      }

      setSession(data.session ?? null)
    } catch (error) {
      console.error("Unexpected refresh error:", error)
    } finally {
      refreshingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
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
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

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
      try { localStorage.removeItem(apiKeyStorageKey(userId)) } catch { /* ignore */ }
      try { localStorage.removeItem(modelStorageKey(userId)) } catch { /* ignore */ }
    }
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, claims, loading, signIn, signOut, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
