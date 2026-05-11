# ADR 002: Orders Trash Separation

## Status

Accepted.

## Context

The app needs delete operations with auditability, but active order queries should stay focused on active records.
Keeping deleted rows in `orders` via `deleted_at` complicates active queries and can create code reuse conflicts.

## Decision

Deleted rows are moved from `orders` into `orders_deleted`.

`orders` contains only active records.
`orders_deleted` powers the Trash UI.

Permanent removal from Trash requires the `orders.trash.empty` permission.

## Consequences

Active orders remain simple to query.
New active rows can reuse codes from deleted records because deleted rows no longer occupy the active table.

Restore is not implemented yet. When restore is added, it must define a conflict policy for codes that already exist in `orders`.
