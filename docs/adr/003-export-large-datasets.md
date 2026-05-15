# ADR 003: Exportación de Datasets Grandes

**Estado:** Aceptado, implementación diferida  
**Fecha:** 2026-05-14

## Contexto

Las acciones de copiar y exportar pueden apuntar a un scope mayor que las filas cargadas en la UI. Las respuestas directas de RPC son aceptables para volúmenes medios, pero exportaciones muy grandes pueden alcanzar los límites de respuesta de PostgREST, presión de memoria en la base de datos o presión de memoria en el cliente.

Ambas acciones (exportar y copiar) requieren el permiso `orders.export` (nivel mínimo: admin). Este permiso fue consolidado a partir de los anteriores `orders.export` y `orders.copy`.

## Decisión

La exportación directa actual se mantiene **limitada a 10 000 filas** mediante
`export_orders_by_selection`.

Ese flujo ya es server-side por scope/selección: el frontend envía intención y el
backend genera el contenido sin descargar IDs o filas completas previamente. Sin
embargo, sigue siendo síncrono: Postgres construye el archivo en memoria y lo
devuelve dentro de la misma respuesta RPC.

Para datasets por encima de 10 000 filas, el diseño aprobado es un **job
asíncrono server-side**, no una ampliación del límite de la RPC directa:

1. Crear un job de exportación con las operaciones de selección y el formato deseado.
2. Procesarlo fuera del request interactivo, mediante Edge Function o worker.
3. Exponer el estado como `pending`, `running`, `done` o `failed`.
4. Generar el archivo en Storage.
5. Retornar una descarga cuando el job esté `done`.

La implementación del job queda **deliberadamente diferida** hasta que exista un
caso de uso real que requiera exports mayores a 10 000 filas con suficiente
frecuencia como para justificar bucket, worker, limpieza y UI de seguimiento.

## Consecuencias

La UI puede mantener la semántica de intención server-side sin cargar todas las filas.

Hasta que el job exista:

- los exports de hasta 10 000 filas usan la RPC directa actual;
- los exports mayores se rechazan intencionalmente con un mensaje explícito;
- no se debe resolver el caso descargando 20k/50k IDs ni ampliando
  indefinidamente el payload síncrono.

Cuando se implemente, las piezas esperadas son:

- tabla `export_jobs`;
- bucket/objeto de Storage con expiración;
- RPC para crear y consultar jobs;
- worker/Edge Function para procesarlos;
- limpieza periódica de artefactos;
- UI de progreso y descarga.

## Archivos relacionados

- `supabase/migrations/008_orders_rpcs.sql` — RPC `export_orders_by_selection` con límite de 10k filas
- `src/features/orders/api.ts` — `exportOrdersByScope` en el frontend
