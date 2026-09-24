import { describe, expect, it } from "vitest"

import { gradeLevelsSchema } from "@acadigma/contracts"

import {
  GRADE_LEVEL_PRESETS,
  GRADE_LEVEL_RANGES,
  buildGradeLevels,
  splitGradeLevels,
} from "./gradeLevels"

describe("GRADE_LEVEL_PRESETS", () => {
  it("orders Play → KG → Class 1..12 → O-Level → A-Level", () => {
    const names = [...GRADE_LEVEL_PRESETS]
      .sort((a, b) => a.level_number - b.level_number)
      .map((p) => p.name)
    expect(names).toEqual([
      "Play",
      "Nursery",
      "KG",
      ...Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`),
      "O-Level",
      "A-Level",
    ])
  })

  it("has a unique key, name and level number for every preset", () => {
    for (const field of ["key", "name", "level_number"] as const) {
      const values = GRADE_LEVEL_PRESETS.map((p) => p[field])
      expect(new Set(values).size).toBe(values.length)
    }
  })

  it("carries the bundled Bangla name (Class 6 → ষষ্ঠ শ্রেণি)", () => {
    const class6 = GRADE_LEVEL_PRESETS.find((p) => p.key === "class_6")
    expect(class6?.name_bn).toBe("ষষ্ঠ শ্রেণি")
    expect(GRADE_LEVEL_PRESETS.every((p) => p.name_bn.length > 0)).toBe(true)
  })

  it("every range shortcut names real presets", () => {
    const keys = new Set(GRADE_LEVEL_PRESETS.map((p) => p.key))
    for (const range of Object.values(GRADE_LEVEL_RANGES)) {
      for (const key of range) expect(keys.has(key)).toBe(true)
    }
  })
})

describe("buildGradeLevels", () => {
  it("AC9: Class 6-10 gives five rows, Class 6 … Class 10, Bangla names set", () => {
    const levels = buildGradeLevels([...GRADE_LEVEL_RANGES.secondary].reverse())
    expect(levels.map((l) => l.name)).toEqual([
      "Class 6",
      "Class 7",
      "Class 8",
      "Class 9",
      "Class 10",
    ])
    expect(levels.map((l) => l.name_bn)).toEqual([
      "ষষ্ঠ শ্রেণি",
      "সপ্তম শ্রেণি",
      "অষ্টম শ্রেণি",
      "নবম শ্রেণি",
      "দশম শ্রেণি",
    ])
    expect(levels.every((l) => l.stage === "secondary")).toBe(true)
  })

  it("sorts Class 10 after Class 9 (numeric, not string order)", () => {
    const names = buildGradeLevels(["class_10", "class_9", "class_1"]).map(
      (l) => l.name
    )
    expect(names).toEqual(["Class 1", "Class 9", "Class 10"])
  })

  it("appends custom levels after every preset, same string in both names, no stage", () => {
    const levels = buildGradeLevels(["a_level"], ["  Hifz  ", "Special Needs"])
    expect(levels).toEqual([
      {
        name: "A-Level",
        name_bn: "এ-লেভেল",
        level_number: 14,
        stage: "higher",
      },
      { name: "Hifz", name_bn: "Hifz", level_number: 100, stage: null },
      {
        name: "Special Needs",
        name_bn: "Special Needs",
        level_number: 101,
        stage: null,
      },
    ])
  })

  it("drops blank customs and customs that duplicate a preset or each other", () => {
    const levels = buildGradeLevels(
      ["class_6"],
      ["class 6", "", "Hifz", "HIFZ"]
    )
    expect(levels.map((l) => l.name)).toEqual(["Class 6", "Hifz"])
  })

  it("ignores unknown keys", () => {
    expect(buildGradeLevels(["class_99"])).toEqual([])
  })

  it("always produces a payload the contract accepts", () => {
    const levels = buildGradeLevels(
      GRADE_LEVEL_PRESETS.map((p) => p.key),
      ["Hifz"]
    )
    expect(gradeLevelsSchema.safeParse(levels).success).toBe(true)
  })
})

describe("splitGradeLevels", () => {
  it("round-trips a saved draft back into keys and custom names", () => {
    const levels = buildGradeLevels(["kg", "class_1"], ["Hifz"])
    expect(splitGradeLevels(levels)).toEqual({
      selectedKeys: ["kg", "class_1"],
      customNames: ["Hifz"],
    })
  })
})
