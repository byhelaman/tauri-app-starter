export type ConnectivityStatus = "online" | "offline" | "reconnecting"

export function nextConnectivityStatus(
  current: ConnectivityStatus,
  event: "offline" | "online" | "settled"
): ConnectivityStatus {
  if (event === "offline") return "offline"
  if (event === "online") return current === "offline" ? "reconnecting" : "online"
  return current === "reconnecting" ? "online" : current
}
