import { z } from "zod"
import type { Session } from "@supabase/supabase-js"

export type AuthClaims = {
  userRole: string
  hierarchyLevel: number
  permissions: string[]
}

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

/**
 * Decodifica los custom claims del JWT de Supabase.
 * Devuelve EMPTY_CLAIMS en caso de token inválido, ausente o malformado.
 * Es fail-closed: cualquier error retorna el perfil de menor privilegio.
 */
export function parseClaims(session: Session | null): AuthClaims {
  const token = session?.access_token
  if (!token) return EMPTY_CLAIMS

  try {
    const [, payload] = token.split(".")
    if (!payload) return EMPTY_CLAIMS
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    // atob puede lanzar DOMException si el string no es base64 válido.
    // TextDecoder maneja correctamente caracteres UTF-8 no-ASCII en los claims.
    let decoded: string
    try {
      const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
      decoded = new TextDecoder().decode(bytes)
    } catch {
      // JWT payload inválido — devolver claims vacíos sin contaminar la sesión
      return EMPTY_CLAIMS
    }
    const raw: unknown = JSON.parse(decoded)
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
