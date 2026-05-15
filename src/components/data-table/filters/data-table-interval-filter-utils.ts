import type { Column } from "@tanstack/react-table"

/**
 * Retorna las horas disponibles para el filtro.
 * - Si se pasan `hours` desde el servidor: usalas directamente.
 * - Fallback: rango completo 00-23.
 *
 * No usamos getFacetedUniqueValues() porque con paginacion server-side
 * solo contiene las filas de la pagina actual, no el total de la BD.
 */
export function getAvailableHours<TData, TValue>(
  _column: Column<TData, TValue>,
  hours?: string[]
): string[] {
  if (hours && hours.length > 0) return hours
  return Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
}
