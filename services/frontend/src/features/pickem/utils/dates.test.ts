import { describe, expect, it } from "vitest"
import { addDays, dateIn, daysBetween, lockAt } from "@/features/pickem/utils/dates"

describe("addDays", () => {
  it("moves across the end of a month and a year", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })
})

describe("daysBetween", () => {
  it("counts whole days, also across a change of the clocks", () => {
    expect(daysBetween("2026-10-28", "2026-11-04")).toBe(7)
    expect(daysBetween("2026-11-04", "2026-10-28")).toBe(-7)
  })
})

describe("dateIn", () => {
  it("gives the date on the clock of the zone", () => {
    const lateFridayInOhio = new Date("2026-10-10T03:30:00Z")
    expect(dateIn(lateFridayInOhio, "America/New_York")).toBe("2026-10-09")
    expect(dateIn(lateFridayInOhio, "UTC")).toBe("2026-10-10")
  })
})

describe("lockAt", () => {
  it("closes at midnight in Ohio at the end of a summer game day", () => {
    expect(lockAt("2026-10-09", "America/New_York")).toBe("2026-10-10T04:00:00.000Z")
  })

  it("closes at midnight in Ohio at the end of a winter game day", () => {
    expect(lockAt("2026-12-04", "America/New_York")).toBe("2026-12-05T05:00:00.000Z")
  })

  it("reads the clock at the midnight it closes", () => {
    // The clocks go back early on 1 November 2026, after the midnight that ends 31 October.
    expect(lockAt("2026-10-31", "America/New_York")).toBe("2026-11-01T04:00:00.000Z")
    expect(lockAt("2026-11-01", "America/New_York")).toBe("2026-11-02T05:00:00.000Z")
    // The clocks go forward early on 8 March 2026.
    expect(lockAt("2026-03-07", "America/New_York")).toBe("2026-03-08T05:00:00.000Z")
    expect(lockAt("2026-03-08", "America/New_York")).toBe("2026-03-09T04:00:00.000Z")
  })

  it("is the next midnight of UTC in UTC", () => {
    expect(lockAt("2026-10-09", "UTC")).toBe("2026-10-10T00:00:00.000Z")
  })
})
