import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const configPath = resolve(root, "src-tauri", "tauri.conf.json")
const config = JSON.parse(readFileSync(configPath, "utf8"))

const updater = config.plugins?.updater
const pubkey = updater?.pubkey
const endpoints = updater?.endpoints ?? []

const failures = []

if (!pubkey || pubkey === "REPLACE_WITH_YOUR_PUBKEY") {
  failures.push("src-tauri/tauri.conf.json has a placeholder updater pubkey.")
}

if (
  !Array.isArray(endpoints) ||
  endpoints.length === 0 ||
  endpoints.some((endpoint) => typeof endpoint !== "string" || endpoint.includes("YOUR_USER") || endpoint.includes("YOUR_REPO"))
) {
  failures.push("src-tauri/tauri.conf.json has a placeholder updater endpoint.")
}

if (failures.length > 0) {
  console.error(failures.join("\n"))
  process.exit(1)
}
