import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Platform console",
}

/** The queues the console will own, in the order they were agreed (D-16). */
const QUEUES = [
  {
    name: "Listing review",
    detail: "Marketplace listings publish only after a reviewer approves them.",
  },
  { name: "KYC", detail: "Seller identity checks before the first payout." },
  {
    name: "Payouts",
    detail: "Monthly run, ৳1,000 minimum, 7-day hold on earnings (D-17).",
  },
  { name: "Refunds", detail: "Reverses an order and the earning behind it." },
  { name: "Plan changes", detail: "Moves a workspace between plans (D-18)." },
  { name: "Audit viewer", detail: "Read-only window onto audit_events." },
] as const

export default function PlatformHomePage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">Queues</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QUEUES.map((queue) => (
          <Card key={queue.name}>
            <CardHeader>
              <CardTitle className="text-base">{queue.name}</CardTitle>
              <CardDescription>{queue.detail}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  )
}
