export type AutocompleteInteractionMode = "none" | "keyboard" | "mouse"

export interface AutocompleteState {
  open: boolean
  inputValue: string
  activeItem: string
  interactionMode: AutocompleteInteractionMode
}

export type AutocompleteAction =
  | { type: "syncValue"; value: string }
  | { type: "setInputValue"; value: string }
  | { type: "setOpen"; open: boolean }
  | { type: "setActiveItem"; value: string }
  | { type: "setInteractionMode"; mode: AutocompleteInteractionMode }
  | { type: "select"; value: string }
  | { type: "close" }

export function createAutocompleteState(value: string): AutocompleteState {
  return {
    open: false,
    inputValue: value,
    activeItem: "",
    interactionMode: "none",
  }
}

export function autocompleteReducer(
  state: AutocompleteState,
  action: AutocompleteAction
): AutocompleteState {
  switch (action.type) {
    case "syncValue":
      return { ...state, inputValue: action.value }
    case "setInputValue":
      return { ...state, inputValue: action.value }
    case "setOpen":
      return { ...state, open: action.open }
    case "setActiveItem":
      return { ...state, activeItem: action.value }
    case "setInteractionMode":
      return { ...state, interactionMode: action.mode }
    case "select":
      return {
        ...state,
        inputValue: action.value,
        open: false,
      }
    case "close":
      return {
        ...state,
        open: false,
        interactionMode: "none",
      }
    default:
      return state
  }
}

export function filterAutocompleteOptions(
  options: { label: string; value: string }[],
  inputValue: string,
  filterClientSide: boolean
) {
  if (!filterClientSide || !inputValue) return options
  const lowerValue = inputValue.toLowerCase()
  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(lowerValue) ||
      option.value.toLowerCase().includes(lowerValue)
  )
}

export function isCustomAutocompleteValue({
  filterClientSide,
  restrictive,
  inputValue,
  options,
}: {
  filterClientSide: boolean
  restrictive: boolean
  inputValue: string
  options: { label: string; value: string }[]
}) {
  const normalizedValue = inputValue.trim()
  return (
    filterClientSide &&
    !restrictive &&
    normalizedValue !== "" &&
    !options.some((option) => option.value.toLowerCase() === normalizedValue.toLowerCase())
  )
}
