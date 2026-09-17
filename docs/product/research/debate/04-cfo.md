# Adversarial review 04 — CFO / seed investor

**Reviewer persona.** Fractional CFO and seed investor, Dhaka SaaS. I have watched BD edtech burn money: Shikho's paid-conversion problem, 10 Minute School's B2B attempts, and a graveyard of small ERP shops that discovered their "customers" were project clients who never renewed. I care about four things: **cash timing, price realisation, collection risk, and founder hours.** Everything else is narrative.

**Date:** 2026-09-17 · **Reviewing:** `PRICING-AND-SALES.md`, `COMPETITORS.md`, `GO-TO-MARKET.md`, `VOICE-OF-CUSTOMER.md`, `TEACHER-SIDE.md`, `PRD.md`, `PRODUCT-DECISIONS.md` §4–5, `ROADMAP.md`, `COMPLIANCE-PDPA.md` §5, `features/04-commerce/README.md`.

**Rate cards re-verified today** (not taken from the research): [supabase.com/pricing](https://supabase.com/pricing), [vercel.com/pricing](https://vercel.com/pricing), [platform.claude.com/docs/en/docs/about-claude/pricing](https://platform.claude.com/docs/en/docs/about-claude/pricing), [sslcommerz.com/pricing](https://sslcommerz.com/pricing/), BD masking-SMS market rates (mimsms, bulksmsdhaka, bulksmsbd, Zaman IT).

**The one-line verdict.** The research is the best-sourced competitor and market document I have seen from a solo founder in this market, and its unit economics are wrong in the same direction on every single line. Corrected, the recommended Pro plan carries a **43% gross margin, not 77%**, LTV/CAC is **1.9×–6.8×, not 21×**, and the plan's month-12 targets are **arithmetically impossible for one person**. The business is fundable. The model in front of me is not the business.

---

## 1. Numbers I reject

Nineteen. Each quoted, each recomputed.

### 1.1 Blended ARPA ৳3,800

> "Blended ARPA (recommended pricing, §10) | **৳3,800/month** | mix of Starter/Pro at typical band sizes" — PRICING §9.1

This is not a blend. Under the §11 grid, Pro at 340 students = ৳3,820. **৳3,800 is one Pro school at the modal size, with no Starter and no Free in the mix at all.**

Recompute with a mix that matches the stated beachhead (PRICING §5: "Non-MPO English-medium schools and private kindergartens"; GTM §1.2: ~2,000 English-medium KGs vs **140** registered English-medium secondaries):

| Segment                            | Share |    ARPA | Contribution |
| ---------------------------------- | ----: | ------: | -----------: |
| Free (≤60 students)                |   40% |      ৳0 |           ৳0 |
| Starter (~150–200 students)        |   35% |  ৳1,700 |         ৳595 |
| Pro (~300–500)                     |   24% |  ৳4,300 |       ৳1,032 |
| Enterprise                         |    1% | ৳12,000 |         ৳120 |
| **Blended (all accounts)**         |       |         |   **৳1,747** |
| **Blended (paying accounts only)** |       |         |   **৳2,915** |

**৳2,900 is the honest paid ARPA. ৳3,800 is the ceiling, presented as the average.** Every downstream number — gross profit, payback, LTV — inherits a 24% overstatement before any other error.

### 1.2 Gross margin 72–77%

> "**Gross margin** | **72%** | **76%** | **72%** | **77%**" — PRICING §9.4

The table survives only because it pairs the ceiling ARPA with a **300 AI actions/month** assumption that contradicts the plan matrix in the same document set. Recompute at the document's own recommended Pro plan (§11: ৳3,500 base, **1,000 AI actions/month pool**) with corrected per-action cost (§1.3 below):

| Line                    | PRICING §9.4 |    Corrected |
| ----------------------- | -----------: | -----------: |
| Revenue (Pro base, §11) |       ৳3,800 |       ৳3,500 |
| Infra @100 schools      |       (৳350) |       (৳350) |
| AI                      |       (৳360) | **(৳1,450)** |
| Gateway 2.5%            |        (৳95) |        (৳88) |
| Support                 |       (৳120) |       (৳120) |
| **Gross profit**        |   **৳2,875** |   **৳1,492** |
| **Gross margin**        |      **76%** |    **42.6%** |

**42.6%.** That is not a SaaS margin; that is a reseller margin. The research's own conclusion — "a healthy but not-quite-classic-SaaS 72–77%… do not try to engineer them away by shipping worse support" — is built on a number that is half what it says.

### 1.3 AI cost per action: ৳1.20 blended, and the line items

> "Lesson plan | 3k / 2k | Sonnet 5 | $0.026 | **$0.014** | **৳1.7**" and "Blended AI cost ≈ **৳1.20 per action**" — PRICING §9.2

The raw costs are right. **The "with caching + batch" column is arithmetically impossible.** Verified today: Sonnet 5 = $2/$10 per MTok, Haiku 4.5 = $1/$5, cache reads = 0.1× base **input** price. Output tokens cannot be cached and cannot be batched in an interactive flow.

| Action                       | Model     | Output cost (irreducible) | Input cost, fully cached |      **True floor** | Doc claims |     Error |
| ---------------------------- | --------- | ------------------------: | -----------------------: | ------------------: | ---------: | --------: |
| Lesson plan 3k/2k            | Sonnet 5  |                   $0.0200 |                  $0.0006 | **$0.0206 = ৳2.47** |       ৳1.7 |  **−45%** |
| Worksheet/quiz 2k/2k         | Haiku 4.5 |                   $0.0100 |                  $0.0002 | **$0.0102 = ৳1.22** |      ৳0.85 |  **−43%** |
| Parent message 1k/0.4k       | Haiku 4.5 |                   $0.0020 |                  $0.0001 |     $0.0021 = ৳0.25 |      ৳0.25 | ✅ accept |
| Report comments 6k/4k, Batch | Haiku 4.5 |                   $0.0100 |                  $0.0030 |     $0.0130 = ৳1.56 |       ৳1.6 | ✅ accept |
| Syllabus extract 30k/8k      | Sonnet 5  |                   $0.0800 |                  $0.0600 | **$0.1400 = ৳16.8** |       ৳9.6 |  **−43%** |

The syllabus number is worse than −43%. It is an **interactive** flow (F-TE-02 P5–7: "import → extraction → review → commit" with a teacher waiting), so the 50% Batch discount does not apply, and 30k input tokens is a 10-page document. A real BD board syllabus PDF is 30–60 pages; at ~3,500 tokens/page with document input that is 105k–210k input tokens = **৳27–৳43 per subject-year**. A school onboarding 10 subjects × 6 grades = **৳1,620–2,580 in one sitting**, roughly half a month's ARPA, on an action the teacher perceives as free.

Blended recompute, same 300 actions/month, realistic mix (30% plans / 35% worksheets / 20% messages / 15% report comments):

`(90 × 2.47) + (105 × 1.22) + (60 × 0.25) + (45 × 1.56) = ৳435/month = **৳1.45/action**`

Add a 1.3× regeneration factor on interactive actions (teachers regenerate; the ledger settles each attempt) → **৳1.85/action, ৳555/school/month.** I will use the ৳1.45 floor in all margin maths below to be fair to the plan.

### 1.4 "AI ≈ 9.5% of ARPA"

> "**Blended AI cost ≈ ৳1.20 per action × 300 actions = ৳360 per school per month** — **9.5% of ARPA**" — PRICING §9.2

At ৳1.45/action: ৳435, which is 11.4% of the claimed ৳3,800 and **15.0% of the honest ৳2,900**. At the §11 Pro allowance of 1,000 actions it is **41.4% of the ৳3,500 base**. The sentence "This is the single most important cost control in the product" is correct; the number attached to it is not.

### 1.5 The Free plan's AI allowance — a 30× contradiction that has never been reconciled

> PRICING §11: "**Free** | ৳0 | up to 60 [students] | 1 admin + 3 teachers, **20 AI actions/month**"
> PRODUCT-DECISIONS §5.1: "**Free ৳0** — 5 teachers, 150 students, 1 GB, **20 AI credits/day**"
> GTM §8 restates the PRODUCT-DECISIONS version verbatim as the current matrix.

**20/month and 20/day differ by 30×** and both are live in the documentation the build will read. Costed:

| Plan (PRODUCT-DECISIONS §5.1) | Credits/day | Actions/month | AI cost @৳1.45 |    Price | **Gross profit before infra** |
| ----------------------------- | ----------: | ------------: | -------------: | -------: | ----------------------------: |
| Free                          |          20 |           600 |           ৳870 |       ৳0 |                    **(৳870)** |
| Starter                       |         100 |         3,000 |         ৳4,350 |   ৳2,999 |                  **(৳1,351)** |
| Pro                           |         400 |        12,000 |        ৳17,400 |   ৳7,999 |                  **(৳9,401)** |
| Enterprise                    |       1,500 |        45,000 |        ৳65,250 | ~৳12,000 |                 **(৳53,250)** |

**Every plan in the currently-documented matrix has negative gross margin on AI alone.** Not thin. Negative. And `PRODUCT-DECISIONS.md §5.1` is the document the plans schema will be built from at **ROADMAP M0 step 0.5**, which §8 says starts imminently.

100 Free schools at 20 credits/day = **৳87,000/month of pure cash burn with zero revenue**, against a BD edtech free-to-paid conversion benchmark the research itself cites: "**~5% of users convert to paid**" (PRICING §5).

### 1.6 Fully-loaded founder CAC ৳10,500 and 3.8-month payback

> "**Founder-led school visits** | ~৳2,000 | **~৳10,500** (3 founder-days at ৳3,000/day opportunity cost) | ~1 in 12 visits"
> "At ৳2,750 gross profit/month, a **৳10,500 fully-loaded founder CAC pays back in 3.8 months**." — PRICING §9.5

Three errors compound.

**(a) CAC must include the cost of losing.** "1 in 12 visits" and "3 founder-days" are inconsistent: 3 days does not buy 12 school visits in Dhaka. A school visit is a half-day door-to-door; 12 visits ≈ 6 days, plus demos, plus follow-up calls, plus the quotation. Honest: **8–10 founder-days per closed school.**

**(b) Onboarding is missing entirely.** PRICING §12 mandates "Do the data migration yourself, on site, in one day" plus "Two sessions, in Bengali" — that is **2 founder-days**, charged at ৳5,000, and **waived on annual prepay** (§11).

**(c) ৳3,000/founder-day is not a market rate.** ৳3,000 × 22 = ৳66,000/month. A founder capable of shipping 275 parts bills ৳150,000–250,000/month on Dhaka contract work. Use **৳8,000/day.**

|                                    |         Doc |                                           Corrected |
| ---------------------------------- | ----------: | --------------------------------------------------: |
| Selling days                       |           3 |                                                   9 |
| Onboarding days                    |           0 |                                                   2 |
| Founder-day rate                   |      ৳3,000 |                                              ৳8,000 |
| Cash (travel, print, data)         |      ৳2,000 |                                              ৳3,000 |
| Onboarding fee recovered           |          ৳0 |                   (৳5,000), **৳0 on annual prepay** |
| **Fully-loaded CAC**               | **৳10,500** | **৳86,000 → ৳83,000 net; ৳88,000 on annual prepay** |
| Conservative (৳3,000/day retained) |     ৳10,500 |                                         **৳36,000** |

Payback at the corrected ৳1,492 gross profit: **24.1 months** at ৳36,000 CAC. Even at the doc's own ৳10,500 CAC and ৳2,875 GP it is 3.65 months only because both inputs are wrong; with the corrected GP it is **7.0 months**. It is not 3.8 under any assumption set I can construct.

**The conclusion that follows is the one the research never reaches: at ৳1,500–3,500 ARPA, founder-led selling does not pay back inside a year. The price is too low for the sales motion chosen.**

### 1.7 LTV ৳220,000 and LTV/CAC 21×

> "At **15% annual logo churn** _(est.)_ → 6.7-year life → **LTV ≈ ৳220,000**, LTV/CAC ≈ **21×**… Both are far above the 3× threshold; **the model is not the risk**, execution capacity is." — PRICING §9.5

This is the most dangerous sentence in the research and it is off by an order of magnitude.

- LTV is computed on **revenue-flavoured gross profit at the ceiling ARPA**, undiscounted, over 6.7 years, for a product that does not exist yet.
- 15% annual logo churn is a _mature-ERP_ number. The research lists its own churn drivers in §6 — stalled migration, untrained office staff, SMS billing disputes, principal change — every one of which is a **year-one** failure.
- The research also states the BD failure mode precisely: "the failure mode is not churn-by-cancellation, it is **a school that simply stops paying and keeps using the software**" (§4). That is _revenue_ churn, which is always higher than logo churn, and it is invisible in a logo-churn model.
- No discount rate. A BD SME's cost of capital is not zero; bank lending runs 12–15% and equity risk far above that. Use **25%**.

Recompute at 35% year-1 / 20% thereafter (≈4-year average life), ৳1,492 GP:

|                         | Undiscounted | NPV @25% (4-yr annuity factor 2.69) |
| ----------------------- | -----------: | ----------------------------------: |
| LTV                     |      ৳71,616 |                         **৳48,170** |
| LTV/CAC @ ৳36,000       |        1.99× |                           **1.34×** |
| LTV/CAC @ doc's ৳10,500 |         6.8× |                                4.6× |

**Honest range: 1.3×–6.8×. The low end is below the 3× threshold.** "The model is not the risk" is false. The model _is_ the risk.

### 1.8 SMS at ৳0.35 with cost ৳0.25–0.45, treated as ৳0 gross profit

> "**SMS** | **৳0.35/SMS**, 500 included/month on Pro | Costs ৳0.25–0.45" — PRICING §11
> "SMS | passed through at cost + small margin; **treated as ৳0 gross profit**" — PRICING §9.1

Two independent failures.

**(a) The cost range is stale.** 2026 BD masking rates I checked today: mimsms ৳0.36–0.45; bulksmsdhaka ৳0.52; Swift ৳0.70; ৳0.25 exists only as a headline non-masking/promotional rate. **Selling at ৳0.35 is below cost at every verified 2026 masking quote.**

**(b) The bigger failure is segments, and this project already knows it.** `features/04-commerce/README.md` §5 states: _"Bengali SMS is **UCS-2: 70 characters per segment**, not 160."_ A real Bengali fee reminder —

> প্রিয় অভিভাবক, [নাম]-এর সেপ্টেম্বর মাসের বেতন ৳৩,৫০০ বকেয়া। ১০ তারিখের মধ্যে পরিশোধ করুন। — [স্কুল]

— is ~110 Bengali characters = **2 segments**. Wholesale cost ৳0.72–1.40. Revenue at ৳0.35. **Loss of ৳0.37–1.05 per reminder sent.** At 2,000 reminders/school/month that is **(৳740)–(৳2,100) per school per month** — the fee-reminder feature, sold as a differentiator, is a direct cash loss that grows with adoption. The commerce spec counts segments correctly; the pricing does not.

### 1.9 The ৳25,500 SSLCommerz setup as "a real pre-revenue cost"

> "The **৳25,500 SSLCommerz setup is a real pre-revenue cost** and must be in the R3 budget." — PRICING §4
> "the ৳25,500 is a hard cash cost **before the first taka of Acadigma revenue**" — commerce README §5

Wrong on timing, and it obscures a bigger number.

**On timing:** ROADMAP puts the payments core at **M4** (R1.5) and R1 launches at M3. So schools 1–20 are invoiced during M3–M4 with **no gateway at all**. You collect those by bank transfer, bKash, and cheque — which means the ৳25,500 is not pre-revenue, it is **month-10-to-14 cash**, and paying it in month 1 is dead capital for a founder whose own budget scenario (GTM §12.1) is "৳0 cash."

**On the bigger number:** SSLCommerz requires a **Bangladesh-incorporated entity settling to a local bank account** (PRICING §4). The real cost of "being able to take money" is:

| Item                                                |                                        ৳ | Lead time       |
| --------------------------------------------------- | ---------------------------------------: | --------------- |
| RJSC company registration                           |                            15,000–30,000 | 2–4 weeks       |
| Trade licence (city corporation)                    |                             5,000–15,000 | 1–2 weeks       |
| TIN                                                 |                                       ~0 | days            |
| VAT registration (BIN) — needed to issue Mushak 6.3 |                          ~0 + accountant | 1–2 weeks       |
| Monthly VAT return filing (accountant)              |                           5,000–8,000/mo | ongoing         |
| SSLCommerz setup                                    |                                   25,500 | after the above |
| **Total to first gateway taka**                     | **~৳60,000–80,000 one-time + ৳6,000/mo** | **6–10 weeks**  |

**None of this appears in any budget in any document.** GTM §12.2's ৳50,000/month has no line for incorporation, accounting or VAT filing.

**And the item nobody costed at all:** commerce README §5 notes the ৳25,500 "is also a cost the **school** must bear for F-CM-08." F-CM-08 is the designated **🔴 ship-blocker for the mid-market**. So the must-have feature asks a 300-student KG to spend **৳25,500 upfront + 2.5% forever** to replace a cash box that currently costs ৳0. For a school collecting ৳150,000/month in fees that is ৳3,750/month in gateway fees. **Most will decline.** The adoption rate of the ship-blocker feature is an untested assumption presented as a certainty.

### 1.10 Onboarding fee ৳5,000, "waived on annual prepay"

> "**Onboarding fee** | **৳5,000 one-time**, waived on annual prepay | funds data migration + two training sessions" — PRICING §11

Cost to deliver, per §12's own prescription (one on-site migration day + two training sessions + travel): **2 founder-days = ৳6,000 at ৳3,000/day, ৳16,000 at ৳8,000/day.** It is priced below cost, and then waived on exactly the deal shape you most want to sell. GTM §8.2 goes further: _"annual prepay before 31 January includes free setup, data import and two on-site training sessions."_

It also trains the school to expect free labour forever — and PRICING §6 names "office staff never trained and quietly reverting to Excel" and "a change of principal" as top churn drivers, both of which generate **repeat** retraining demand.

### 1.11 Annual prepay = 2 months free (16.7%), stacked

> "**Annual prepay** | **2 months free (16.7% off)**" — PRICING §11; "Yearly = 10 × monthly" — PRODUCT-DECISIONS §5.1

Stack it with the waived ৳5,000 onboarding fee:

`List year 1 = (৳3,500 × 12) + ৳5,000 = ৳47,000. Annual price = ৳35,000. **Effective discount 25.5%.**`

On a 42.6% gross margin that takes monthly contribution from ৳1,492 to **৳1,190**, pushing payback past 30 months at corrected CAC. The market already _prefers_ annual (PRICING §3: "Annual-only billing… Vendors want cash up front because collection is the hard part"). **You are paying 25% for something the buyer already wants.** 8.3% (one month free) buys the same behaviour.

And nobody has said the thing that matters: **annual prepay is deferred revenue.** ৳35,000 received in January covers service through December. A ৳0-budget founder will spend it in Q1 and be funding eleven months of hosting, AI and support out of next year's cash. That is the most important mechanic in this entire business and it appears in no model.

### 1.12 Reseller: "100% of months 1–3 + 10% recurring… gross margin drops only ~8 points"

> "Structure the deal as 100% of months 1–3 + 10% recurring… At ৳3,800 ARPA that is a **৳11,400 one-time payment**… while your gross margin drops only ~8 points instead of ~25." — PRICING §11, §12

| Horizon     |  Revenue |                       Agent take | **% of revenue** |
| ----------- | -------: | -------------------------------: | ---------------: |
| Year 1      |  ৳45,600 |  ৳11,400 + 10%×৳34,200 = ৳14,820 |        **32.5%** |
| 4-year life | ৳182,400 | ৳11,400 + 10%×৳171,000 = ৳28,500 |        **15.6%** |

**15.6 points over the life, 32.5 points in year one — not 8.** And at the honest ৳2,900 ARPA the headline one-time falls to ৳8,700, which materially weakens the "meaningful sum in a district town" argument the whole structure rests on.

Worse: **no clawback.** Pay ৳11,400 in month 1 to an agent for a school that churns in month 5, and you have paid ৳11,400 for ৳14,500 of revenue with ৳8,300 of COGS and a ৳5,000 onboarding cost. **Net negative on a closed sale.**

### 1.13 Marketplace: ৳22,500/month at 1,000 schools, 30% take

> "1,000 schools | ~15,000 [teacher buyers] | ~4,500 [items/yr] | ৳200 | ৳900,000 | **৳270,000/yr (৳22,500/mo)**" — PRICING §7

The arithmetic checks. **It is gross, not net.** Costs the table omits:

| Line                                                                   |                        ৳/yr | Basis                     |
| ---------------------------------------------------------------------- | --------------------------: | ------------------------- |
| Gateway 2.5% on ৳900k GMV                                              |                    (22,500) | SSLCommerz                |
| Seller payout cost 1.5% of ৳630k                                       |                     (9,450) | PRICING §4's own estimate |
| KYC review (2-business-day SLA, ~500 sellers × 15 min)                 |                    (25,000) | PRODUCT-DECISIONS 4.5     |
| Listing moderation (~2,500 reviews/yr × 10 min, edits re-enter review) |                    (83,400) | PRODUCT-DECISIONS 4.4     |
| Malware scan container (OQ-6)                                          |                    (28,800) | ROADMAP M6 6.5            |
| **Net contribution**                                                   | **৳100,850/yr = ৳8,400/mo** |                           |

Against **~45 parts ≈ 90 engineer-days ≈ ৳720,000** of build at ৳8,000/day. **A 7.1-year payback, at a scale (1,000 schools) that the same research says is 3–7× beyond the realistic 3-year SOM of "150–400 schools" (§5).**

Then three things that make it worse:

- **30% has no pricing power here.** TpT can charge 45% because it has 233,358 sellers and brand demand. A BD marketplace competes against **free** — Facebook teacher groups where BD teachers already swap worksheets for nothing (TEACHER-SIDE §7 lists the exact groups, 604K/283K/110K members). 30% of ৳0 is ৳0.
- **TEACHER-SIDE §7 proposes paying sellers ৳3,000–5,000/pack** to seed supply (the Twinkl model). 30 seed sellers × ৳4,000 = **৳120,000 of content inventory purchase** against ৳6,750/yr of take at 100 schools. **18-year payback.** That is a working-capital line in no budget.
- **AIT withholding on seller payouts** is flagged in commerce README §7 item 3 as "still the highest-risk unmodelled item in the area." If Acadigma must deduct and deposit TDS for hundreds of resident sellers, that is challans, certificates and annual returns — a treasury function a solo founder cannot operate. **This alone should defer the marketplace.**

### 1.14 Supabase and Vercel at scale

The **metered lines are right**; I re-derived all four against today's rate card and they are correct to the taka:

| Line @1,000 schools                     |    Doc | My recompute | Verdict |
| --------------------------------------- | -----: | -----------: | ------- |
| MAU overage (430k − 100k) × $0.00325    | $1,072 |    $1,072.50 | ✅      |
| Egress (8,000 − 250) GB × $0.09         |   $697 |      $697.50 | ✅      |
| DB storage (300 − 8) GB × $0.125        |    $37 |       $36.50 | ✅      |
| File storage (3,000 − 100) GB × $0.0213 |    $61 |       $61.77 | ✅      |

The **guessed** lines are wrong in both directions:

| Line                          |                       Doc | Verified rate card                | Comment                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------: | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase compute @100 schools |          "~$100 (Medium)" | **Medium = $60**                  | Overstated 67%                                                                                                                                                                                                                                       |
| Supabase compute @1,000       | "~$600 (Large + replica)" | **Large = $110; +replica = $220** | Overstated as printed — **and under-specced in reality.** A 2-vCPU Large will not serve 300 GB, 430k MAU, 1,000 tenants of Realtime messaging and nightly analytics/risk jobs. Realistic is 4XL–8XL + replica + provisioned IOPS: **$1,000–$1,600.** |
| Vercel @1,000                 |                   "~$600" | Not derived from anything         | Bottom-up: 430k MAU × 40 views × 50 KB ≈ 860 GB (under the 1 TB included); ~52M invocations × $0.60/1M ≈ $31; PDF render 100k cards/mo × 3 s ≈ 83 CPU-hr × $0.128 ≈ $11. **Realistic ~$120–180.**                                                    |

**Net: the 1,000-school total has an error bar of roughly ±60% on derived lines and is unbounded on the two guessed ones.** The research's own §13 admits "could be off ±30%." It is worse — but it does not matter, because **you will not reach 1,000 schools inside this plan's horizon.** Modelling there is a distraction from the number that decides the company: **gross margin and cash at 20–40 schools**, which the document never computes.

At 30 schools: Supabase Pro $25 + Small compute $15 + Vercel Pro $20 + Sentry/Resend/domains $10 = **$70/mo = ৳8,400 = ৳280/school.** Fine. The problem is not infra. At 30 schools × ৳2,900 you have **৳87,000/month of gross revenue** — less than one Dhaka senior developer's salary. **At 30 schools this is not a company, it is a job.** That framing is absent from every document.

### 1.15 The MAU mitigation does not work

> "**MAU $1,072/mo** — … If parents access the portal via a **signed magic link / limited-session mechanism** rather than a full monthly-active auth session… this drops sharply." — PRICING §9.3

**A magic-link login is an auth event and counts as an MAU.** Supabase bills any user who hits the auth API in the billing period. The only real fix is not giving parents a Supabase Auth identity at all — which collides head-on with PRD §5.1 (`roles owner|admin|teacher|staff|**parent**`, membership-derived) and with the entire RLS design, which "resolves tenant context from membership only" (PRD §6). **This is a ৳128,700/year architectural decision that the research classifies as a config tweak.** It needs an ADR before M0 0.3 lands the tenancy tables, not "before R1 launch."

The Cloudflare R2 egress mitigation is sound financially (3 TB ≈ $45/mo storage, zero egress, net saving ~$715/mo) but **conflicts with COMPLIANCE-PDPA §5.5's Mumbai-pinning story**: R2 jurisdiction restrictions do not offer a Bangladesh or India-only option in the way `ap-south-1` does. Price the compliance regression before taking the saving.

### 1.16 Three pricing models are simultaneously live, and the schema ships next week

| Source                      | Model                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `PRD.md` §5.4               | "Plans (Free/Starter/Pro/Enterprise **placeholders**)"                             |
| `PRODUCT-DECISIONS.md` §5.1 | Flat tiers ৳2,999/৳7,999 with **seat caps** (5/20/75 teachers) and **credits/day** |
| `PRICING-AND-SALES.md` §11  | Band + overage, **no seat caps**, **actions/month**                                |
| `GO-TO-MARKET.md` §8.3      | "**Stay per-school with student/teacher caps**" — explicitly rejects §11           |
| `ROADMAP.md` M0 0.5         | "`plan_prices` **bands + overage** (D-28)" — assumes §11                           |

Four documents, three models, one of them (GTM §8.3) actively arguing against the recommendation. **ROADMAP §8 says M0 starts immediately, and M0 step 0.5 builds the plans/limits engine that "every area gates on."** You are about to commit a schema from an unresolved spec. Per-seat caps are also, per PRICING §3, culturally unsellable here: _"Per-seat pricing is culturally unsellable… a school with 40 teachers will not pay per teacher."_ PRODUCT-DECISIONS §5.1 caps teachers at 5/20/75.

### 1.17 "At Starter ৳2,999, a ৳3,000 school CPL pays back in ~1 month"

> "**Payback check:** at Starter ৳2,999, a ৳3,000 school CPL pays back in ~1 month of subscription with healthy margin." — GTM §12.2

Three errors in one sentence: it pays back against **revenue not gross profit**; **CPL is not CAC** (at the 15% demo→close in PRICING §9.5, a ৳3,000 _lead_ is a ৳20,000 _customer_); and Starter as documented (100 credits/day = ৳4,350 of AI) has **negative** gross profit, so the payback is **never**.

### 1.18 GTM month-12: 110 schools, MRR ৳550k

> "**110 paid schools, 6,000 teachers, MRR ~৳550k** … ≥40% of schools on annual" — GTM §11.3

**Implied ARPA ৳5,000** — a Pro school at ~500 students, _every single one_ — against a stated beachhead of kindergartens and the 140 registered English-medium secondaries in the entire country (GTM §1.2). The target and the segment are incompatible.

**And the founder-hours arithmetic is fatal:**

| Line                                                                           | Founder-days |
| ------------------------------------------------------------------------------ | -----------: |
| Onboarding 110 schools × 2 days (migration + 2 training sessions, PRICING §12) |          220 |
| Selling 110 schools at a generous 3 days/close                                 |          330 |
| Building M4–M7 (126+ parts remaining after R1)                                 |         250+ |
| **Total**                                                                      |     **800+** |
| **Available in 12 months**                                                     |      **250** |

**3.2× oversubscribed.** The ৳50,000 scenario's ৳12,000/month part-time assistant does not do data migration or on-site training. **The month-12 target is arithmetically impossible for one person**, and the ceiling is set by _onboarding days_, not leads. That makes self-serve onboarding the single highest-leverage investment in the plan — see change #7.

### 1.19 "৳0 cash" is not ৳0

> "Hosting until launch (Supabase free, Vercel hobby) | 0 … **Total | ~0 cash**" — GTM §12.1

Missing from the ৳0 scenario: **the founder's own Anthropic API spend to build 275 parts with agents.** ROADMAP §4 describes builder + tester agent pairs across four parallel streams. That is $100–400/month of API spend = **৳12,000–48,000/month for 6+ months**. Also missing: incorporation (§1.9), the domain, and a phone bill that isn't "personal."

**A ৳0 budget and an agent-built 275-part product are mutually exclusive.** Call it ৳15,000/month minimum and say so.

---

## 2. Cash-flow reality: 24 months

### 2.1 The BD school cash calendar — the fact that governs everything

Nothing in the plan is anchored to it. GTM §1.4 identifies "Sep–Oct — **Prime pilot window**" and §8.2 identifies "December–January" as budget season, then §11.2 drops a **generic 13-week sprint** into a market that has **two buying windows a year**.

| Period      | State                                                                           | Sell?                  | Collect? |
| ----------- | ------------------------------------------------------------------------------- | ---------------------- | -------- |
| Sep–Oct     | Annual exams looming; pilots start                                              | **Prime pilot window** | Normal   |
| Nov–Dec     | Annual exams, results; offices in results mode                                  | Low                    | Normal   |
| **January** | New academic year; budgets set; **admission-fee cash lands**                    | **THE closing month**  | **Best** |
| Feb–Mar     | Ramadan run-up + Eid-ul-Fitr; offices half-staffed; festival bonuses drain cash | **Dead**               | ~60%     |
| Apr–May     | Term running; Eid-ul-Adha kills ~2 weeks                                        | Low                    | Normal   |
| Jun–Aug     | Mid-terms; monsoon; travel is miserable                                         | Moderate               | Normal   |

**The consequence nobody has written down.** Today is **17 September 2026**. R1 requires M0–M3 = **149 parts**. At ৳0 budget, GTM §12.1 concedes "you cannot also build fast." Realistic R1 live: **month 6–7 = April 2027.** Therefore:

- The **Sep–Oct 2026 pilot window is already gone.**
- The **January 2027 closing window is gone.**
- **Your first real window is Sep 2027 (pilot) → January 2028 (close).**

**That is a ~14-month delay to first meaningful revenue, and it appears in no document.** Cost: ~৳180,000 of unavoidable burn plus ~12 months of founder opportunity cost (৳1.2M at ৳100k/month). This single fact is worth more than every pricing decision in the file combined.

**Collection curve I model** (BD SME B2B, cheque culture): **55% in-month, 30% month+1, 10% month+2, 5% bad debt.** Cheques are hand-written, account-payee, collected in person, cleared T+2–3 via BACPS, and signed by a proprietor who travels. A 2–3 week float is normal, not exceptional.

**Tax drag I model:** 5% VAT collected and deposited (neutral if you hold a BIN; a 5% margin hit if you do not and absorb it); **10% AIT withheld at source** by any school that is a registered company — cash you recover only against a future tax liability a loss-making startup will not have for years. **Model 6% of billings as trapped in years 1–2.** Neither tax appears anywhere in PRICING §9.

### 2.2 Scenario A — ৳0/month budget (the founder's actual state)

Assumptions: R1 live month 7. ARPA ramps ৳1,100 (50% founding discount) → ৳3,000. Cash out = dev AI spend + infra + travel. Incorporation month 7 (৳35,000). SSLCommerz deferred to month 13 (৳25,500). All figures ৳.

|  Month | Cal.       | Paid schools |        MRR |   **Cash in** | **Cash out** |          Net |             **Cumulative** |
| -----: | ---------- | -----------: | ---------: | ------------: | -----------: | -----------: | -------------------------: |
|      1 | Oct 26     |            0 |          0 |             0 |       15,500 |     (15,500) |               **(15,500)** |
|      6 | Mar 27     |            0 |          0 |             0 |       15,500 |     (15,500) |               **(93,000)** |
|      7 | Apr 27     |            0 |          0 |             0 |     50,500 ⚑ |     (50,500) |              **(143,500)** |
|      8 | May 27     |            2 |      2,200 |         1,210 |       20,400 |     (19,190) |              **(162,690)** |
|     10 | Jul 27     |            5 |      7,000 |         5,600 |       22,000 |     (16,400) |              **(199,000)** |
|     12 | Sep 27     |            8 |     14,400 |        11,800 |       24,000 |     (12,200) |              **(230,000)** |
|     13 | Oct 27     |           10 |     19,000 |        15,700 |     49,500 ⚑ |     (33,800) | **(263,800)** ← **trough** |
|     14 | Nov 27     |           13 |     28,600 |        23,100 |       26,500 |      (3,400) |              **(267,200)** |
|     15 | Dec 27     |           16 |     38,400 |        32,400 |       28,000 |        4,400 |                  (262,800) |
| **16** | **Jan 28** |       **22** | **57,200** | **249,600** ⚑ |       45,000 | **+204,600** |               **(58,200)** |
|     17 | Feb 28     |           23 |     60,000 |      24,000 ⚑ |       46,000 |     (22,000) |                   (80,200) |
|     18 | Mar 28     |           24 |     64,800 |      25,500 ⚑ |       48,000 |     (22,500) |              **(102,700)** |
|     19 | Apr 28     |           26 |     70,200 |        38,000 |       48,000 |     (10,000) |                  (112,700) |
|     21 | Jun 28     |           31 |     89,900 |        66,000 |       52,000 |       14,000 |                   (78,000) |
|     24 | Sep 28     |           38 |    114,000 |        92,000 |       58,000 |       34,000 |                **+42,000** |

⚑ Month 7: incorporation ৳35,000. Month 13: SSLCommerz ৳25,500. Month 16: 8 of 22 schools take annual prepay — 8 × ৳28,600 = ৳228,800 gross, less 2.5% gateway (৳5,720) and 10% AIT on the registered half (৳11,440) = ৳211,600 net, plus ৳38,000 of monthly collections. Months 17–18: Ramadan/Eid collection drops to ~60% **and the annual cohort contributes ৳0 cash** — this is the deferred-revenue hangover.

**Read:**

1. **Trough of ৳(264,000) in month 13 (October 2027)** — three months before the one month that saves the year. **A "৳0 budget" plan needs ~৳300,000 of runway or a parallel income.** Say that out loud.
2. **Cumulative cash does not turn positive until month 24**, and only because of one January.
3. **Single point of failure.** If January 2028 lands 10 schools instead of 22, you are at ৳(350,000) with **no second window for eight months.** There is no scenario in which you survive two weak Januaries.
4. **The month-16 spike is borrowed.** ৳211,600 of it is deferred revenue covering Feb 2028–Jan 2029. Spending it in Q1 is how bootstrapped SaaS companies die in year three.
5. Compare to GTM §12.1's claim: _"40–60 paid schools, MRR ৳180k–280k"_ **at 12 months.** My month-24 is 38 schools / ৳114k. **Their month-12 is optimistic by roughly a factor of 2 on schools and 2.5 on MRR.**

### 2.3 Scenario B — ৳50,000/month budget

First, the ৳50,000 is not ৳50,000. GTM §12.2's table omits the founder's dev AI spend, incorporation/accounting, VAT filing, PDPA compliance, and any onboarding labour:

| Line                                |  GTM §12.2 |           Corrected |
| ----------------------------------- | ---------: | ------------------: |
| Meta ads                            |     20,000 |              20,000 |
| Part-time assistant                 |     12,000 |              12,000 |
| Infrastructure                      |      6,000 |               6,000 |
| AI spend (schools)                  |      5,000 |               5,000 |
| **AI spend (founder's own build)**  |          — |          **10,000** |
| Content, travel                     |      7,000 |               7,000 |
| **Accountant / VAT + AIT filing**   |          — |           **6,000** |
| **PDPA BD replica (from month 18)** |          — |           **8,000** |
| **Total**                           | **50,000** | **~৳66,000–74,000** |

|  Month | Cal.       | Schools |        MRR |     Cash in | Cash out |         **Cumulative** |
| -----: | ---------- | ------: | ---------: | ----------: | -------: | ---------------------: |
|      1 | Oct 26     |       0 |          0 |           0 |   62,000 |               (62,000) |
|      5 | Feb 27     |       0 |          0 |           0 |   66,000 |              (320,000) |
|      8 | May 27     |       5 |      6,500 |       4,000 |   68,000 |              (513,000) |
|     12 | Sep 27     |      15 |     33,000 |      27,000 |   70,000 |              (690,000) |
|     15 | Dec 27     |      28 |     72,800 |      61,000 |   72,000 |              (782,000) |
| **16** | **Jan 28** |  **35** | **94,500** | **489,000** |   80,000 |          **(373,000)** |
|     18 | Mar 28     |      37 |    101,000 |    42,000 ⚑ |   78,000 | **(447,000)** ← trough |
|     21 | Jun 28     |      52 |    150,800 |     122,000 |   82,000 |              (325,000) |
|     24 | Sep 28     |      70 |    217,000 |     182,000 |   88,000 |          **(180,000)** |

**Read:**

1. **Capital required: ৳800,000–950,000**, peaking around month 15–18. Not ৳50,000/month for a while — **৳50,000/month for 24 months is ৳1.2M** and GTM presents it as a marketing budget.
2. **Monthly (not cumulative) break-even:** at a 67% gross margin on my recommended price list, you need `৳74,000 ÷ 0.67 = ৳110,000` of MRR ≈ **38 schools ≈ month 17**.
3. **Cumulative break-even: month 27–29.**
4. Compare to GTM §12.2's claim: _"12-month arrives at 100–130 paid schools (MRR ৳500k–650k)."_ **Their month-12 is my month-26.**
5. The ৳50k spend buys roughly **6 months of schedule**, not 3× the schools. The binding constraint is founder-days on onboarding (§1.18), and ads do not buy those.

### 2.4 The frictions, priced

| Friction                                | Cash effect                                                                                                                  | What to do                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Schools pay late** (55/30/10/5 curve) | ~1.6 months of MRR permanently tied up in receivables; 5% bad debt                                                           | Bill annually; require the first month + onboarding fee before go-live                                                                                              |
| **Cheque culture**                      | 2–3 week float; **1 founder-half-day per school per month** to collect. 20 schools = 20 half-days/month                      | Accept **bKash merchant (1.85%)** from school #1 — available in days on a trade licence, no ৳25,500. Do not wait for SSLCommerz to collect _your own_ subscriptions |
| **10% AIT withheld**                    | 10% of billings from registered schools locked up; recoverable only against future tax                                       | Gross up B2B prices by 11% for schools that withhold; collect the challan every time                                                                                |
| **5% VAT**                              | Neutral with a BIN; a 5% margin hit without one. **No BIN = VAT-registered schools cannot pay your invoice** (no Mushak 6.3) | Register for VAT before school #5                                                                                                                                   |
| **SSLCommerz T+1/T+2**                  | Genuinely not a problem — the 7-day payout hold is correctly sized                                                           | No action                                                                                                                                                           |
| **Eid dead months (Feb–Mar, late May)** | ~40% collection shortfall in 2–3 months/yr, exactly when festival bonuses drain school cash                                  | Hold 3 months of opex in reserve entering February. Never launch a pricing change in Ramadan                                                                        |
| **January budget season**               | The only month with decisions _and_ cash                                                                                     | **Anchor the entire roadmap to it** — see change #1                                                                                                                 |

---

## 3. Pricing verdict

### 3.1 The three models, decided on numbers

| Model                                              | Verdict                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flat per-school tiers** (PRODUCT-DECISIONS §5.1) | **Reject.** Not for the reason §10 gives (bottom/top of market). The fatal flaw is that a flat price with a generous _daily_ AI credit grant is **an uncapped cost against a capped price** — §1.5 shows every tier is negative. Also caps teachers at 5/20/75, which PRICING §3 says is culturally unsellable. |
| **Pure per-student** (৳9/৳13/৳18)                  | **Reject.** Requires monthly enrolment reconciliation (support burden + trust problem), invites under-reporting, and prices you _into_ the commodity fight against vendors bundling free biometric hardware. §10's own cons are correct.                                                                        |
| **Band + overage** (§10 Option C)                  | **Accept the shape. Reject the levels.**                                                                                                                                                                                                                                                                        |

### 3.2 The correction that matters

The research says: _"the sale is never about price. It is about the phone-first attendance, Bengali report cards, and the AI"_ (§11). **If price is not the deciding variable, then pricing at or below the cheapest incumbent at every size above 300 students is giving away margin for nothing.** Its own grid lands at ৳13.1/student at 1,500 and ৳9.4/student at 800 — _below the ৳10 floor_.

A solo founder with 7–24 month payback needs **price**, not volume. Anchor to the **৳15 rung**, not the ৳10 rung. You do not have the support capacity to serve the schools that ৳10/student buys you anyway (§1.18).

### 3.3 The price list I would ship

| Plan           |               Base/month | Included students |   Above included |         **AI actions/month** | SMS                   |
| -------------- | -----------------------: | ----------------: | ---------------: | ---------------------------: | --------------------- |
| ~~Free~~       | **abolished** — see §3.5 |                   |                  |                              |                       |
| **Starter**    |               **৳2,200** |               150 |  **+৳9/student** | **150**, hard cap, no top-up | metered only          |
| **Pro**        |               **৳4,900** |               300 | **+৳11/student** |               **600** pooled | 300 segments included |
| **Enterprise** |         **from ৳18,000** |            custom |           custom |              contractual cap | metered               |

**Against the market anchor** (PRICING §2's ৳10/৳15/৳20 ladder):

| Students |   @৳10 |   @৳15 |       **Acadigma (mine)** | ৳/student | Position                                      |
| -------: | -----: | -----: | ------------------------: | --------: | --------------------------------------------- |
|      150 |  1,500 |  2,250 |                 **2,200** |      14.7 | At the ৳15 rung                               |
|      300 |  3,000 |  4,500 |                 **4,900** |      16.3 | 9% above ৳15 — defensible with AI + phone app |
|      500 |  5,000 |  7,500 |                 **7,100** |      14.2 | Under ৳15, well above ৳10                     |
|      800 |  8,000 | 12,000 |                **10,400** |      13.0 | Under ৳15                                     |
|    1,500 | 15,000 | 22,500 | **→ Enterprise ৳18,000+** |      12.0 | Under ৳15, 20% above the ৳10 floor            |

**Unit economics at Pro / 300 students:**

`৳4,900 − ৳870 (600 AI actions @৳1.45) − ৳350 (infra) − ৳123 (gateway 2.5%) − ৳233 (support) = **৳3,324 = 67.8% gross margin**`

vs the research's recommended Pro at ৳3,500/1,000 actions = **42.6%**. Same market position, **59% more contribution per school.** Payback at ৳36,000 corrected CAC: **10.8 months** instead of 24.1.

**Supporting terms:**

| Term                       | PRICING §11                                          | **Mine**                                                                                           | Why                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Onboarding fee**         | ৳5,000, waived on annual                             | **৳10,000, never waived**                                                                          | Costs ৳6,000–16,000 to deliver. It is a _qualification_ fee: a school that won't pay ৳10,000 to have its data migrated will not do it itself and will churn. Covers migration + 2 training sessions + 1 refresher within 12 months.                                                                                                                              |
| **Annual prepay**          | 2 months free (16.7%), stacked to 25.5%              | **1 month free (8.3%)**, onboarding fee never discounted                                           | The market already prefers annual (§3). Don't pay 25% for it.                                                                                                                                                                                                                                                                                                    |
| **SMS**                    | ৳0.35/SMS                                            | **৳0.75 per UCS-2 segment**, 300 segments on Pro, never "unlimited"                                | Bengali = 2 segments (commerce README §5). Wholesale ৳0.36–0.45 → 45–52% margin, covering delivery failures the aggregator still bills.                                                                                                                                                                                                                          |
| **AI top-up**              | ৳500 / 500 actions (**৳1.00**, below the ৳1.45 cost) | **৳1,200 / 500 actions (৳2.40)** + a **hard ceiling of 3× plan allowance per month**               | A top-up must never be cheaper than your cost. §11 openly says "~৳1 revenue per ৳1.20 cost" — **that is a negative-margin SKU that subsidises the abuse it claims to discourage.** The ceiling matters because subscriptions renew by **invoice-and-pay, not auto-charge** (commerce README §5): an uncapped top-up is an **unsecured credit line to a school.** |
| **Marketplace commission** | 30%                                                  | **30% — but see change #10.**                                                                      | The rate is fine. The business is not.                                                                                                                                                                                                                                                                                                                           |
| **Reseller**               | 100% of m1–3 + 10% recurring                         | **50% of m1–3 at signing + 50% at month 6 + 10% recurring, with clawback on churn before month 4** | §1.12: the stated deal is 32.5% of year-1 revenue and goes net-negative on a school that churns at month 5.                                                                                                                                                                                                                                                      |
| **Price revision**         | not mentioned anywhere                               | **"Prices may be revised on 60 days' written notice"** in every contract                           | Your COGS is USD, your revenue is BDT. See §4.2.                                                                                                                                                                                                                                                                                                                 |

### 3.4 Founding-school pricing

PRICING §12 is right that a free pilot is worthless and a paid one is not. Keep "50% off for 12 months, in writing, with list price stated" — but **charge the full ৳10,000 onboarding fee to founding schools.** The discount belongs on the recurring line where it costs you gross profit, not on the labour line where it costs you cash on day one.

### 3.5 The Free plan — kill it

The research's own words: Free is _"the marketplace and hiring-network seed, not a revenue tier"_ (§11), for a marketplace the same document says is _"~0.6% of revenue"_ and _"do not model it as revenue before 5,000 schools"_ (§7). **You are proposing to burn cash to seed an asset you have already decided not to count.** At the PRODUCT-DECISIONS allowance (20 credits/**day**) that burn is ৳870/school/month, against a cited BD free-to-paid conversion of ~5%: **19 loss-making free schools for every convert.**

Replace it with three things, which give you the network effect without the cost:

1. **30-day full-Pro trial** (not 14 — 14 days shows nothing; one month is one attendance cycle and the research's own §12 says "the value only appears after a term"), **no card**, with a **hard cap of 100 AI actions for the entire trial** (৳145 = an acceptable trial CAC, versus 600/month unbounded).
2. **Free teacher personal workspace with zero AI.** This is the network seed the marketplace and hiring stories actually need (F-ID-06 already builds it), it costs ~৳0 in infra, and **it is what TEACHER-SIDE §7 recommends anyway** ("workspace-first, marketplace-second"). The research conflates the free _school_ plan (expensive) with the free _teacher_ workspace (free). Only the second is strategic.
3. **NGO / madrasa programme** (GTM §8.5) — keep it, keep the hard cap of 25 schools, but **AI off by default** and put it in the P&L as a named marketing line: 25 × ৳300 infra = **৳7,500/month**. A budgeted programme, not a leak.

**Cash effect of killing Free:** at 100 free schools under the documented matrix, **+৳87,000/month** — more than the entire ৳50,000 GTM budget.

---

## 4. Regulatory and platform risk, priced

### 4.1 PDPA localisation (COMPLIANCE-PDPA §5.5)

The document is honest — _"our current architecture does not comply, and no contract clause fixes it"_ — and then lists five mitigations with **no numbers**. Here they are.

| Option                                                                                                                                                                                                    |                         One-time |                                            Annual run | Verdict                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------: | ----------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(d) Minimise what is classifiable** — stop storing NID/birth-certificate scans (keep a verified boolean), structured allergy flags instead of free-text health notes, shortest defensible KYC retention |   **~3 engineer-days ≈ ৳25,000** |                                                    ৳0 | ✅ **Do now.** Removes ~90% of the exposure for 0.5% of the cost of any other option.                                                                       |
| **(b) BD-resident encrypted replica of the sensitive subset**, nightly or near-real-time                                                                                                                  | ~15 engineer-days ≈ **৳120,000** |           **~৳96,000** (1 small BDIX VPS @ ৳8,000/mo) | ✅ **Budget from month 18.** Directly answers the [SINGLE-SOURCE] "real-time synchronised copy inside Bangladesh" requirement. Cheapest defensible posture. |
| **(c) Column-split** — sensitive columns + private bucket domestic, operational DB in Mumbai                                                                                                              | ~40 engineer-days ≈ **৳320,000** |                                             ~৳120,000 | ❌ Most invasive; the document itself calls it so.                                                                                                          |
| **(a) Full BD-resident stack** (self-hosted Supabase / managed Postgres in a BD DC)                                                                                                                       | ~80 engineer-days ≈ **৳640,000** | **~৳480,000** (HA VPS pair + backups + your ops time) | ❌ Unaffordable below ~100 schools. It also means self-hosting Auth, Realtime and Storage — a full-time job.                                                |

**Verdict: do (d) this quarter for ৳25,000; put ৳96,000/year for (b) in the model from month 18; never do (a) or (c).** Today that ৳96,000 is in **no budget in any document** — GTM §13 is a "legal and operations checklist" with no ৳ signs on it.

### 4.2 Supabase / Vercel price-change exposure

Both vendors have restructured pricing in living memory — Vercel to usage-metered Fluid compute, Supabase to compute add-ons plus metered MAU/egress/disk. **Your COGS is USD; your revenue is BDT.** Two compounding risks:

| Shock                                                                                       | @30 schools | @100 schools | @1,000 schools |
| ------------------------------------------------------------------------------------------- | ----------: | -----------: | -------------: |
| Base infra                                                                                  |   ৳8,400/mo |   ৳30,240/mo |    ৳290,000/mo |
| +30% vendor reprice, +8% BDT depreciation (BDT went ~86→122/USD over 2022–25; assume 5%/yr) |     ৳11,800 |      ৳42,500 |       ৳407,000 |
| **Extra ৳/school/month**                                                                    |        ৳113 |     **৳122** |           ৳117 |
| As % of ৳4,900 ARPA                                                                         |        2.3% |     **2.5%** |           2.4% |

**Tolerable — but only if you can pass it on.** The zero-cost mitigation is a contract clause: **"prices may be revised on 60 days' written notice."** BD ERP vendors do this routinely. No document currently mentions it. Also: FX depreciation alone silently eats ~5%/year of gross margin on an unchanged price list. **Build a 5% annual price escalator into the standard contract.**

### 4.3 Anthropic cost trend

Verified today, and **the research's model prices are correct**: Sonnet 5 $2/$10, Haiku 4.5 $1/$5, Opus 5 $5/$25 per MTok. Notably, "the previously scheduled increase to $3/$15 on September 1, 2026 **will not occur**" — Sonnet 5 held its introductory price. Per-unit-of-capability, the trend is **down**.

**But two silent cost increases are sitting in the docs and nobody has priced them:**

1. **The tokenizer change.** Per the pricing page: _"Claude 4.7 and later models use a newer tokenizer that produces **approximately 30% more tokens for the same text**."_ When you migrate off Haiku 4.5 to a next-generation small model, **the same prompt costs ~30% more at an unchanged headline price.** Budget AI COGS at **cost + 30%** and re-verify at every model migration. Put this in the F-TE-03 spec as a stated assumption.
2. **Data residency.** Pinning `inference_geo: "us"` (or any regional endpoint) carries a **1.1× multiplier on all token categories**. If PDPA guidance ever forces regional pinning for AI processing, AI COGS rises **10% overnight**. COMPLIANCE-PDPA §5.2 already flags the Anthropic transfer as "the transfer most likely to be asked about." Price the contingency.

Net: **AI COGS planning number = ৳1.45/action today, ৳2.05/action in the migration + residency scenario.** At Pro/600 actions that moves the plan from 67.8% to 60.6% margin — survivable at my price list, **fatal at the ৳3,500/1,000-action recommendation** (42.6% → 29.9%).

### 4.4 SMS sender-ID lead time — the dependency that is not an engineering task

BTRC masking approval, per BD aggregators: submitted through a licensed aggregator with **registered company name, trade licence, TIN certificate, NID of the authorised person** and the desired sender ID; activation across GP/Robi/Banglalink/Teletalk in **1–5 working days after submission**.

**The 1–5 days is not the constraint. The trade licence and TIN are** — 3–8 weeks in Dhaka, and they sit behind RJSC incorporation.

`ROADMAP.md` M3 step 3.11 ships the SMS adapter as a **2-part "glue" item** with a "sender-ID onboarding checklist." **That is a legal-entity dependency disguised as an engineering task**, and it is on the critical path for R1 parent announcements _and_ for F-CM-08's fee reminders at M4. The identical entity unlocks SSLCommerz and the bKash merchant account.

**Start company formation in the next two weeks.** ~৳35,000 buys you: SMS sender ID, bKash merchant, SSLCommerz eligibility, a VAT BIN so VAT-registered schools can actually pay your invoice, and the ability to sign a DPA as a legal person. **It is the highest-ROI ৳35,000 in the plan and it is currently on nobody's critical path.**

---

## 5. What I endorse

1. **Band + overage over flat tiers or per-student** (PRICING §10 Option C). Correct shape, proven in this exact market by Edufy, and the ROADMAP already provisions for it (`plan_prices` bands + overage at M0 0.5). My quarrel is with the levels, not the structure.

2. **The metered AI credit ledger with a hard block at zero** (PRD §5.3, F-TE-03, ROADMAP 5.2 — "**the AI gate**"). This is the only thing standing between this company and an uncapped, unbounded COGS line. The roadmap correctly makes it a gate that blocks _every_ AI call, and correctly puts it before the first AI feature. **Do not relax it, do not ship a "just this once" bypass, and do not let a support ticket grant credits by hand without an audit row.**

3. **Fee collection with the school as merchant of record and Acadigma taking 0%** (F-CM-08, commerce README §1, D-27). Correct on three independent grounds: regulatory (you are not a payment aggregator and need no Bangladesh Bank licence), cash (no float, no settlement liability, no reconciliation exposure on other people's money), and product (it is the ship-blocker). Moving it to R1.5 ahead of the marketplace is **the single best decision in the entire plan.** The CI test asserting no file in that feature reads `commission_bps` is exactly the kind of control I want to see.

4. **The marketplace pilot gate** (ROADMAP M6 gate: 20 listings / 200 teachers before ~36 further parts). Gating build spend behind evidence is right. My only change is _when_ and _how hard_ — see change #10.

5. **"Don't bundle hardware"** (PRICING §12). Bidyaan and School360 give away biometric and face-recognition devices. That is a working-capital game with inventory, import duty, RMA and a price war on a commodity. Supporting their existing devices via the R4 gate-scan input is exactly right.

6. **"Don't offer a perpetual licence"** (PRICING §12). The ৳30,000 one-time expectation is real and it is the death of a SaaS business. Hold this line even when a principal pushes hard — especially then.

7. **Publishing the price grid** (PRICING §12 Phase 2, GTM §9). A published price is a solo founder's best lead filter: it disqualifies the wrong schools before they consume founder-hours, which §1.18 shows are the binding constraint. Every BD competitor that hides price forces a phone call the buyer may not make.

8. **Building `plans` / `plan_limits` / `plan_modules` first** (ROADMAP M0 0.5, commerce README §3 chunk 0). Getting the flexible pricing schema in before 60 tables reference it is the right sequencing instinct — retrofitting bands and overage across a live schema is exactly the "most expensive mistake available" the ROADMAP principles warn about.

---

## 6. Ten changes, ranked

|      # | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Maps to                                                                                 | Cash/time effect                                                                                                                               |
| -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
|  **1** | **Re-anchor the roadmap to the BD school calendar.** Replan M0–M3 backwards from _pilot-ready 1 Sep 2027 → close Jan 2028_, or cut scope hard enough to pilot in **Sep–Oct 2027**. Add a calendar column to ROADMAP §2. Write down explicitly that **Sep 2026 and Jan 2027 are already lost.**                                                                                                                                                                                                                                                                                                                                                                                | `ROADMAP.md` §2, §8; `PRD.md` §4; `GO-TO-MARKET.md` §11.2                               | The plan currently assumes windows it cannot hit. Naming the real date is worth more than every other change combined.                         |
|  **2** | **Resolve the three live pricing models into one before M0 step 0.5 ships the plans schema.** Amend `PRODUCT-DECISIONS.md §5.1` properly (it is the document the build reads), delete the seat caps, express AI in **actions/month not credits/day**, and reconcile GTM §8.3, which currently argues _against_ the recommendation.                                                                                                                                                                                                                                                                                                                                            | `PRODUCT-DECISIONS.md` 5.1; `ROADMAP.md` M0 0.5; `PRD.md` §5.4; `GO-TO-MARKET.md` §8.3  | Blocking. M0 starts now (ROADMAP §8).                                                                                                          |
|  **3** | **Fix the AI economics.** Recompute cost per action at the true floor (**output tokens cannot be cached or batched**); set allowances in actions/month; price top-ups **above** cost (৳2.40, not ৳1.00); add a hard per-workspace monthly ceiling of 3× allowance; budget at cost +30% for the tokenizer change.                                                                                                                                                                                                                                                                                                                                                              | `PRD.md` §5.3; F-TE-03; `PRODUCT-DECISIONS.md` 5.1/5.4; `PRICING-AND-SALES.md` §9.2/§11 | Turns four negative-margin plans into a 68% margin plan.                                                                                       |
|  **4** | **Kill the Free school plan.** Ship instead: 30-day Pro trial with a **100-action lifetime AI cap**; free teacher personal workspace with **zero AI**; NGO/madrasa programme capped at 25 with AI off and a named ৳7,500/month P&L line.                                                                                                                                                                                                                                                                                                                                                                                                                                      | `PRODUCT-DECISIONS.md` 5.1/5.2; F-CM-06 P2; `PRD.md` §5.4; `GO-TO-MARKET.md` §8.5       | **+৳87,000/month** at 100 free schools.                                                                                                        |
|  **5** | **Incorporate in the next two weeks** — RJSC + trade licence + TIN + VAT BIN, ~৳35,000. It gates BTRC sender ID, bKash merchant, SSLCommerz eligibility, Mushak 6.3 invoicing, and DPA signature.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `ROADMAP.md` §8 (add as item 0), M3 3.11; `GO-TO-MARKET.md` §13                         | Removes a 6–10 week hidden dependency from the critical path.                                                                                  |
|  **6** | **Collect Acadigma's own subscriptions by bKash merchant (1.85%) + bank transfer from school #1. Defer the ৳25,500 SSLCommerz to M4.** And make **bKash the default rail for F-CM-08 school fees**, with SSLCommerz the upgrade — the ৳25,500 school-side cost is a real adoption barrier for the ship-blocker feature.                                                                                                                                                                                                                                                                                                                                                       | `PRD.md` §7; `ROADMAP.md` M4 4.1/4.3; commerce README §5                                | Defers ৳25,500 by ~12 months; removes a ৳25,500 barrier per school on the must-have feature.                                                   |
|  **7** | **Break the onboarding-days ceiling.** Make F-AC-02 P8 (CSV import with real validation UI) the best screen in the product; replace on-site training with recorded Bengali videos + a printed one-pager; charge **৳10,000 for optional on-site**, never waived. Target **0.5 founder-days per school.**                                                                                                                                                                                                                                                                                                                                                                       | `ROADMAP.md` M2 2.3; `PRICING-AND-SALES.md` §11/§12; `GO-TO-MARKET.md` §8.2             | Moves the annual ceiling from ~40 schools to ~150. **This is the highest-leverage engineering investment in the plan.**                        |
|  **8** | **Price SMS per UCS-2 segment at ৳0.75**, 300 segments included on Pro, never "unlimited." Make the segment-and-taka estimate mandatory before every send (F-CM-08 P12 already specifies the composer — connect it to the price list).                                                                                                                                                                                                                                                                                                                                                                                                                                        | F-CM-08 P12; `ROADMAP.md` M3 3.11; `PRICING-AND-SALES.md` §11                           | Turns a **(৳740)–(৳2,100)/school/month** loss into a 45–52% margin line.                                                                       |
|  **9** | **Restructure the reseller deal:** 50% of months 1–3 at signing + 50% at month 6 + 10% recurring, **with clawback if the school churns before month 4.** Publish the certification requirement before an agent may quote.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `PRICING-AND-SALES.md` §11/§12.3; `GO-TO-MARKET.md` §4.7                                | Removes a structure that goes **net-negative** on an early-churning school.                                                                    |
| **10** | **Cut or defer, in this order.** (a) **Marketplace** — move the go/no-go gate from M6 to immediately after M3, run the pilot slice (9 parts) only, and make the **default answer "no."** Net contribution is ৳8,400/month at a scale you won't reach, against ~90 engineer-days, plus an **unresolved AIT-withholding obligation** (commerce README §7.3). (b) **Kill the ৳3,000–5,000/pack seller commissioning** (TEACHER-SIDE §7) — ৳120,000 of inventory purchase with an 18-year payback. (c) **Defer M7 native apps entirely** — the PWA plus browser print is sufficient; the Tauri print agent especially. (d) **Hiring: minimal 4 parts only** (D-28), rest shelved. | `ROADMAP.md` M6, M7, M4 4.6; F-CM-02…05; `TEACHER-SIDE.md` §7                           | Frees **~70 parts ≈ 140 engineer-days ≈ ৳1.1M** of founder capacity — redeployed onto changes #7 and #1, which are what actually move revenue. |

**One more, which is free:** add a **"prices may be revised on 60 days' written notice"** clause and a **5% annual escalator** to every school contract. Your COGS is USD on a depreciating BDT base (§4.2); without this you lose ~5%/year of gross margin to FX alone and cannot recover a vendor reprice.

---

## 7. Where this leaves the investment case

I am not saying don't build it. I am saying the plan in front of me describes a **42.6% gross margin business with a 24-month payback, a ৳300k–950k funding hole, one buying window a year, and a month-12 target that is 3.2× oversubscribed on founder-days.**

Fix the five numbers below and it becomes a **68% gross margin business with an 11-month payback and a capital need of ৳300k** — which a founder can self-fund from contract work if the roadmap is anchored to January 2028 rather than to a generic 13-week sprint.

The product thinking is good. The market research is genuinely the best I have read on this sector. **The finance is decorative, and it is decorating a real business.** Fix it before M0 0.5 commits the schema.
