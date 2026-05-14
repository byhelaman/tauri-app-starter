# ADR 002: Separación de Papelera de Órdenes

**Estado:** Aceptado  
**Fecha:** 2026-05-14

## Contexto

La app necesita operaciones de eliminación con auditabilidad, pero las consultas de órdenes activas deben mantenerse enfocadas en registros activos. Mantener filas eliminadas en `orders` mediante un campo `deleted_at` complica las consultas activas y puede generar conflictos en la reutilización de códigos de orden.

## Decisión

Las filas eliminadas se mueven de `orders` a `orders_deleted`.

- `orders` contiene únicamente registros activos.
- `orders_deleted` alimenta la UI de Papelera.

La eliminación permanente desde la Papelera requiere el permiso `orders.trash.empty` (nivel mínimo: owner).

Las operaciones de eliminación (individual y masiva) requieren el permiso `orders.delete` (nivel mínimo: admin). Los permisos `orders.bulk_delete` y `orders.copy` fueron consolidados en `orders.delete` y `orders.export` respectivamente.

## Consecuencias

Las órdenes activas son simples de consultar.

Las nuevas filas activas pueden reutilizar códigos de registros eliminados porque las filas eliminadas ya no ocupan la tabla activa.

La **restauración no está implementada**. Cuando se añada, deberá definir una política de conflictos para códigos que ya existen en `orders`.

## Archivos relacionados

- `supabase/migrations/007_orders_schema.sql` — definición de tablas y permisos
- `supabase/migrations/008_orders_rpcs.sql` — RPCs de eliminación y papelera
