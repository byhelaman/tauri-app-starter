import { z } from "zod"
import type { Session } from "@supabase/supabase-js"

export type AuthClaims = {
  userRole: string
  hierarchyLevel: number
  permissions: string[]
}

export type SessionClockStatus = "ok" | "clock-behind" | "clock-ahead" | "unknown"

export const EMPTY_CLAIMS: AuthClaims = {
  userRole: "guest",
  hierarchyLevel: 0,
  permissions: [],
}

/**
 * Esquema para validar los campos del payload JWT en tiempo de ejecución.
 * NOTA: los claims solo se usan para controlar la UI (mostrar/ocultar elementos).
 * La autorización real se aplica en el servidor mediante RLS y RPCs de Supabase.
 */
export const jwtClaimsSchema = z.object({
  user_role: z.string().optional(),
  hierarchy_level: z.union([z.number(), z.string()]).optional(),
  permissions: z.array(z.string()).optional(),
})

const jwtTimingSchema = z.object({
  iat: z.number().optional(),
  exp: z.number().optional(),
})

function decodeJwtPayload(token: string): unknown {
  const [, payload] = token.split(".")
  if (!payload) throw new Error("Missing JWT payload")
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/**
 * Decodifica los custom claims del JWT de Supabase.
 * Devuelve EMPTY_CLAIMS en caso de token inválido, ausente o malformado.
 * Es fail-closed: cualquier error retorna el perfil de menor privilegio.
 */
export function parseClaims(session: Session | null): AuthClaims {
  const token = session?.access_token
  if (!token) return EMPTY_CLAIMS

  try {
    const raw = decodeJwtPayload(token)
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

/**
 * Detecta si el reloj local está fuera de la ventana temporal del JWT.
 * No decide autorización; solo sirve para UX diagnóstica.
 */
export function getSessionClockStatus(
  session: Session | null,
  nowSeconds = Math.floor(Date.now() / 1000),
  skewToleranceSeconds = 5 * 60
): SessionClockStatus {
  const token = session?.access_token
  if (!token) return "unknown"

  try {
    const parsed = jwtTimingSchema.parse(decodeJwtPayload(token))
    if (parsed.iat !== undefined && nowSeconds + skewToleranceSeconds < parsed.iat) return "clock-behind"
    if (parsed.exp !== undefined && nowSeconds - skewToleranceSeconds > parsed.exp) return "clock-ahead"
    return "ok"
  } catch {
    return "unknown"
  }
}
