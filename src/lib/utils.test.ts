import { describe, expect, it } from "vitest"
import { cn, getInitials } from "./utils"

describe("cn", () => {
  it("merges and dedupes tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
    const cond = false as boolean
    expect(cn("text-red-500", cond && "text-blue-500", "font-bold")).toBe("text-red-500 font-bold")
  })
})

describe("getInitials", () => {
  it("returns first letters of two words", () => {
    expect(getInitials("Sara Chen")).toBe("SC")
  })
  it("falls back to first two chars for single tokens or emails", () => {
    expect(getInitials("alex@company.com")).toBe("AC")
    expect(getInitials("bob")).toBe("BO")
  })
})
