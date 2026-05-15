import { describe, expect, it, beforeEach } from "vitest"
import { bulkCopySettingsKey, buildBulkCopyText } from "./bulk-copy"
import { expandDataActionFields } from "./data-action-fields"

const rows = [
    {
        date: "2026-04-19",
        start_time: "13:30",
        end_time: "14:30",
        code: "ORD-D3FE4",
    },
]

describe("bulk copy field expansion", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("expands the visual time field to start_time and end_time", () => {
        expect(expandDataActionFields(["date", "time", "code"])).toEqual([
            "date",
            "start_time",
            "end_time",
            "code",
        ])
    })

    it("copies time as separate physical fields in delimited formats", () => {
        localStorage.setItem(
            bulkCopySettingsKey("orders-test"),
            JSON.stringify({ format: "tsv", headers: true, fields: ["time"] }),
        )

        expect(buildBulkCopyText(rows, "orders-test", ["time", "code"])).toBe(
            "start_time\tend_time\n13:30\t14:30",
        )
    })

    it("copies time as separate physical fields in json format", () => {
        localStorage.setItem(
            bulkCopySettingsKey("orders-test"),
            JSON.stringify({ format: "json", headers: true, fields: ["time"] }),
        )

        expect(buildBulkCopyText(rows, "orders-test", ["time", "code"])).toBe(JSON.stringify([
            { start_time: "13:30", end_time: "14:30" },
        ], null, 2))
    })

    it("allows custom templates to reference the physical time fields", () => {
        localStorage.setItem(
            bulkCopySettingsKey("orders-test"),
            JSON.stringify({
                format: "custom",
                template: "{start_time} -> {end_time}",
                fields: ["time"],
            }),
        )

        expect(buildBulkCopyText(rows, "orders-test", ["time", "code"])).toBe("13:30 -> 14:30")
    })
})
