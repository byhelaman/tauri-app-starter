import { renderHook } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { useAppShortcuts } from "./use-app-shortcuts"

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

function dispatchMalformedKeydown(init: Record<string, unknown>) {
  const event = new Event("keydown", { bubbles: true, cancelable: true })
  for (const [key, value] of Object.entries(init)) {
    Object.defineProperty(event, key, { value, configurable: true })
  }
  document.dispatchEvent(event)
}

describe("useAppShortcuts", () => {
  it("ignores keydown events without a string key", () => {
    const onSetModal = vi.fn()

    renderHook(() => useAppShortcuts({ canOpenSystem: true, onSetModal }), { wrapper })

    expect(() => {
      dispatchMalformedKeydown({ key: undefined, code: "Unidentified", ctrlKey: true })
    }).not.toThrow()

    expect(onSetModal).not.toHaveBeenCalled()
  })

  it("uses KeyboardEvent.code for shortcuts that depend on physical keys", () => {
    const onSetModal = vi.fn()

    renderHook(() => useAppShortcuts({ canOpenSystem: true, onSetModal }), { wrapper })
    dispatchMalformedKeydown({
      key: undefined,
      code: "KeyP",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
    })

    expect(onSetModal).toHaveBeenCalledWith("profile")
  })
})
