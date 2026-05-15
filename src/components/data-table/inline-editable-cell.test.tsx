import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { InlineEditableCell } from "./inline-editable-cell"

const CHANNEL_OPTIONS = ["Online", "Retail", "Partner", "Phone"].map((value) => ({
  label: value,
  value,
}))

function renderChannelCell(onCommit = vi.fn()) {
  const view = render(
    <InlineEditableCell
      value="Online"
      enableEditing
      validate={(value) => CHANNEL_OPTIONS.some((option) => option.value === value.trim())}
      validationMessage="Please select a valid option from the list."
      autocompleteOptions={CHANNEL_OPTIONS}
      onCommit={onCommit}
    />
  )

  return { ...view, onCommit }
}

function ControlledChannelCell() {
  const [value, setValue] = useState("Online")

  return (
    <InlineEditableCell
      value={value}
      enableEditing
      validate={(nextValue) => CHANNEL_OPTIONS.some((option) => option.value === nextValue.trim())}
      validationMessage="Please select a valid option from the list."
      autocompleteOptions={CHANNEL_OPTIONS}
      onCommit={(nextValue) => setValue(nextValue)}
    />
  )
}

function ControlledPlainGrid() {
  const [value, setValue] = useState("First")

  return (
    <table>
      <tbody>
        <tr>
          <td>
            <InlineEditableCell value={value} enableEditing onCommit={setValue} />
          </td>
        </tr>
        <tr>
          <td>
            <InlineEditableCell value="Second" enableEditing />
          </td>
        </tr>
      </tbody>
    </table>
  )
}

describe("InlineEditableCell", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    Element.prototype.scrollIntoView = vi.fn()
  })

  it("recovers after clearing an autocomplete cell and rejecting the invalid value", async () => {
    const { onCommit } = renderChannelCell()

    const cell = screen.getByText("Online").closest("[tabindex='0']") as HTMLElement
    fireEvent.doubleClick(cell)

    const input = screen.getByRole("combobox")
    expect(input).toHaveValue("Online")

    fireEvent.change(input, { target: { value: "" } })
    expect(input).toHaveValue("")

    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findByText("Data Validation Error")).toBeInTheDocument()
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText("Cancel"))

    await waitFor(() => {
      expect(screen.queryByText("Data Validation Error")).not.toBeInTheDocument()
    })

    const restoredCell = screen.getByText("Online").closest("[tabindex='0']") as HTMLElement
    fireEvent.doubleClick(restoredCell)

    expect(screen.getByRole("combobox")).toHaveValue("Online")
  })

  it("recovers when Delete opens an autocomplete cell with an empty draft", async () => {
    const { onCommit } = renderChannelCell()

    const cell = screen.getByText("Online").closest("[tabindex='0']") as HTMLElement
    fireEvent.keyDown(cell, { key: "Delete" })

    const input = screen.getByRole("combobox")
    expect(input).toHaveValue("")

    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findByText("Data Validation Error")).toBeInTheDocument()
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText("Cancel"))

    await waitFor(() => {
      expect(screen.queryByText("Data Validation Error")).not.toBeInTheDocument()
    })

    const restoredCell = screen.getByText("Online").closest("[tabindex='0']") as HTMLElement
    fireEvent.doubleClick(restoredCell)

    expect(screen.getByRole("combobox")).toHaveValue("Online")
  })

  it("keeps an autocomplete cell editable after retrying an invalid cleared value", async () => {
    const { onCommit } = renderChannelCell()

    const cell = screen.getByText("Online").closest("[tabindex='0']") as HTMLElement
    fireEvent.doubleClick(cell)

    const input = screen.getByRole("combobox")
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findByText("Data Validation Error")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Retry"))

    await waitFor(() => {
      expect(screen.queryByText("Data Validation Error")).not.toBeInTheDocument()
    })

    const retryInput = screen.getByRole("combobox")
    fireEvent.change(retryInput, { target: { value: "Retail" } })
    fireEvent.keyDown(retryInput, { key: "Enter" })

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith("Retail", true)
    })
  })

  it("clears the visual error state when an invalid autocomplete edit is cancelled after a valid edit", async () => {
    render(<ControlledChannelCell />)

    const initialCell = screen.getByText("Online").closest("[tabindex='0']") as HTMLElement
    fireEvent.doubleClick(initialCell)

    const firstInput = screen.getByRole("combobox")
    fireEvent.change(firstInput, { target: { value: "Retail" } })
    fireEvent.keyDown(firstInput, { key: "Enter" })

    const editedCell = await screen.findByText("Retail")
    const editedCellContainer = editedCell.closest("[tabindex='0']") as HTMLElement
    expect(editedCellContainer).not.toHaveAttribute("aria-invalid")

    fireEvent.doubleClick(editedCellContainer)

    const secondInput = screen.getByRole("combobox")
    fireEvent.change(secondInput, { target: { value: "" } })
    fireEvent.keyDown(secondInput, { key: "Enter" })

    expect(await screen.findByText("Data Validation Error")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Cancel"))

    await waitFor(() => {
      expect(screen.queryByText("Data Validation Error")).not.toBeInTheDocument()
    })

    const restoredCell = screen.getByText("Retail").closest("[tabindex='0']") as HTMLElement
    expect(restoredCell).not.toHaveAttribute("aria-invalid")
  })

  it("moves focus to the next row after committing a controlled plain input with Enter", async () => {
    render(<ControlledPlainGrid />)

    const firstCell = screen.getByText("First").closest("[tabindex='0']") as HTMLElement
    fireEvent.doubleClick(firstCell)

    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "First updated" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => {
      expect(screen.getByText("First updated")).toBeInTheDocument()
      expect(screen.getByText("Second").closest("[tabindex='0']")).toHaveFocus()
    })
  })

})
