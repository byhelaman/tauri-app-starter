import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { DataTableSearchAutocomplete } from "./data-table-search-autocomplete"

describe("DataTableSearchAutocomplete", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  it("closes suggestions and releases focus when search loses focus", async () => {
    render(
      <>
        <DataTableSearchAutocomplete
          value="ret"
          options={[{ label: "Retail", value: "Retail" }]}
          onChange={vi.fn()}
          onCommit={vi.fn()}
        />
        <button type="button">Outside</button>
      </>
    )

    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    expect(screen.getByText("Retail")).toBeInTheDocument()

    const outside = screen.getByText("Outside")
    outside.focus()
    fireEvent.blur(input)

    await waitFor(() => {
      expect(screen.queryByText("Retail")).not.toBeInTheDocument()
    })
    expect(outside).toHaveFocus()
  })
})
