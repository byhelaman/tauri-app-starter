export type GridDirection = "up" | "down" | "left" | "right"

import { findGridInteractiveControl, gridCellFromElement, gridCellInteraction, GRID_CELL_SELECTOR } from "./grid-cell-model"

function rowCells(row: HTMLTableRowElement | null) {
  return row
    ? Array.from(row.querySelectorAll<HTMLTableCellElement>(`:scope > ${GRID_CELL_SELECTOR}`))
    : []
}

function nextGridCell(cell: HTMLTableCellElement, direction: GridDirection) {
  const row = cell.parentElement as HTMLTableRowElement | null
  const cells = rowCells(row)
  const columnIndex = cells.indexOf(cell)

  if (columnIndex === -1) return null
  if (direction === "left") return cells[columnIndex - 1] ?? null
  if (direction === "right") return cells[columnIndex + 1] ?? null

  let sibling = direction === "up"
    ? row?.previousElementSibling
    : row?.nextElementSibling

  while (sibling) {
    if (sibling instanceof HTMLTableRowElement) {
      const siblingCells = rowCells(sibling)
      if (siblingCells.length > 0) return siblingCells[columnIndex] ?? null
    }
    sibling = direction === "up" ? sibling.previousElementSibling : sibling.nextElementSibling
  }

  return null
}

export function moveGridFocus(element: Element, direction: GridDirection) {
  const cell = gridCellFromElement(element)
  if (!cell) return null

  const target = nextGridCell(cell, direction)
  target?.focus()
  return target
}

export function isGridEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true
  return target.isContentEditable
}

export function gridDirectionFromKey(key: string): GridDirection | null {
  switch (key) {
    case "ArrowUp": return "up"
    case "ArrowDown": return "down"
    case "ArrowLeft": return "left"
    case "ArrowRight": return "right"
    default: return null
  }
}

export function activateGridCell(cell: HTMLTableCellElement, key: "Enter" | "F2") {
  if (gridCellInteraction(cell) === "editable") {
    const editable = cell.querySelector<HTMLElement>("[data-grid-cell-kind='editable']")
    if (!editable) return null
    editable.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    return editable
  }

  const interactive = findGridInteractiveControl(cell)
  if (!interactive) return null

  if (key === "Enter" && interactive instanceof HTMLButtonElement) {
    activateGridButton(interactive)
  } else {
    interactive.focus()
  }
  return interactive
}

function activateGridButton(button: HTMLButtonElement) {
  if (button.getAttribute("aria-haspopup") === "menu") {
    button.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    }))
    return
  }

  button.focus()
  button.click()
}
