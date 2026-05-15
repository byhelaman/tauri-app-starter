import { describe, expect, it } from "vitest"
import { nextConnectivityStatus } from "./connectivity"

describe("nextConnectivityStatus", () => {
  it("pasa de offline a reconnecting al recuperar red", () => {
    expect(nextConnectivityStatus("offline", "online")).toBe("reconnecting")
  })

  it("solo vuelve a online después de confirmar recuperación", () => {
    expect(nextConnectivityStatus("reconnecting", "settled")).toBe("online")
  })

  it("vuelve a offline si la red cae durante reconexión", () => {
    expect(nextConnectivityStatus("reconnecting", "offline")).toBe("offline")
  })
})
