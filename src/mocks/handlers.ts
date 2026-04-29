/**
 * MSW handlers — solo dashboard mock data.
 *
 * Los handlers de /api/orders, /api/queue-orders y /api/orders/history
 * fueron eliminados: orders ahora usa Supabase directamente.
 *
 * MSW solo se activa cuando VITE_USE_MOCKS=true o cuando no hay
 * VITE_SUPABASE_URL configurado (ver main.tsx).
 */
export const handlers: never[] = []
