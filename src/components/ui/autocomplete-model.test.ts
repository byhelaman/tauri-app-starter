import { describe, expect, it } from "vitest"
import {
  autocompleteReducer,
  createAutocompleteState,
  filterAutocompleteOptions,
  isCustomAutocompleteValue,
} from "./autocomplete-model"

describe("autocomplete model", () => {
  it("closes while resetting interaction mode", () => {
    const next = autocompleteReducer(
      {
        ...createAutocompleteState("ret"),
        open: true,
        interactionMode: "keyboard",
      },
      { type: "close" }
    )

    expect(next).toEqual({
      open: false,
      inputValue: "ret",
      activeItem: "",
      interactionMode: "none",
    })
  })

  it("selects a value and closes suggestions without resetting the chosen item", () => {
    const next = autocompleteReducer(
      {
        ...createAutocompleteState("ret"),
        open: true,
        activeItem: "Retail",
        interactionMode: "keyboard",
      },
      { type: "select", value: "Retail" }
    )

    expect(next).toEqual({
      open: false,
      inputValue: "Retail",
      activeItem: "Retail",
      interactionMode: "keyboard",
    })
  })

  it("filters client-side options and detects custom values only when allowed", () => {
    const options = [
      { label: "Retail", value: "Retail" },
      { label: "Partner", value: "Partner" },
    ]

    expect(filterAutocompleteOptions(options, "ret", true)).toEqual([options[0]])
    expect(filterAutocompleteOptions(options, "ret", false)).toEqual(options)
    expect(isCustomAutocompleteValue({
      filterClientSide: true,
      restrictive: false,
      inputValue: "Phone",
      options,
    })).toBe(true)
    expect(isCustomAutocompleteValue({
      filterClientSide: true,
      restrictive: true,
      inputValue: "Phone",
      options,
    })).toBe(false)
  })
})
