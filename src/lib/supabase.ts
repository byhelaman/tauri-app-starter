import { createClient } from "@supabase/supabase-js"

export const STORAGE_KEY_URL = "app_supabase_url"
export const STORAGE_KEY_ANON = "app_supabase_anon_key"

// Las variables de entorno tienen prioridad; localStorage es el fallback para el flujo de setup en escritorio.
//
// Nota de seguridad: la "anon key" de Supabase es una clave *pública* por diseño — es seguro
// incluirla en el bundle del cliente y guardarla en localStorage. Solo concede acceso a las filas
// permitidas por las políticas de Row-Level Security (RLS). Nunca guardar aquí la service-role key.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  (typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY_URL) : null) ||
  ""

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY_ANON) : null) ||
  ""

export const isSupabaseConfigured = Boolean(supabaseUrl) && Boolean(supabaseAnonKey)

/** Saves Supabase credentials to localStorage and reloads the app */
export function saveSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem(STORAGE_KEY_URL, url)
  localStorage.setItem(STORAGE_KEY_ANON, anonKey)
  window.location.reload()
}

/** Returns the currently saved config (from env or localStorage) */
export function getSupabaseConfig() {
  return { url: supabaseUrl, anonKey: supabaseAnonKey }
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "app-auth-token",
      storage: localStorage,
      flowType: "pkce",
    },
  })
  : null

/**
 * Creates a short-lived Supabase client that never persists auth state.
 * Useful for background auth actions (invite/reset) without mutating current session.
 */
export function createIsolatedSupabaseClient() {
  if (!isSupabaseConfigured) return null

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

// ── Auto-refresh para apps de escritorio con Tauri ──────────────────────
// Supabase-js no detecta foreground/background en Tauri, así que gestionamos
// el refresco de sesión manualmente con eventos de visibilidad y foco.
//
// Diseño: autoRefresh NUNCA se detiene — solo dispara ~1 request/hora y previene
// que el JWT expire en background (laptop sleep, app minimizada largo rato).
// Al volver al foco, forzamos un refresh síncrono ANTES de que React Query
// dispare refetchOnWindowFocus, evitando 401s con tokens expirados.

/**
 * Configura los listeners de refresco de sesión para Tauri desktop.
 * Llamar UNA vez al inicio de la app (desde main.tsx). Devuelve una función de cleanup.
 */
export function setupDesktopSessionRefresh(): () => void {
  if (!supabase || typeof window === "undefined") return () => {}
  const client = supabase

  // Arrancar autoRefresh una vez — nunca lo detenemos.
  client.auth.startAutoRefresh()

  let isRefreshing = false

  const handleResume = async () => {
    if (isRefreshing) return
    isRefreshing = true
    try {
      const { data: { session } } = await client.auth.getSession()
      if (session?.expires_at) {
        const secondsUntilExpiry = session.expires_at - Math.floor(Date.now() / 1000)
        if (secondsUntilExpiry < 5 * 60) {
          await client.auth.refreshSession()
        }
      }
    } catch {
      // El auto-refresh de Supabase reintentará; no bloquear el hilo del evento.
    } finally {
      isRefreshing = false
    }
  }

  const handleVisibility = () => {
    if (document.visibilityState === "visible") void handleResume()
  }
  const handleFocus = () => void handleResume()

  document.addEventListener("visibilitychange", handleVisibility)
  window.addEventListener("focus", handleFocus)

  return () => {
    document.removeEventListener("visibilitychange", handleVisibility)
    window.removeEventListener("focus", handleFocus)
    client.auth.stopAutoRefresh()
  }
}
