# Acadigma Campus — Price Proposal

**DRAFT — awaiting owner approval.** 2026-09-28 · For Mahadi's sign-off before any price is quoted to a school. Numbers are the canonical grid from `research/MARKET-STRATEGY.md` §c (D-41: the _only_ price list — do not quote any other number). Feature status is read from `docs/plan/BUILD-LOG.md` and `docs/plan/ROADMAP.md` as of today, not from the feature specs' aspirational scope.

---

## 1. The plans

|                                                  | **Starter**                 | **Pro**                                   | **Enterprise**         |
| ------------------------------------------------ | --------------------------- | ----------------------------------------- | ---------------------- |
| Base price                                       | **৳2,200/month**            | **৳4,900/month**                          | **from ৳18,000/month** |
| Students included                                | 150                         | 300                                       | custom                 |
| Above included                                   | +৳9/student/month           | +৳11/student/month                        | negotiated             |
| Teachers & parents                               | unlimited (no seat caps)    | unlimited                                 | unlimited              |
| AI actions/month                                 | 200, pooled, hard cap       | 600, pooled, hard cap                     | contractual cap        |
| SMS                                              | metered only, ৳0.75/segment | 300 segments included, then ৳0.75/segment | metered                |
| Storage                                          | 10 GB                       | 50 GB                                     | custom                 |
| Fee collection module                            | included                    | included                                  | included               |
| Hiring / cover-teacher / analytics / marketplace | —                           | included                                  | included               |

**Yearly billing = 11× monthly (one month free).** No self-serve Free plan (see §3). A **30-day full-Pro trial, no card, 100 AI actions total** is available self-serve for any school that signs up online.

## 2. What's actually live vs. coming

Be honest with a prospect about what they get **today** (2026-09-28) versus what ships before Release 1 (~April 2027 per `ROADMAP.md`).

**LIVE now, in production:** account/workspace setup and roles, academic-year/class/section/subject setup, school calendar, staff directory, student admission with bulk Excel/CSV import, daily attendance, exam creation, marks entry with lock/submit, automatic result computation and ranking, publish-to-parent gating, Bengali+English PDF report cards (single and bulk print), basic/large-text mode, full audit trail, and the plans/limits/trial billing engine.

**Not live yet — in the build queue:** student fee collection and receipts (F-CM-08), any online payment rail (bKash/SSLCommerz/aamarPay), SMS sending, a working parent login (`guardian_users` exists but nothing invites a guardian into it end-to-end yet), all AI teaching tools and the credit ledger, the cover-teacher engine, hiring, messaging/announcements, timetable, and the marketplace.

**Consequence for sales:** a school signing today gets attendance, marks, report cards and student/staff records — the daily-use core — not the fees or AI features the plan grid prices in. **Quote the full grid as the standing price** (it is what the school will grow into over the contract term), but set go-live and pilot expectations around the academic core only until fee collection ships. Do not promise a ship date to a school; say "coming this year" and no more.

## 3. Free plan and pilot

The self-serve **Free school plan is killed** (`OWNER-QUESTIONS.md` OQ-22 — default assumed, **pending your final sign-off**). It burned an estimated ৳870/school/month against a ~5% free-to-paid rate. A free **personal teacher workspace** (zero AI) remains as the product's network seed.

For a founder-sold school, the paid pilot replaces the old free trial: **8–10 weeks at ৳2,000/month**, spanning one full terminal exam, written success criteria agreed before day 1, auto-converting to the school's chosen plan at the January enrollment boundary unless the school opts out.

## 4. Founding-school offer — OWNER TO CONFIRM

**Recommendation (one option, for your approval):**

- **Who:** the first 10 signed schools.
- **Price:** the paid pilot (§3) at ৳2,000/month, then the standard list price (Starter ৳2,200 or Pro ৳4,900) on conversion — **no percentage discount off list**, because the corrected gross margin (67.8% at Pro/300, per `research/MARKET-STRATEGY.md` §c) does not survive a further recurring discount on top of AI and infra cost (`research/debate/04-cfo.md` §1.2, §1.10 both reject discounting the recurring line).
- **Price lock:** 24 months from the conversion date, written into the contract, with a 5% annual escalator after that — the same term every annual contract gets, not an extra founding perk.
- **Onboarding fee:** the full ৳10,000, never waived — the pilot already _is_ the founding discount; waiving onboarding on top of it prices delivery below cost.
- **Recognition:** named as a founding school on the public site and in case studies, with the school's written permission.
- **Refundable deposit: ৳5,000 at LOI signing — OWNER TO CONFIRM the amount.** No deposit figure exists in any research document; this is a new proposal. It is collected at signing, credited in full against the first pilot invoice, and refunded in full if Acadigma fails to deliver the agreed pilot setup within 2 weeks of the signed go-live date. Its purpose is a mutual no-show deterrent, not revenue — kept small relative to the ৳10,000 onboarding fee so it is not read as a second onboarding charge.

**Also OWNER TO CONFIRM:** whether "founding school" status should carry any further perk (e.g. a permanent feature, priority support) beyond price-lock and public naming — the research is silent on this beyond GTM's "named on the site."

## 5. Payment terms

- **School remains merchant of record for student fees; Acadigma takes 0%** on that flow.
- **bKash merchant (1.85%) is the default rail** for Acadigma's own subscription invoices — fastest to set up, no large upfront fee.
- **aamarPay's education tier (৳4,999 setup, 1.8–2.1%)** is the card-payment alternative.
- **SSLCommerz (৳25,500 setup, 2.5%) is deferred** — not needed before online fee collection ships (M4).
- Acadigma is **not yet VAT-registered (BIN)**; invoices print a placeholder VAT line until OQ-1 is answered.
- Subscriptions renew by **invoice-and-pay with a 7-day grace period** (no stored card tokens).

## 6. Rationale, three lines per price

**Starter ৳2,200 (150 students).** At ৳14.7/student it sits inside the published BD market band (Sheba Shikkha/Bidyaan ৳10–20/student) and matches the ceiling a Bangla-medium owner-critic named as acceptable (`debate/01-school-owner.md`). No teacher seat cap removes the incentive to ration logins that a per-seat price creates. It is the entry point for the Tier-A beachhead (English-medium/English-version KG–8) identified in `MARKET-STRATEGY.md` §a.

**Pro ৳4,900 (300 students).** At the corrected AI cost of ৳1.45/action (`debate/04-cfo.md` §1.3, adopted in `MARKET-STRATEGY.md` §c), this plan carries a **67.8% gross margin** — the number the CFO review replaced the research's original, unsustainable 72–77% figure with. A 450-student school lands on Starter-plus-overage at exactly this same ৳4,900 ceiling, resolving the conflict between the owner-critic's ৳4,500–5,000 ceiling and the CFO's demand for a higher floor than the original ৳3,500/1,000-action recommendation.

**Enterprise from ৳18,000.** Custom by student count and contract; exists so a 1,500+ student institution is quoted individually rather than forced onto Pro's overage formula, which the research flags as "far below market" for that band (`research/PRICING-AND-SALES.md` §2 anchor table).
