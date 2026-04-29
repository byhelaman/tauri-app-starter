import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useRateLimit } from "./use-rate-limit"

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useRateLimit", () => {
  it("no está bloqueado al montar", () => {
    const { result } = renderHook(() => useRateLimit({ maxAttempts: 3, lockoutSeconds: 10 }))
    expect(result.current.isLocked).toBe(false)
  })

  it("incrementa attempts con cada recordFailure", () => {
    const { result } = renderHook(() => useRateLimit({ maxAttempts: 5, lockoutSeconds: 30 }))
    act(() => { result.current.recordFailure() })
    act(() => { result.current.recordFailure() })
    expect(result.current.attempts).toBe(2)
  })

  it("se bloquea al alcanzar maxAttempts", () => {
    const { result } = renderHook(() => useRateLimit({ maxAttempts: 2, lockoutSeconds: 30 }))
    act(() => { result.current.recordFailure() })
    act(() => { result.current.recordFailure() })
    expect(result.current.isLocked).toBe(true)
  })

  it("lockoutRemaining tiene el valor de lockoutSeconds al bloquearse", () => {
    const { result } = renderHook(() => useRateLimit({ maxAttempts: 1, lockoutSeconds: 15 }))
    act(() => { result.current.recordFailure() })
    expect(result.current.lockoutRemaining).toBe(15)
  })

  it("reduce lockoutRemaining cada segundo", () => {
    const { result } = renderHook(() => useRateLimit({ maxAttempts: 1, lockoutSeconds: 5 }))
    act(() => { result.current.recordFailure() })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.lockoutRemaining).toBeLessThanOrEqual(4)
  })

  it("se desbloquea y reinicia attempts cuando expira el lockout", () => {
    const { result } = renderHook(() => useRateLimit({ maxAttempts: 1, lockoutSeconds: 2 }))
    act(() => { result.current.recordFailure() })
    expect(result.current.isLocked).toBe(true)
    act(() => { vi.advanceTimersByTime(2100) })
    expect(result.current.isLocked).toBe(false)
    expect(result.current.attempts).toBe(0)
  })

  it("reset() limpia el estado inmediatamente", () => {
    const { result } = renderHook(() => useRateLimit({ maxAttempts: 2, lockoutSeconds: 30 }))
    act(() => { result.current.recordFailure() })
    act(() => { result.current.recordFailure() })
    expect(result.current.isLocked).toBe(true)
    act(() => { result.current.reset() })
    expect(result.current.isLocked).toBe(false)
    expect(result.current.attempts).toBe(0)
  })

  it("persiste el estado en localStorage cuando se provee storageKey", () => {
    const { result } = renderHook(() =>
      useRateLimit({ maxAttempts: 3, lockoutSeconds: 10, storageKey: "test-limit" })
    )
    act(() => { result.current.recordFailure() })
    expect(localStorage.getItem("test-limit")).not.toBeNull()
  })
})
