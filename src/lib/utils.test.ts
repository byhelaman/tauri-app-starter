import { describe, expect, it } from "vitest"
import {
  cn,
  filterByMultiSearch,
  getInitials,
  joinSearchValues,
  matchesSearchGroups,
  normalizeSearchGroups,
} from "./utils"

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

describe("multi-search utils", () => {
  it("joins values in lowercase", () => {
    expect(joinSearchValues(["John", null, "DOE", 42])).toBe("john doe 42")
  })

  it("normalizes comma-separated groups", () => {
    expect(normalizeSearchGroups(" ana perez, maria, rosa diaz ")).toEqual([
      ["ana", "perez"],
      ["maria"],
      ["rosa", "diaz"],
    ])
  })

  it("matches at least one comma-separated group", () => {
    const groups = normalizeSearchGroups("ana perez, maria")
    expect(matchesSearchGroups("maria lopez", groups)).toBe(true)
    expect(matchesSearchGroups("ana perez", groups)).toBe(true)
    expect(matchesSearchGroups("rosa diaz", groups)).toBe(false)
  })

  it("filters a collection with AND semantics", () => {
    const users = [
      { name: "John Doe", email: "john@company.com" },
      { name: "Jane Roe", email: "jane@company.com" },
    ]

    const filtered = filterByMultiSearch(users, "john company", (user) => [user.name, user.email])
    expect(filtered).toEqual([{ name: "John Doe", email: "john@company.com" }])
  })

  it("filters with OR semantics across comma-separated groups", () => {
    const users = [
      { name: "Ana Perez", email: "ana@company.com" },
      { name: "Maria Lopez", email: "maria@company.com" },
      { name: "Rosa Diaz", email: "rosa@company.com" },
    ]

    const filtered = filterByMultiSearch(users, "ana, maria", (user) => [user.name, user.email])
    expect(filtered).toEqual([
      { name: "Ana Perez", email: "ana@company.com" },
      { name: "Maria Lopez", email: "maria@company.com" },
    ])
  })

  it("returns all items when query is empty", () => {
    const data = [{ value: "a" }, { value: "b" }]
    const filtered = filterByMultiSearch(data, "   ", (item) => [item.value])
    expect(filtered).toEqual(data)
  })
})
