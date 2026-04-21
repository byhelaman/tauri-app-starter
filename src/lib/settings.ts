import { z } from "zod"

export interface AppSettings {
  launchAtLogin: boolean
  startMinimized: boolean
  closeToTray: boolean
  emailNotifications: boolean
  pushNotifications: boolean
  weeklyDigest: boolean
  showOnlineStatus: boolean
  usageAnalytics: boolean
  autoUpdate: boolean
  askExportLocation: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  startMinimized: false,
  closeToTray: true,
  emailNotifications: false,
  pushNotifications: false,
  weeklyDigest: false,
  showOnlineStatus: false,
  usageAnalytics: false,
  autoUpdate: false,
  askExportLocation: true,
}

// Esquema en tiempo de ejecución para que valores almacenados corruptos u obsoletos
// se rechacen y las claves desconocidas se eliminen, evitando errores de tipo silenciosos.
const appSettingsSchema = z.object({
  launchAtLogin: z.boolean(),
  startMinimized: z.boolean(),
  closeToTray: z.boolean(),
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  weeklyDigest: z.boolean(),
  showOnlineStatus: z.boolean(),
  usageAnalytics: z.boolean(),
  autoUpdate: z.boolean(),
  askExportLocation: z.boolean(),
}).partial()

export const SETTINGS_STORAGE_KEY = "app-settings"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = appSettingsSchema.parse(JSON.parse(raw))
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function syncGeneralSettings(settings: AppSettings) {
  if (!isTauri) return
  try {
    const [{ load }, autostart] = await Promise.all([
      import("@tauri-apps/plugin-store"),
      import("@tauri-apps/plugin-autostart"),
    ])
    const store = await load("settings.json", { autoSave: true, defaults: {} })
    await store.set("startMinimized", settings.startMinimized)
    await store.set("closeToTray", settings.closeToTray)
    const current = await autostart.isEnabled()
    if (settings.launchAtLogin && !current) await autostart.enable()
    else if (!settings.launchAtLogin && current) await autostart.disable()
  } catch (err) {
    console.error("Failed to sync general settings", err)
  }
}
