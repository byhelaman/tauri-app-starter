import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppStatusBanner } from "./app-status-banner"
import { AuthContext, type AuthHealth } from "@/contexts/auth-context-value"
import { ConnectivityContext } from "@/contexts/connectivity-context-value"
import { EMPTY_CLAIMS } from "@/lib/auth-utils"
import type { ConnectivityStatus } from "@/lib/connectivity"

function renderBanner({
  health = { status: "ok" },
  connectivity = "online",
  refreshSession = vi.fn(async () => undefined),
}: {
  health?: AuthHealth
  connectivity?: ConnectivityStatus
  refreshSession?: () => Promise<void>
} = {}) {
  return {
    refreshSession,
    ...render(
      <ConnectivityContext.Provider value={{ status: connectivity }}>
        <AuthContext.Provider
          value={{
            session: null,
            user: null,
            claims: EMPTY_CLAIMS,
            loading: false,
            health,
            refreshSession,
            signIn: vi.fn(),
            signOut: vi.fn(),
            hasPermission: vi.fn(),
          }}
        >
          <AppStatusBanner />
        </AuthContext.Provider>
      </ConnectivityContext.Provider>
    ),
  }
}

describe("AppStatusBanner", () => {
  it("prioriza el aviso de reloj incorrecto", () => {
    renderBanner({
      health: { status: "clock-skew", direction: "behind" },
      connectivity: "offline",
    })

    expect(screen.getByText(/Device time appears behind/i)).toBeInTheDocument()
    expect(screen.queryByText(/You are offline/i)).not.toBeInTheDocument()
  })

  it("muestra recuperación de conexión antes que errores genéricos de refresh", () => {
    renderBanner({
      health: { status: "refresh-error" },
      connectivity: "reconnecting",
    })

    expect(screen.getByText(/Connection restored/i)).toBeInTheDocument()
    expect(screen.queryByText(/Session refresh failed/i)).not.toBeInTheDocument()
  })

  it("permite reintentar refresh de sesión", () => {
    const { refreshSession } = renderBanner({
      health: { status: "refresh-error" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })
})
