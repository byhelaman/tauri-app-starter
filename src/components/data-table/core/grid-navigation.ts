export type GridDirection = "up" | "down" | "left" | "right"

const GRID_CELL_SELECTOR = "[data-grid-cell='true']"
const GRID_INTERACTIVE_SELECTOR = "button, [role='checkbox'], input, textarea, select, [tabindex='0']"

function cellFromElement(element: Element | null) {
  return element?.closest<HTMLTableCellElement>(GRID_CELL_SELECTOR) ?? null
}

function legacyCellFromElement(element: Element | null) {
  return element?.closest<HTMLTableCellElement>("td") ?? null
}

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
  const cell = cellFromElement(element)
  if (cell) {
    const target = nextGridCell(cell, direction)
    target?.focus()
    return target
  }

  const legacyCell = legacyCellFromElement(element)
  const legacyRow = legacyCell?.parentElement as HTMLTableRowElement | null
  if (!legacyCell || !legacyRow) return null

  let targetCell: Element | null | undefined = null
  if (direction === "left") targetCell = legacyCell.previousElementSibling
  if (direction === "right") targetCell = legacyCell.nextElementSibling
  if (direction === "up") targetCell = legacyRow.previousElementSibling?.children[legacyCell.cellIndex]
  if (direction === "down") targetCell = legacyRow.nextElementSibling?.children[legacyCell.cellIndex]

  const target = targetCell?.querySelector<HTMLElement>('[tabindex="0"], input, button') ?? null
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
  const editable = cell.querySelector<HTMLElement>("[data-grid-editable='true']")
  if (editable) {
    editable.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    return editable
  }

  const interactive = findGridInteractiveControl(cell)
  if (!interactive) return null

  interactive.focus()
  if (key === "Enter" && interactive instanceof HTMLButtonElement) {
    interactive.click()
  }
  return interactive
}

export function findGridInteractiveControl(cell: HTMLTableCellElement) {
  return cell.querySelector<HTMLElement>(GRID_INTERACTIVE_SELECTOR)
}
