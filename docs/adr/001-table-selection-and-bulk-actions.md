# ADR 001: Table Selection and Bulk Actions

## Status

Accepted.

## Context

The app needs Excel-like table workflows while supporting datasets larger than the rows currently loaded in the browser.
Users can select rows across filters, clear filters, apply new filters, and continue modifying the same selection.

Downloading every selected ID for large scopes is not acceptable for 20k-50k rows.

## Decision

Selection is modeled as ordered operations:

- `select` by scope.
- `deselect` by scope.
- `selectIds`.
- `deselectIds`.

The last matching operation determines whether a row is selected.

Bulk actions send either exact IDs or the ordered operation list to the backend.
The backend evaluates the final scope and executes the action server-side.

## Consequences

The frontend can show large selections without loading all rows.

Counters must be explicit:

- global selected count.
- selected count in the current view.

The selection hook requires strong regression tests because overlapping filters can create subtle state bugs.
