# Project Context

This app is a Tauri 2 desktop application with a React frontend and Supabase backend.
The current domain focus is operational order management with Excel-like table workflows.

## Core Data Model

- `orders` stores active order records.
- `orders_deleted` stores permanently separated trash records.
- `order_history` stores audit-visible changes.
- `order_change_events` emits aggregated realtime signals so bulk SQL operations do not create one client event per row.

## Table Model

Tables use the same `DataTable` foundation:

- Infinite scroll is visual navigation only.
- Rows are loaded in chunks of 1000.
- TanStack Virtual renders only visible rows.
- Selection and bulk actions are not limited to rows loaded in memory.

The main Orders table has full capabilities: realtime, history side panel, server-side scope actions, delete, copy/export formatting, Queue and Trash entry points.

Queue and Trash reuse the same table foundation but have independent state and reduced capabilities.

## Selection Model

Selection is represented as either exact IDs or ordered operations:

- `ids`: manual finite selection.
- `operations`: ordered `select`, `deselect`, `selectIds`, and `deselectIds` operations.

For overlapping filters, the last matching operation wins. This is intentional and matches spreadsheet-style workflows where users repeatedly narrow, select, deselect, and widen the view.

The UI shows two separate concepts:

- total selected globally.
- selected rows in the current view.

Server-side counts are the source of truth for large filtered selections.

## Bulk Actions

Bulk actions send intent to Supabase:

- exact IDs for small manual selections.
- ordered selection operations for filter/scope selections.

The frontend does not download 20k/50k IDs to represent a selection.

## Trash

Delete moves rows from `orders` to `orders_deleted`.
This keeps active queries simple and avoids blocking new active rows with reused codes.

Trash is currently visual and destructive-only:

- view deleted rows.
- remove one deleted row permanently.
- empty trash.

Restore is intentionally not implemented yet because it requires conflict handling for unique fields such as `code`.
