import { createContext } from "react"
import type { Session, User } from "@supabase/supabase-js"
import type { AuthClaims } from "@/lib/auth-utils"

export type AuthHealth =
  | { status: "ok" }
  | { status: "clock-skew"; direction: "behind" | "ahead" }
  | { status: "refresh-error" }

export type AuthContextType = {
  session: Session | null
  user: User | null
  claims: AuthClaims
  loading: boolean
  health: AuthHealth
  refreshSession: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
