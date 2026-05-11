# ADR 003: Large Dataset Export

## Status

Proposed.

## Context

Copy and export actions can target a scope larger than the rows loaded in the UI.
Direct RPC responses are acceptable for medium outputs, but very large exports can hit PostgREST response limits, database memory pressure, or client memory pressure.

## Decision

Current direct export remains capped at 10,000 rows.

Large exports should be implemented as asynchronous jobs:

- create export job with selection operations and format.
- process server-side.
- expose status as `pending`, `running`, `done`, or `failed`.
- return a downloadable file when complete.

## Consequences

The UI can keep server-side intent semantics without loading all rows.

This is not implemented yet. Until then, direct export intentionally rejects large datasets.
