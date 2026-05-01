export type RowSelectionState = Record<string, boolean>

export function selectIds(current: RowSelectionState, ids: string[]): RowSelectionState {
  const next: RowSelectionState = { ...current }
  for (const id of ids) next[id] = true
  return next
}

export function deselectIds(current: RowSelectionState, ids: string[]): RowSelectionState {
  const next: RowSelectionState = { ...current }
  for (const id of ids) delete next[id]
  return next
}

export function selectedIdsInScope(selection: RowSelectionState, scopeIds: string[]): string[] {
  const scope = new Set(scopeIds)
  return Object.keys(selection).filter((id) => selection[id] && scope.has(id))
}
