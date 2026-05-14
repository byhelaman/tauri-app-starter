# ADR 001: Selección de Tabla y Acciones Masivas

**Estado:** Aceptado  
**Fecha:** 2026-05-14

## Contexto

La app necesita flujos de trabajo similares a Excel mientras soporta datasets más grandes que las filas cargadas en el navegador en un momento dado. Los usuarios pueden seleccionar filas entre filtros, limpiar filtros, aplicar nuevos filtros y seguir modificando la misma selección.

Descargar todos los IDs seleccionados para rangos grandes no es aceptable con 20k–50k filas.

## Decisión

La selección se modela como una lista ordenada de **operaciones**:

- `select` — por scope (filtros + búsqueda activos).
- `deselect` — por scope.
- `selectIds` — IDs explícitos.
- `deselectIds` — IDs explícitos.

La última operación que coincide determina si una fila está seleccionada.

Las acciones masivas envían al backend bien IDs exactos, bien la lista ordenada de operaciones. El backend evalúa el scope final y ejecuta la acción en el servidor.

## Consecuencias

El frontend puede mostrar selecciones grandes sin cargar todas las filas.

Los contadores deben ser explícitos y se derivan de la intención de selección:

- **Conteo global seleccionado** — derivado del servidor para scopes de operaciones; inmediato para selecciones por IDs.
- **Conteo seleccionado en la vista actual** — calculado localmente sobre las filas cargadas.

`operations` es la fuente de verdad de qué está seleccionado. Los conteos **no se almacenan** dentro del estado de selección porque los scopes grandes requieren evaluación en el servidor. Cuando un conteo no puede derivarse exactamente de los datos actuales, la UI expone `isSelectionCountPending = true` y deshabilita las acciones destructivas hasta que el conteo sea definitivo.

El hook de selección requiere tests de regresión robustos porque los filtros superpuestos pueden generar bugs sutiles de estado.

## Archivos relacionados

- `src/components/data-table/use-infinite-selection.ts` — implementación del hook
- `src/components/data-table/use-infinite-selection.test.tsx` — tests unitarios
- `src/components/data-table/data-table.integration.test.tsx` — tests de integración
