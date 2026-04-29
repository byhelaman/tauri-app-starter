import { describe, it, expect } from "vitest"
import { parseClaims, EMPTY_CLAIMS } from "./auth-utils"
import type { Session } from "@supabase/supabase-js"

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Construye un JWT mínimo con el payload dado.
 * El header y la firma son stubs; parseClaims solo lee el segmento del medio.
 */
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body = btoa(JSON.stringify(payload))
  return `${header}.${body}.stub-signature`
}

function makeSession(payload: Record<string, unknown>): Session {
  return { access_token: makeJwt(payload) } as unknown as Session
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("parseClaims", () => {
  it("devuelve EMPTY_CLAIMS cuando la sesión es null", () => {
    expect(parseClaims(null)).toEqual(EMPTY_CLAIMS)
  })

  it("devuelve EMPTY_CLAIMS cuando no hay access_token", () => {
    expect(parseClaims({} as Session)).toEqual(EMPTY_CLAIMS)
  })

  it("parsea claims estándar correctamente", () => {
    const session = makeSession({
      user_role: "admin",
      hierarchy_level: 80,
      permissions: ["users.manage", "roles.edit"],
    })
    expect(parseClaims(session)).toEqual({
      userRole: "admin",
      hierarchyLevel: 80,
      permissions: ["users.manage", "roles.edit"],
    })
  })

  it("convierte hierarchy_level string a número", () => {
    const session = makeSession({ user_role: "member", hierarchy_level: "10" })
    expect(parseClaims(session).hierarchyLevel).toBe(10)
  })

  it("aplica defaults cuando faltan claims opcionales", () => {
    const session = makeSession({ sub: "user-id" })
    expect(parseClaims(session)).toEqual({
      userRole: "guest",
      hierarchyLevel: 0,
      permissions: [],
    })
  })

  it("es fail-closed: devuelve EMPTY_CLAIMS con JWT base64 inválido", () => {
    const session = { access_token: "header.!!!invalid_base64!!!.sig" } as unknown as Session
    expect(parseClaims(session)).toEqual(EMPTY_CLAIMS)
  })

  it("es fail-closed: devuelve EMPTY_CLAIMS con JWT de 1 segmento", () => {
    const session = { access_token: "not-a-jwt" } as unknown as Session
    expect(parseClaims(session)).toEqual(EMPTY_CLAIMS)
  })

  it("es fail-closed: devuelve EMPTY_CLAIMS con payload JSON inválido", () => {
    // base64url de "{bad json"
    const badPayload = btoa("{bad json")
    const session = { access_token: `header.${badPayload}.sig` } as unknown as Session
    expect(parseClaims(session)).toEqual(EMPTY_CLAIMS)
  })

  it("tolera claims con tipo incorrecto y los ignora (Zod falla → EMPTY_CLAIMS)", () => {
    // permissions debería ser string[] pero recibe número
    const session = makeSession({ user_role: "admin", permissions: 42 })
    expect(parseClaims(session)).toEqual(EMPTY_CLAIMS)
  })

  it("preserva un array de permisos vacío sin agregar items", () => {
    const session = makeSession({ user_role: "guest", permissions: [] })
    expect(parseClaims(session).permissions).toHaveLength(0)
  })
})
