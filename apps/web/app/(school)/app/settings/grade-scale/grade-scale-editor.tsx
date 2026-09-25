"use client"

import { useId, useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { PlusIcon, Trash2Icon } from "lucide-react"

import type { GradeScaleDto } from "@acadigma/contracts/academics/grading"
import {
  bandFor,
  checkCoverage,
  pointsDecreaseAt,
  type GradeBand,
} from "@acadigma/domain/grading"
import { Button } from "@acadigma/ui/components/button"
import { Checkbox } from "@acadigma/ui/components/checkbox"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import { SaveNotice, type Notice } from "../save-notice"
import { StickySaveBar } from "../sticky-save-bar"

import { saveGradeScale, seedBdGradeScale } from "./actions"

type Row = {
  key: number
  letter: string
  min: string
  max: string
  point: string
  isFail: boolean
}

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "")

const toRows = (bands: GradeScaleDto["bands"]): Row[] =>
  bands.map((b, i) => ({
    key: i,
    letter: b.letter,
    min: b.minPercent.toFixed(2),
    max: b.maxPercent.toFixed(2),
    point: b.gradePoint.toFixed(2),
    isFail: b.isFail,
  }))

const toBands = (rows: Row[]): GradeBand[] =>
  rows.map((r, i) => ({
    letter: r.letter.trim(),
    minPercent: Number(r.min),
    maxPercent: Number(r.max),
    gradePoint: Number(r.point),
    isFail: r.isFail,
    sortOrder: i + 1,
  }))

/** Empty state: the one-tap Bangladesh default (F-AC-06 §6). */
export function SeedDefaultScale({ t }: { t: Messages["settings"] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const g = t.grading
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">{g.emptyTitle}</h3>
      <p className="text-muted-foreground text-sm">{g.emptyBody}</p>
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      <Button
        type="button"
        className="min-h-11"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await seedBdGradeScale()
            if (result.ok) router.refresh()
            else setError(result.error.message || t.saveError)
          })
        }
      >
        {pending ? g.seeding : g.seed}
      </Button>
    </div>
  )
}

/**
 * Band rows with a live "72 % → A" preview through the same `bandFor` the
 * results use (F-AC-06 §5.2), and the same coverage rule the database
 * enforces (`checkCoverage`), so an invalid set is flagged before Save.
 */
export function GradeScaleEditor({
  scale,
  t,
}: {
  scale: GradeScaleDto
  t: Messages["settings"]
}) {
  const router = useRouter()
  const id = useId()
  const g = t.grading
  const [name, setName] = useState(scale.name)
  const [rows, setRows] = useState<Row[]>(() => toRows(scale.bands))
  const [nextKey, setNextKey] = useState(scale.bands.length)
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState("72")
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, startTransition] = useTransition()

  const bands = toBands(rows)
  const complete = rows.every(
    (r) => r.letter.trim() && r.min !== "" && r.max !== "" && r.point !== ""
  )
  const issue = complete ? checkCoverage(bands) : null
  const decreaseAt = complete ? pointsDecreaseAt(bands) : null
  const pct = Number(preview)
  const band = preview.trim() === "" ? null : bandFor(bands, pct)

  function update(key: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...patch } : r))
    )
    setDirty(true)
  }

  function discard() {
    setName(scale.name)
    setRows(toRows(scale.bands))
    setDirty(false)
    setNotice(null)
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveGradeScale({ scaleId: scale.id, name, bands })
      if (result.ok) {
        setDirty(false)
        setNotice({ tone: "success", text: t.saved })
        router.refresh()
      } else {
        setNotice({ tone: "error", text: result.error.message || t.saveError })
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SaveNotice notice={notice} reloadLabel={t.reload} />

      <div className="space-y-1">
        <Label htmlFor={`${id}-name`}>{g.name}</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setDirty(true)
          }}
          className="min-h-11"
        />
      </div>

      <div className="bg-muted/40 space-y-1 rounded-lg border p-4">
        <Label htmlFor={`${id}-preview`}>{g.previewLabel}</Label>
        <div className="flex items-center gap-3">
          <Input
            id={`${id}-preview`}
            inputMode="decimal"
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            className="min-h-11 w-24"
          />
          <p className="text-lg font-medium" aria-live="polite">
            {preview.trim() === ""
              ? null
              : band
                ? fill(g.previewResult, {
                    pct: preview,
                    letter: band.letter,
                    point: band.gradePoint.toFixed(2),
                  })
                : fill(g.previewNone, { pct: preview })}
          </p>
        </div>
      </div>

      {issue ? (
        <InlineAlert tone="error">
          {fill(issue.code === "BAND_GAP" ? g.gap : g.overlap, {
            at: (issue.at / 100).toFixed(2),
          })}
        </InlineAlert>
      ) : decreaseAt !== null ? (
        <InlineAlert tone="error">
          {fill(g.pointsDecrease, { at: decreaseAt.toFixed(2) })}
        </InlineAlert>
      ) : null}

      <ul className="space-y-2">
        {rows.map((row, index) => {
          const n = String(index + 1)
          const field = (label: string) => `${label} (${n})`
          return (
            <li
              key={row.key}
              className="grid grid-cols-4 items-end gap-2 rounded-lg border p-3 sm:grid-cols-[4rem_1fr_1fr_1fr_auto_auto]"
            >
              <Input
                aria-label={field(g.letter)}
                value={row.letter}
                onChange={(e) => update(row.key, { letter: e.target.value })}
                className="min-h-11"
              />
              {(["min", "max", "point"] as const).map((key) => (
                <Input
                  key={key}
                  aria-label={field(g[key])}
                  inputMode="decimal"
                  value={row[key]}
                  onChange={(e) => update(row.key, { [key]: e.target.value })}
                  className="min-h-11"
                />
              ))}
              <label className="col-span-3 flex min-h-11 items-center gap-2 text-sm sm:col-span-1">
                <Checkbox
                  aria-label={field(g.fail)}
                  checked={row.isFail}
                  onCheckedChange={(checked) =>
                    update(row.key, { isFail: checked === true })
                  }
                />
                {g.fail}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 justify-self-end"
                aria-label={fill(g.removeBand, { n })}
                onClick={() => {
                  setRows((current) => current.filter((r) => r.key !== row.key))
                  setDirty(true)
                }}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </li>
          )
        })}
      </ul>

      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => {
          setRows((current) => [
            ...current,
            {
              key: nextKey,
              letter: "",
              min: "",
              max: "",
              point: "",
              isFail: false,
            },
          ])
          setNextKey((k) => k + 1)
          setDirty(true)
        }}
      >
        <PlusIcon aria-hidden /> {g.addBand}
      </Button>

      <StickySaveBar
        dirty={dirty}
        pending={pending}
        onDiscard={discard}
        t={{
          unsaved: t.unsaved,
          save: t.save,
          saving: t.saving,
          discard: t.discard,
        }}
      />
    </form>
  )
}
