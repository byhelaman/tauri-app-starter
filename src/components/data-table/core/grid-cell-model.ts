import type { DataTableGridCellInteraction } from "./data-table-types"

export const GRID_CELL_SELECTOR = "[data-grid-cell='true']"
const GRID_INTERACTIVE_SELECTOR = "button, [role='checkbox'], input, textarea, select, [tabindex='0']"

export function gridCellFromElement(element: Element | null) {
  return element?.closest<HTMLTableCellElement>(GRID_CELL_SELECTOR) ?? null
}

export function gridCellInteraction(cell: HTMLTableCellElement): DataTableGridCellInteraction {
  const interaction = cell.dataset.gridCellInteraction
  return interaction === "editable" || interaction === "control" ? interaction : "readonly"
}

export function gridCellCopyValue(cell: HTMLTableCellElement) {
  return cell.querySelector<HTMLElement>("[data-grid-copy-value]")?.dataset.gridCopyValue
}

export function findGridInteractiveControl(cell: HTMLTableCellElement) {
  return cell.querySelector<HTMLElement>(GRID_INTERACTIVE_SELECTOR)
}

export function shouldDelegateCellBackgroundClick(cell: HTMLTableCellElement) {
  return gridCellInteraction(cell) === "control" && !!findGridInteractiveControl(cell)
}
