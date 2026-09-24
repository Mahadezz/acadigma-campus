"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import type { AuditCategory, AuditSeverity } from "@acadigma/contracts/audit"
import { Button } from "@acadigma/ui/components/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@acadigma/ui/components/form"
import { Input } from "@acadigma/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acadigma/ui/components/select"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"

import {
  AUDIT_CATEGORY_LABELS,
  auditFilterFormSchema,
  DATE_PRESETS,
} from "./schema"

import type { AuditFilterFormValues, DatePreset } from "./schema"

const DATE_PRESET_LABELS: Record<DatePreset, { en: string; bn: string }> = {
  today: { en: "Today", bn: "আজ" },
  "7d": { en: "Last 7 days", bn: "গত ৭ দিন" },
  "30d": { en: "Last 30 days", bn: "গত ৩০ দিন" },
  all: { en: "All time", bn: "সব সময়" },
}

const SEVERITY_LABELS: Record<AuditSeverity, { en: string; bn: string }> = {
  info: { en: "Info", bn: "তথ্য" },
  notable: { en: "Notable", bn: "লক্ষণীয়" },
  critical: { en: "Critical", bn: "গুরুত্বপূর্ণ" },
}

/**
 * The filter sheet (F-ID-09 §4.2): a date-range preset, an action category, a
 * severity and a free-text search — all applied server-side. `FormSheet` gives the
 * bottom-sheet-on-phone / dialog-on-desktop split for free.
 */
export function AuditFilterSheet({
  open,
  onOpenChange,
  value,
  onApply,
  language,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: AuditFilterFormValues
  onApply: (value: AuditFilterFormValues) => void
  language: "en" | "bn"
}) {
  const form = useForm<AuditFilterFormValues>({
    resolver: zodResolver(auditFilterFormSchema),
    values: value,
  })

  function onSubmit(values: AuditFilterFormValues) {
    onApply(values)
    onOpenChange(false)
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={language === "bn" ? "ফিল্টার" : "Filter"}
      description={
        language === "bn"
          ? "সমস্ত ফিল্টার সার্ভার-সাইডে প্রয়োগ করা হয়"
          : "Every filter is applied server-side"
      }
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const cleared: AuditFilterFormValues = { datePreset: "all" }
              form.reset(cleared)
              onApply(cleared)
              onOpenChange(false)
            }}
          >
            {language === "bn" ? "ফিল্টার সাফ করুন" : "Clear filters"}
          </Button>
          <Button type="submit" form="audit-filter-form">
            {language === "bn" ? "প্রয়োগ করুন" : "Apply"}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id="audit-filter-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="datePreset"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {language === "bn" ? "তারিখ পরিসীমা" : "Date range"}
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DATE_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {DATE_PRESET_LABELS[preset][language]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {language === "bn" ? "বিভাগ" : "Category"}
                </FormLabel>
                <Select
                  value={field.value ?? "__any__"}
                  onValueChange={(next) =>
                    field.onChange(
                      next === "__any__" ? undefined : (next as AuditCategory)
                    )
                  }
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={language === "bn" ? "যেকোনো" : "Any"}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__any__">
                      {language === "bn" ? "যেকোনো" : "Any"}
                    </SelectItem>
                    {Object.entries(AUDIT_CATEGORY_LABELS).map(
                      ([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="severity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {language === "bn" ? "গুরুত্ব" : "Severity"}
                </FormLabel>
                <Select
                  value={field.value ?? "__any__"}
                  onValueChange={(next) =>
                    field.onChange(
                      next === "__any__" ? undefined : (next as AuditSeverity)
                    )
                  }
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={language === "bn" ? "যেকোনো" : "Any"}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__any__">
                      {language === "bn" ? "যেকোনো" : "Any"}
                    </SelectItem>
                    {(["info", "notable", "critical"] as const).map(
                      (severity) => (
                        <SelectItem key={severity} value={severity}>
                          {SEVERITY_LABELS[severity][language]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="q"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {language === "bn" ? "অনুসন্ধান" : "Search"}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={
                      language === "bn"
                        ? "একটি কার্যক্রম খুঁজুন"
                        : "Search an action"
                    }
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormSheet>
  )
}
