# ADR 003: Exportación de Datasets Grandes

**Estado:** Propuesto  
**Fecha:** 2026-05-14

## Contexto

Las acciones de copiar y exportar pueden apuntar a un scope mayor que las filas cargadas en la UI. Las respuestas directas de RPC son aceptables para volúmenes medios, pero exportaciones muy grandes pueden alcanzar los límites de respuesta de PostgREST, presión de memoria en la base de datos o presión de memoria en el cliente.

Ambas acciones (exportar y copiar) requieren el permiso `orders.export` (nivel mínimo: admin). Este permiso fue consolidado a partir de los anteriores `orders.export` y `orders.copy`.

## Decisión

La exportación directa actual se mantiene **limitada a 10 000 filas**.

Las exportaciones grandes deberán implementarse como **jobs asíncronos**:

1. Crear un job de exportación con las operaciones de selección y el formato deseado.
2. Procesar en el servidor.
3. Exponer el estado como `pending`, `running`, `done` o `failed`.
4. Retornar un archivo descargable al completarse.

## Consecuencias

La UI puede mantener la semántica de intención server-side sin cargar todas las filas.

**No está implementado aún.** Hasta entonces, la exportación directa rechaza intencionalmente datasets grandes con un mensaje de error al usuario.

## Archivos relacionados

- `supabase/migrations/008_orders_rpcs.sql` — RPC `export_orders` con límite de 10k filas
- `src/features/orders/api.ts` — `exportOrdersByScope` en el frontend
