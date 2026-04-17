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
// Supabase no puede detectar el estado primer plano/segundo plano en entornos que no son
// navegador, por lo que lo manejamos manualmente mediante eventos de visibilidad y foco.
//
// Rate limiting: el refresh de sesión lo disparan eventos del SO (focus/blur, visibilitychange).
// Supabase aplica validación de tokens en el servidor en cada llamada RPC, por lo que aunque
// el refresh se ejecute con frecuencia el riesgo se limita a peticiones de red extra.
// El buffer de 5 minutos de expiración evita llamadas de refresh innecesarias.
let isAutoRefreshActive = false

export const startSessionRefresh = () => {
  if (supabase && !isAutoRefreshActive) {
    supabase.auth.startAutoRefresh()
    isAutoRefreshActive = true
  }
}

export const stopSessionRefresh = () => {
  if (supabase && isAutoRefreshActive) {
    supabase.auth.stopAutoRefresh()
    isAutoRefreshActive = false
  }
}

if (supabase && typeof window !== "undefined") {
  const client = supabase
  startSessionRefresh()

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      startSessionRefresh()
      const { data: { session } } = await client.auth.getSession()
      if (session?.expires_at) {
        const secondsUntilExpiry = session.expires_at - Math.floor(Date.now() / 1000)
        if (secondsUntilExpiry < 5 * 60) {
          await client.auth.refreshSession()
        }
      }
    } else {
      stopSessionRefresh()
    }
  })

  window.addEventListener("focus", startSessionRefresh)
  window.addEventListener("blur", stopSessionRefresh)
}
