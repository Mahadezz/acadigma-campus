import type { GradeLevelInput, GradeStage } from "@acadigma/contracts"

/**
 * F-ID-05 §4.3 step 3 and §5 "Grade-level presets" / "Bangla names": the
 * canonical preset list, its ordering (`level_number`, so `Class 10` always
 * sorts after `Class 9`) and the bundled Bangla names. Pure — the wizard
 * builds the `grade_levels` payload from a set of selected preset keys plus
 * any custom names, and `public.create_school_workspace` stores it as-is.
 */

export type GradeLevelPreset = {
  key: string
  name: string
  name_bn: string
  level_number: number
  stage: GradeStage
}

const CLASS_BN = [
  "প্রথম",
  "দ্বিতীয়",
  "তৃতীয়",
  "চতুর্থ",
  "পঞ্চম",
  "ষষ্ঠ",
  "সপ্তম",
  "অষ্টম",
  "নবম",
  "দশম",
  "একাদশ",
  "দ্বাদশ",
] as const

function classStage(n: number): GradeStage {
  if (n <= 5) return "primary"
  if (n <= 10) return "secondary"
  return "higher"
}

export const GRADE_LEVEL_PRESETS: readonly GradeLevelPreset[] = [
  { key: "play", name: "Play", name_bn: "প্লে", level_number: -2, stage: "early" },
  { key: "nursery", name: "Nursery", name_bn: "নার্সারি", level_number: -1, stage: "early" },
  { key: "kg", name: "KG", name_bn: "কেজি", level_number: 0, stage: "early" },
  ...CLASS_BN.map((bn, i) => ({
    key: `class_${i + 1}`,
    name: `Class ${i + 1}`,
    name_bn: `${bn} শ্রেণি`,
    level_number: i + 1,
    stage: classStage(i + 1),
  })),
  { key: "o_level", name: "O-Level", name_bn: "ও-লেভেল", level_number: 13, stage: "secondary" },
  { key: "a_level", name: "A-Level", name_bn: "এ-লেভেল", level_number: 14, stage: "higher" },
]

/** §4.3: the three range shortcuts. */
export const GRADE_LEVEL_RANGES = {
  primary: ["class_1", "class_2", "class_3", "class_4", "class_5"],
  secondary: ["class_6", "class_7", "class_8", "class_9", "class_10"],
  hsc: ["class_11", "class_12"],
} as const satisfies Record<string, readonly string[]>
export type GradeLevelRange = keyof typeof GRADE_LEVEL_RANGES

/** Custom levels sort after every preset, in the order they were added. */
export const CUSTOM_LEVEL_START = 100

/**
 * Selected preset keys + custom names → the `grade_levels` payload, sorted
 * by `level_number`. Unknown keys are ignored; a custom name that matches a
 * preset or an earlier custom name (case-insensitively) is dropped, since
 * the DB refuses two levels with the same name. Custom levels get the same
 * string in both name fields (§5) and no stage.
 */
export function buildGradeLevels(
  selectedKeys: readonly string[],
  customNames: readonly string[] = []
): GradeLevelInput[] {
  const selected = new Set(selectedKeys)
  const presets: GradeLevelInput[] = GRADE_LEVEL_PRESETS.filter((p) =>
    selected.has(p.key)
  ).map(({ name, name_bn, level_number, stage }) => ({
    name,
    name_bn,
    level_number,
    stage,
  }))

  const taken = new Set(presets.map((p) => p.name.toLowerCase()))
  const customs: GradeLevelInput[] = []
  for (const raw of customNames) {
    const name = raw.trim()
    if (!name || taken.has(name.toLowerCase())) continue
    taken.add(name.toLowerCase())
    customs.push({
      name,
      name_bn: name,
      level_number: CUSTOM_LEVEL_START + customs.length,
      stage: null,
    })
  }

  return [...presets, ...customs].sort((a, b) => a.level_number - b.level_number)
}

/** The reverse of `buildGradeLevels`, for resuming a saved draft. */
export function splitGradeLevels(levels: readonly GradeLevelInput[]): {
  selectedKeys: string[]
  customNames: string[]
} {
  const byName = new Map(GRADE_LEVEL_PRESETS.map((p) => [p.name, p.key]))
  const selectedKeys: string[] = []
  const customNames: string[] = []
  for (const level of levels) {
    const key = byName.get(level.name)
    if (key) selectedKeys.push(key)
    else customNames.push(level.name)
  }
  return { selectedKeys, customNames }
}
