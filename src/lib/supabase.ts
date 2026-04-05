import { createClient } from "@supabase/supabase-js"

const STORAGE_KEY_URL = "app_supabase_url"
const STORAGE_KEY_ANON = "app_supabase_anon_key"

// Env vars take precedence; localStorage is the fallback for desktop setup
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

// ── Auto-refresh management for Tauri desktop apps ──────────────────────
// Supabase cannot detect foreground/background state in non-browser
// environments, so we drive it manually via visibility/focus events.

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

if (isSupabaseConfigured && typeof window !== "undefined") {
  startSessionRefresh()

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      startSessionRefresh()
      const { data: { session } } = await supabase!.auth.getSession()
      if (session?.expires_at) {
        const secondsUntilExpiry = session.expires_at - Math.floor(Date.now() / 1000)
        if (secondsUntilExpiry < 5 * 60) {
          await supabase!.auth.refreshSession()
        }
      }
    } else {
      stopSessionRefresh()
    }
  })

  window.addEventListener("focus", startSessionRefresh)
  window.addEventListener("blur", stopSessionRefresh)
}
