# Debate 02 — The Teacher's Objection

Adversarial review · critic #2 of 5 · 2026-09-17

**Who is writing.** I am 29, I teach English at a private English-version school in Chattogram. My salary is **৳18,000/month**, paid in cash in an envelope, usually on the 7th–10th, sometimes the 15th. I tutor **12 students** in the evenings — that is where the rest of my money comes from. My phone is a 3-year-old Android with **3 GB RAM**, on a **Robi** pack I buy weekly and run out of before the week ends. I am in two teacher Facebook groups. I make worksheets on **free ChatGPT** on Thursday nights. I have **never been paid for a worksheet** and I have never met anyone who has. I have applied for jobs on **Bdjobs** and by commenting on Facebook posts.

I read all six research documents, the PRD, PRODUCT-DECISIONS, the design system and the roadmap. Most of it is better than anything I have seen from a Bangladeshi software company. That is not the same as it being right about me.

Sources are cited as `FILE §section` against the repo at `docs/`.

---

## 1. Claims I reject or doubt

### R1 — "Hiring is the acquisition engine" is built on a cohort Acadigma cannot serve

> "**Pull a minimal hiring surface forward from R3 into R1.** … Hiring is the #1 first-use trigger (§8) and the only acquisition channel that works **before** a school signs."
> — `TEACHER-SIDE.md §10 P0 #1`

The evidence for "#1 first-use trigger" is the NTRCA group cluster: "3.7M memberships … unique humans are plausibly 400K–800K" (`TEACHER-SIDE.md §1.1`). But the same document, two sections later, says of the NTRCA route:

> "Gate: National registration exam → certificate → **central recommendation**. Discovery: ntrca.gov.bd, Teletalk portal"
> — `TEACHER-SIDE.md §4.2`

Those 400–800K people are not looking for job postings. They are waiting for a **central government recommendation letter** against an MPO vacancy. No amount of job-board product reaches them, because a school cannot post that job — NTRCA allocates it. The research counted the biggest crowd in the country and then attributed its intensity to a feature that structurally cannot serve it. Strip the NTRCA cluster out and the actual addressable hiring audience is Tier C: BEMSTA 43.2K + English Medium School Jobs 32.7K + a few smaller groups. That is a good audience. It is not "the acquisition engine."

And on my side: I have applied through Bdjobs twice. I will not check a job board with zero postings for my subject in my district. Schools post on Bdjobs **because it has candidates** (`COMPETITORS.md §4.1`: ৳3,098–6,195 per listing, 1,000+ live education vacancies) and on Facebook **because it is free**. Acadigma has neither candidates nor a reason for a school to leave a free channel. Moving F-OP-01 into M4 to fix acquisition is spending 4–9 parts (`ROADMAP.md §3 M4 4.6`) on a two-sided cold start with no side.

### R2 — Marketplace seller economics do not survive contact with my hourly rate

> "| 100 schools | ~1,500 [teacher buyers] | ~150 [items sold/yr] | ৳150 | ৳22,500 [GMV] | **৳6,750/yr** | ~৳1,500/mo [top-1% seller] |"
> — `PRICING-AND-SALES.md §7`

Read that top-1% column again. At 100 schools — which is a _successful_ year one — the single best seller in the entire country makes **৳1,500 a month**, and everyone else makes effectively nothing. I earn ~৳165/hour tutoring (`TEACHER-SIDE.md §3.1`, and that matches my reality). A worksheet pack good enough to charge for — original questions, an answer key, clean Bangla, a preview — is four to six hours. That is ৳660–1,000 of foregone tuition income to produce an asset that the model says will return, across the whole platform, ৳6,750 a year split among fifty people.

The research knows this and says so honestly ("Do not model it as revenue before 5,000 schools", same section). But then `GO-TO-MARKET.md §6.1` and `OUTREACH-TEMPLATES.md §8a` go out and pitch me on **"আপনি পাবেন ৭০%"**. Seventy percent of ৳0 is ৳0. The two halves of the research are not speaking to each other, and the half that talks to me is the optimistic one.

### R3 — ৳1,000 vs ৳300 is the wrong argument; the payout _cadence_ is the problem

> "Manual bank/bKash/Nagad, **monthly on the 1st, min ৳1,000, 7-day hold**."
> — `PRODUCT-DECISIONS.md 4.2`
> "**Lower the payout minimum to ৳300**, or add instant-payout-on-request with a fee."
> — `TEACHER-SIDE.md §10 P0 #2`

I reject both numbers as the thing that matters. I live in a country where bKash send-money is instant and I can see it land while the other person is still on the phone. A platform that holds my ৳340 for a 7-day hold and then **until the 1st of next month** is not "conservative", it is a platform that feels like it does not want to pay me. Worst case under the current design: I sell on the 2nd, the hold clears on the 9th, I am paid on the **1st of the following month** — 29 days. If I clear only ৳340, I wait indefinitely at the ৳1,000 minimum.

Also nobody in these documents has priced the cash-out. bKash cash-out is ~1.85%. My ৳340 arriving in bKash is not ৳340 in my hand, and if the platform does not say so, the first seller who discovers it will post about it in a 43K group.

### R4 — AI credits price me below the free thing I already use

> "Every AI action has a fixed credit price … lesson plan 5, worksheet 3, quiz 3, parent message 1, pacing plan 8, image 4, syllabus extraction 10"
> — `PRODUCT-DECISIONS.md 3.3` (corrected upward to worksheet 4 / quiz 4 in `DECISION-LOG.md` D-08 amendment)
> "**Free ৳0** — 5 teachers, 150 students, 1 GB, **20 AI credits/day**"
> — `PRODUCT-DECISIONS.md 5.1`

Twenty credits a day is **four worksheets**, or three worksheets and a lesson plan, and then I am hard-blocked (`PRODUCT-DECISIONS.md 3.3`: "At zero: hard block"). On free ChatGPT on a Thursday night I make ten or twelve worksheets in one sitting, because that is how the work actually arrives — not four a day, every day, but nothing for five days and then everything at once before the week starts. A daily reset at 00:00 Asia/Dhaka is exactly the wrong shape for a teacher's week. A weekly bucket with the same total would cost you the same money and would fit my life.

79.3% of teachers are on free ChatGPT (`TEACHER-SIDE.md §5.1`). You are asking that 79.3% to switch to a **more restricted** version of the thing they already have, in exchange for it being inside a school app. That is a downgrade with extra steps.

### R5 — The Free-plan Haiku restriction puts the worst Bangla in front of the poorest schools

> "Recommendation: keep 20/day but **restrict the Free plan's `ai_actions` to the haiku-backed set** plus `lesson_plan.generate` via `min_plan_tier`, which drops the worst case to well under ৳100/month."
> — `F-TE-03-ai-credits.md §5.12`

The cost logic is sound. The language consequence is not, and nobody checked it. The same research says:

> "**Bangla quality** — _'Its answers in English are always better'_; Bengali responses often contain errors" … "consistent performance gaps for Bengali compared to English, **particularly for smaller models**"
> — `TEACHER-SIDE.md §5.3`, quoting `arXiv:2507.23248`

`min_plan_tier` gates by **cost**, and cost correlates with model size, and model size is exactly what determines Bangla quality. So the Free plan — the Bangla-medium village school, the madrasa on the sponsored plan (`GO-TO-MARKET.md §8.5`), the mofussil KG the Free tier was explicitly designed for — gets the model that is worst at Bengali. Meanwhile P0 #4 of the same document says: "**never ship unreviewed Bangla to parents**". These two decisions are in direct conflict and the conflict lands hardest on the users with the least ability to notice the errors.

Route by **language risk**, not by plan tier. Bangla output to a parent should never be on the cheap model regardless of who is paying.

### R6 — The personal-workspace pitch asks me to be a vendor's agent inside my own workplace

> "a persistent, non-nagging card: **'আপনার স্কুলকে যুক্ত করুন'** → generates a pre-written Bengali message + a one-page PDF she can forward to her principal, and **notifies you (as a warm lead)** with her consent."
> — `GO-TO-MARKET.md §5.2`
> "A teacher on a personal workspace who invites her principal, resulting in a school that reaches paid: **৳2,000 bKash** or 12 months of marketplace commission-free selling"
> — `GO-TO-MARKET.md §3.5C`

No. I am on ৳18,000 with no contract worth the paper. Introducing a paid vendor to my principal puts me in a position where, if the software is bad or the bill is disputed, it is my name attached. And taking **৳2,000 cash for it** — which the principal will eventually learn, because principals in Chattogram talk — makes me the teacher who took a commission on a school purchase. That is a reputational risk worth vastly more than ৳2,000 to someone whose entire earning power is her reputation in a small city.

Pay the _school_ if you want. Do not pay _me_ to sell to my employer. Keep the pre-written forward message (that is fine, it is just a message) and delete the cash bounty.

### R7 — The personal workspace solves a problem I do not have and skips the one I do

> "| Slot 2 | Students | `/personal/students` | Slot 3 | Attendance | `/personal/attendance` | Slot 4 | Diary |"
> — `DESIGN-SYSTEM.md §3.2` (Personal workspace)
> "**Personal workspace must include a tutoring session ledger positioned as _payment evidence_**, exportable as a PDF a tutor can show a guardian."
> — `TEACHER-SIDE.md §10 P1 #11`

I do not need to take attendance of my 12 tuition students. I can see all twelve of them. What I need, every single month, is: **who has paid me and who is two months behind.** Right now that lives in my head and in a note on my phone, and I lose ৳3,000–5,000 a year to guardians who quietly stop paying and I am too embarrassed to chase precisely because I have no record.

"Session evidence" is not a money ledger. A PDF of sessions taught is what you show _after_ a dispute; a dues list is what prevents one. The fee machinery already exists in the plan — `F-CM-08` has heads, allocation, arrears, receipts, defaulters — but `PRODUCT-DECISIONS.md 5.5` says "**only school workspaces have subscriptions**" and the whole fee module is scoped school-side (`ROADMAP.md M4 4.2–4.3`). The personal workspace gets attendance and a diary. You built a cashier for a 400-student school and gave the tutor with 12 students a register.

### R8 — "Teachers will approve every AI draft" describes week one, not week four

> "**Ship 'teacher approves every AI output' as a universal pattern** … Every F-TE-03 tool: draft → edit → approve → attributed and logged."
> — `TEACHER-SIDE.md §10 P0 #3`
> "AI teacher comments are **stored** (`report_comments`) and require teacher approval before parent visibility."
> — `PRODUCT-DECISIONS.md 6.6`

I will read the first five comments carefully. By the fortieth, at 9pm, with the office asking when the cards will be ready, I will approve them in a batch without reading. Everyone will. And the design makes it easy: `F-OP-03 P4–P5` generates comments in bulk for a whole section via the Batch API (`PRICING-AND-SALES.md §9.2`: "Report-card comment (bulk, 40 students)"), so an "Approve all" button is not a risk, it is an inevitability.

Understand what approval actually is here: it is **liability transfer**. When a comment says something wrong about a child and the guardian comes to school, the audit log shows my user id clicked approve. Acadigma's name is not on it. Mine is. If you want teachers to trust this, approval for anything a parent will read must cost something — require an edit, or a typed sentence, per comment. No bulk approve on parent-facing text. That is slower and it is correct.

### R9 — Attendance pre-filled as present is the decision that will get the whole product distrusted

> "The roster is already **pre-filled to `present`** — a deliberate default, because in a real classroom most students are present. … So: **0 taps for a present student**"
> — `DESIGN-SYSTEM.md §5.1` (and `ROADMAP.md M2 2.4`, "pre-fill present + confirm, D-22")

This is the single worst idea in the documents and it is presented as the cleverest one.

(a) **It manufactures false records silently.** I open attendance, the bell goes, a guardian appears at the door, I put the phone down. Forty-five children are now marked present, saved optimistically and continuously ("there is no Save button to forget", same section), with my name on it. Nobody tapped anything. In BD the monthly register is signed and is the artefact the principal and the inspection look at.

(b) **It makes proxy attendance the default state of the system.** A 2023 audit across 50 schools in Bangladesh, India and Pakistan found roughly **1 in 4 attendance entries contained errors**, including deliberate proxy marking — which is exactly why biometric vendors have sold into 150+ BD institutions covering 500,000+ students ([Tipsoi](https://tipsoi.pro/biometric-attendance-system-in-bangladesh/)). Into that market you are shipping an app whose default is "everyone is present unless a human intervenes." The first principal who works out what the default is will stop believing the attendance dashboard, the 75% exam-eligibility rule (`PRODUCT-DECISIONS.md 2.2`), the low-attendance guardian alert and the at-risk score (`F-AC-09`) — all of which are downstream of this one field.

You can keep 60 seconds without the lie. Default **unmarked**; put "সবাই উপস্থিত / Mark all present" as one explicit tap in the header that writes an audited bulk action with the teacher's id. Same tap count, honest record, and the principal can see who used it.

### R10 — The ≤60-second attendance target measures the wrong window

> "A teacher marks a 40-student section's attendance in **≤ 60 seconds** on a 360 px phone"
> — `PRD.md §3.1`
> "Open Attendance. The correct section and today's date are **pre-selected** from the teacher's timetable"
> — `DESIGN-SYSTEM.md §5.1`

The 60 seconds starts after the app is open, authenticated, and after the timetable has correctly guessed which of my six sections I am standing in. On my phone — 3 GB with Facebook, Messenger, WhatsApp and Ridmik resident, maybe 400 MB genuinely free — a cold start of a PWA with a TanStack cache, an IndexedDB offline queue and a GSAP motion module (`ROADMAP.md M0 0.9`, D-33) is not instant. And the timetable pre-selection assumes the routine is entered and current; in my school the routine is rewritten by hand during exam season and nobody updates anything.

Measure **phone out of pocket → register saved**, on a device with 400 MB free, with a stale timetable. If that number is 3 minutes, the 60-second metric is a lie the team will pass in CI and fail in a classroom. Also: a GSAP animation library in a product whose stated floor is a low-RAM Android is a luxury I did not ask for and will pay for in jank.

### R11 — "Stop optimising for data cost" misreads how a Robi pack works

> "**Data cost is NOT a real barrier.** ~৳33/GB is among the world's cheapest. … **Stop optimising for data cost; optimise for CPU and RAM**"
> — `TEACHER-SIDE.md §7`

Half right, and the wrong half is dangerous. ৳33/GB is a blended average that includes 30-day bulk bundles. I buy weekly packs (the same table lists GP 3 GB weekly at ৳70 ≈ ৳23/GB, and the short-validity packs are worse per GB). But the price per GB is not my experience of data. My experience is: **I run out on Tuesday and I have no data until Friday.** For three or four days a month I am not "on expensive data", I am _offline_, and my phone has Chrome's data saver on and background data restricted for most apps because that is how everyone here makes a pack last.

So the correct conclusion is not "data is cheap, ignore it." It is: **the app must be fully usable with zero data for several consecutive days**, and must not assume a background connection. Which brings me to —

### R12 — There is no push notification until R4, and that kills the "daily" story

> "Channels: in-app always; **push (native wrappers)** and email digest per preference."
> — `PRODUCT-DECISIONS.md 1.11`
> "| Messages from office/parents | F-OP-06 | Fear of missing something |" — listed as a **daily hook**
> — `TEACHER-SIDE.md §8 Stage 1 → 2`
> "**R4 Native & automation** … Android (Capacitor) with **push**"
> — `PRD.md §4`

Messaging is sold as a daily hook and push is scheduled for the **fourth release**. Through R1, R1.5, R2 and R3 the only way I learn the office sent me something is by opening the app to check. I will not do that. Nobody will do that. `VOICE-OF-CUSTOMER.md §5` ranks notification failure as the **#3 pain** in the entire corpus — "a notice that arrives after the class is worse than no notice" — and the plan's answer is to not have notifications for four releases.

Web Push works in Chrome on Android for an installed PWA. It is not free to build, but it is not R4 work either. Either ship it in R1 or delete messaging from the daily-hook story and admit WhatsApp keeps that job.

### R13 — Workload variance visible to admins will make me stop logging lessons

> "**Both shown**: scheduled periods (timetable) and logged periods (lesson logs). Balancer suggestions use scheduled; **reports show variance**."
> — `PRODUCT-DECISIONS.md 3.8`
> "Admins get a balance view: periods per teacher, **burnout banding against school-set thresholds**, suggested rebalances, and a variance report."
> — `F-TE-06-workload.md §1`

Ask a teacher this question instead of assuming the answer. Nobody in this research asked whether teachers _want_ their workload visible to management.

A "variance report" is a list of days I did not log a lesson. It does not know that I covered for an absent colleague, or that the period was eaten by the annual sports rehearsal, or that the principal pulled me into the office. To the report those are all the same: scheduled 6, logged 3. That is a disciplinary document with my name on it, generated automatically, every week, forever.

The rational response is to stop logging — or to log fictitiously. Either way `lesson_logs` becomes garbage, and **pacing** (`F-TE-02`), the **workload cockpit** (`F-TE-06`), and the **analytics dashboards** (`F-TE-07`, "every number … computed from real tables … No mock arrays ship") are all computed from that garbage. You will have honest infrastructure producing dishonest numbers, which is worse than mock data because everyone will believe it.

### R14 — The burnout thresholds are an international-school number

> "`workload_thresholds jsonb not null default '{"healthy_max":20,"moderate_max":24,"burnout_min":25,"window":"week"}'` … Defaults 20/25 are carried directly from the prototype's `WARN_THRESHOLD = 20` / `BURNOUT_THRESHOLD = 25` periods per week"
> — `F-TE-06-workload.md §4`

I teach 28–32 periods a week. So does everyone in my staff room. So does everyone in every school I have worked in. Ship this default into a Bangladeshi private school and on day one **the entire staff is banded "High / burnout."** The principal's two options are to turn the module off or to drag the threshold to 34, and he will do one of those within an hour, after which the feature has taught him that Acadigma does not know what a Bangladeshi school is. The spec's own note admits this ("a BD school with 8-period days and a Sat–Thu week has a different normal") and then ships the wrong default anyway. Ship 26/32, or ship no default and force the setting during onboarding.

### R15 — "Open to work" privacy is not solvable by a hide-from-my-school toggle

> "`teacher_profiles` on the user (bio, subjects, experience, education, certificates as private files, `open_to_work`). **Schools browse only opted-in profiles.**"
> — `PRODUCT-DECISIONS.md 6.2`
> "**`open_to_work` as a quiet signal, not a public broadcast.** … it needs an explicit _hide from my current school_ control or teachers will never tick the box."
> — `COMPETITORS.md §4.2 (5)`

Even with the hide-my-school control, no. There are maybe forty English-medium and English-version schools in Chattogram worth working at. Their principals know each other, sit on the same committees and are in the same WhatsApp groups. Hiding from _my_ school does nothing when the principal at the school two streets over sees me in a candidate list and mentions it over tea — which is exactly the dynamic the research documented itself:

> "anonymous posts asking about a named school's work environment … Candidates are crowd-sourcing employer due diligence **anonymously**, because attaching their name is career-risky."
> — `TEACHER-SIDE.md §4.5`

The research correctly identified that candidates hide their identity, then designed a **browsable candidate directory** (`PRODUCT-DECISIONS.md 6.1`, "candidate browse"). Delete browse. I apply; only the school I applied to sees me; disclosure is per-application and revocable, like the document-consent model you already got right (`PRODUCT-DECISIONS.md 1.15`). A directory of employed teachers signalling availability is a product that only unemployed people can safely use, and unemployed people are not who schools want to hire.

### R16 — Instant "provisional verified" badges devalue the only thing worth verifying

> "**Instant credential issuance.** Verified badge and seller status issue in-session … Keep the 2-day KYC SLA (F-CM-02) but **issue a provisional badge immediately.**"
> — `TEACHER-SIDE.md §10 P1 #7`

A badge that might be withdrawn in two days is not a credential, it is a sticker. The moment one school hires against a provisional badge that later fails, the badge means nothing to every school, permanently — in a market of this size that takes about one incident.

Worse, look at what verification actually is here: "Verification of degrees/identity: **platform staff via KYC-style queue**" (`PRODUCT-DECISIONS.md 6.2`). A person in an office looking at a photo of a certificate. That is precisely the process that let **1,156 forged certificates** through, one of them for **twelve years** (`TEACHER-SIDE.md §4.3`). Eyeballing a JPEG is not verification, and calling it "verified" in a market with a documented national forgery problem is the kind of claim that ends up in a newspaper. Say what you actually checked: "NID matched", "certificate on file, not independently verified", "3 years of teaching recorded on Acadigma." The last one is the only claim you can actually back, and it is the genuinely defensible one (`COMPETITORS.md §4.2 (3)`).

### R17 — The teacher outreach scripts will get screenshotted and mocked in the groups they target

> "আপা/ভাই … আপনার রেফারেল কোড: **[CODE]** … তিনি পাবেন ২০০ AI ক্রেডিট, আর তিনি একবার ব্যবহার করলেই আপনিও পাবেন ২০০ ক্রেডিট।"
> — `OUTREACH-TEMPLATES.md §6b`
> "আপনার যেকোনো ৩টি ফাইল WhatsApp-এ পাঠিয়ে দিন, আমি নিজে সাজিয়ে, দাম বসিয়ে … আপলোড করে দেব।"
> — `OUTREACH-TEMPLATES.md §8d`

Three problems.

**Referral codes for credits read as MLM.** In my groups, a message with a personal code and a two-sided reward is indistinguishable from the referral spam that gets people removed. `TEACHER-SIDE.md §9` says "Never DM scraped members. Reputationally fatal in a market this interconnected" — and then §8a/§8b/§8d are all cold DMs. The document contradicts its own non-negotiable.

**"WhatsApp me your three files."** You are asking a teacher to send her original material to an unknown man, unwatermarked, with no agreement, in a market the same research describes as having "**effectively no attribution norm**" (`TEACHER-SIDE.md §2.3`). Even with the best intentions this is the exact shape of the thing teachers have learned to fear. Make it an upload into an account she controls, with her name already on the file, and offer to format it _after_ it exists on her side.

**"আপা/ভাই" in a cold DM from an unknown man to a woman teacher** is wrong in a way that will not be explained to you — you will just get no reply. Use the school/institution as the entry point, or go through a group admin, which the same document already identifies as correct ("A group admin who becomes a paid seller is worth 50 cold posts").

### R18 — Bengali typography: the font budget and the base size were set from Latin reasoning

> "English-only session: 48 KB. **Bengali session: 48 + 138 KB.**"
> "`--text-base` is **15px**, not 16 — at 360px a 15px body buys roughly four more characters per line in a **student-name column**"
> — `DESIGN-SYSTEM.md §1.6`

The 15px decision is justified entirely by Latin arguments (Inter's behaviour, characters per line in a name column) and then applied to Bengali, which carries matras above and below and needs _more_ optical size than Latin at the same legibility, not less. Bengali at 15px with `line-height: 1.75` on a low-DPI 360px screen, read by a 45-year-old colleague in a dim staff room, is small. Set a separate Bengali base size.

On the font budget: **186 KB of webfont on a Bengali session** against a stated JS budget of "< 200 KB per route" (`PRD.md §6`) is not a footnote, it is a second budget nobody added up. And the document never states what happens during the ~1–3 seconds that 138 KB is downloading on one bar of Robi 4G. Android's fallback Bengali has different metrics, so my roster reflows mid-read — and on older WebViews, fallback Bengali conjunct rendering is where the ugly failures live. `VOICE-OF-CUSTOMER.md §4.9` shows a reviewer correcting another app's Bengali **glyph by glyph** ("'ঢ'-কে বলা হয়েছে 'ড'"). People here read Bengali rendering forensically. Subset and self-host the Bengali face, inline the critical range, and test the fallback flash explicitly.

### R19 — The salary-per-day arithmetic that justifies the performance budget uses the wrong denominator

> "a mid-tier English-medium teacher on ~৳30,000/month earns ~৳1,000/working-day. Any Acadigma feature that costs her more than ~15 minutes/day must return more than that in value"
> — `TEACHER-SIDE.md §4.4`

I am on ৳18,000, not ৳30,000, and the research's own band for my segment starts at ৳8,000 (`TEACHER-SIDE.md §4.4`; corroborated — a BD kindergarten teacher averages ~৳18,000 with a floor near ৳8,280, [Worldsalaries](https://worldsalaries.com/average-kindergarten-teacher-salary-in-bangladesh/)). More importantly, my salary is not the price of my time. My salary is fixed whatever I do; what fifteen minutes actually costs me is **fifteen minutes of tuition**, or fifteen minutes of the evening I get with my family after a 7am–4pm day and three tuition sittings. The relevant number is the ৳165–500/hour in §3.1, not salary ÷ 22.

This matters because the wrong denominator makes the performance budget look _generous_. It is not. Anything that adds a step to a daily task competes with my evening, and my evening is the only part of my life I control.

### R20 — Three different device floors, none of them measured, and my phone is below all of them

> "**Treat 3 GB RAM / Chrome on Android 11 as the design floor** until measured." — `TEACHER-SIDE.md §7`
> "Baseline is **360 × 800 CSS px, 2× DPR** — a 2021 entry Android" — `DESIGN-SYSTEM.md §3`
> "Cold start to first meaningful paint < 2.5 s on a **2 GB-RAM** Android device over 3G-fast" — `VOICE-OF-CUSTOMER.md §7.2`
> "Device RAM distribution — **Confidence: Low**. No BD-specific source found." — `TEACHER-SIDE.md §11`

Three documents, three floors, and the research openly admits it has no data. I am telling you what the floor is: a phone with 3 GB of nameplate RAM, three years of accumulated apps, Facebook and Messenger and WhatsApp and Ridmik all resident, and roughly 400 MB actually free. Nameplate RAM is not available RAM, and every one of these budgets is written against nameplate. Buy three ৳12,000–15,000 phones from a Chattogram shop, install what a real teacher has on them, and set the budget from those. Until then all three numbers are guesses that happen to be written in a table.

### R21 — "70% of their teachers active weekly" measures the principal, not me

> "10 schools onboarded; **≥ 70 % of their teachers active weekly**."
> — `PRD.md §3.4`

"Active" will be measured as attendance-taken, and attendance is the one thing my principal can make mandatory (`TEACHER-SIDE.md §8`, trigger #2: "Her school's principal makes attendance mandatory. Top-down, 100% conversion, **zero desire**"). So the metric will read 95% and tell you nothing about whether a single teacher chose to use the product. Measure something I do voluntarily: lesson plans I did not have to write, resources I opened on my own time, messages I initiated. Those numbers will be small and embarrassing and true.

### R22 — "Powered by Acadigma" on a report card will get the app removed by the principal

> "Free-plan PDFs (প্রগতিপত্র, নম্বরপত্র, registers, ID cards) carry a small, tasteful footer: `Acadigma Campus দিয়ে তৈরি · acadigma.com` with a QR."
> — `GO-TO-MARKET.md §5.6`

The report card is the school's most public document. It goes home to 400 guardians, several of whom are on the school committee, and some of whom will ask why there is an advertisement on their child's প্রগতিপত্র. A principal who gets that question once will print last year's Word template instead, and the whole R1 value proposition ("Report cards for a whole section generate in ≤ 2 minutes") dies over a footer. Put it on registers and internal sheets. Keep it off anything a guardian holds.

---

## 2. Claims I strongly endorse

### E1 — Zero commission on tutoring, said loudly

> "**Zero commission on tutoring, stated loudly.** Commission applies only to marketplace sales … The 40–50% agency fee is the defining grievance; a group is literally named 'without media fee'."
> — `TEACHER-SIDE.md §10 P1 #12`

This is the one line in six documents that would make me open the app. Every tutor I know has been burned by a media that took the first month for a phone number. Say "০% কমিশন" on the install screen in Bengali, in big type. It is free to say and it is true.

### E2 — The lesson planner must open with a draft, never a blank box

> "A lesson planner that is a blank text box … teachers with no formal training (§1.3) do not have a lesson-plan template in their heads."
> — `TEACHER-SIDE.md §8`

Correct, and the reason is correct. I have a B.A. in English. I have never been taught how to write a lesson plan. Nobody at my school has. "Formal training reaches under 0.5% of the teaching workforce annually" is the truest sentence in the research. A blank form is a wall; a draft is a conversation.

### E3 — Offline attendance with a visible pending count

> "every change queues in IndexedDB with its idempotency key and replays on reconnect; the row shows a small pending glyph until confirmed" — `DESIGN-SYSTEM.md §5.1`
> "Show an explicit '3 items waiting to sync' chip so the teacher knows their work is not lost." — `VOICE-OF-CUSTOMER.md §7 P4`

Load-bearing and correctly specified. The visible count is the part that matters — not the sync, the _proof_ of the sync. My classroom is on the third floor at the back and my pack runs out on Tuesday.

### E4 — Login as the #1 pain

> "**Login is a daily tax** … 192 of 246 BD login mentions are negative … Every BD school app in the corpus has 1★ reviews about being logged out"
> — `VOICE-OF-CUSTOMER.md §5 #1`

This is why I stopped using two apps. Not features — login. "Zero forced re-authentications over a 30-day period" as a hard metric (`§7.2`) is the correct obsession, and the three visible recovery paths on the sign-in screen, including "ask my school to reset", is the right design for a workforce that shares phones and forgets passwords.

### E5 — Western digits by default in the Bengali UI, Bengali numerals only on parent-facing print

> "**Digits default to Western (0-9)**, including in Bengali UI, because every numeric keypad and every mark sheet in a Bangladeshi school office uses them. `<MoneyText numerals='bn'>` … opt in to ০-৯ for printed report cards"
> — `DESIGN-SYSTEM.md §1.6`

Exactly right and almost everybody gets this wrong. I write marks in Western digits and the printed প্রগতিপত্র uses Bengali ones. Whoever wrote that has seen a real mark sheet.

### E6 — The custom numeric pad for marks entry on phone

> "We draw the pad rather than relying on the OS keyboard because the Android numeric keyboard covers 55% of the viewport, varies wildly by OEM, and often has no reliable 'next' affordance."
> — `DESIGN-SYSTEM.md §5.2`

Whoever wrote that has entered marks on a cheap Android. The OEM keyboard problem is real and invisible to anyone who has not.

### E7 — The marketplace pilot gate

> "**Go/no-go** on pilot metrics … No-go → marketplace stays a free resource-sharing layer; parts below are shelved."
> — `ROADMAP.md M6 gate`
> "the absence of any commercial Bangla teacher-material marketplace … is at least as consistent with **'teachers here share for free and will not pay'**"
> — `COMPETITORS.md §3.4`

The most honest decision in the plan, and the pessimistic reading is the correct one. I will say more about this below.

### E8 — Never put marks in an SMS; send a permissioned link

> "**never put marks, attendance figures or a student's full record into an SMS or WhatsApp message. Send a link.**"
> — `OUTREACH-TEMPLATES.md §7`

Right for safeguarding, right for the law, and right practically — SMS in Bengali fragments into multi-part messages and costs more than the link.

### E9 — Undo instead of confirmation dialogs

> "**Bulk header actions:** _Mark all present_ · _Mark all absent_ · _Clear_, each followed by an undo toast. Never a confirmation dialog — undo is faster and less punishing."
> — `DESIGN-SYSTEM.md §5.1`

Correct for a thumb-driven register. A confirm dialog in front of a repeated action is the thing that makes people stop using an app. (Note the tension with R9: I want the undo model _and_ an honest default; they are compatible.)

---

## 3. What they missed

Things that occupy my actual working life and appear nowhere in six documents.

**1. Which of my 12 tuition students has paid me this month.** Covered in R7. This is the single highest-value thing you could build for me and it is a fraction of the machinery you have already specified for schools.

**2. The register is a signed artefact, not a database row.** Every month the attendance register is printed or written up, signed by the class teacher and countersigned by the head, and it is what an inspection looks at. `F-OP-03` renders an attendance register PDF — good — but nothing models the _signature_, the countersignature, or the "this month is closed and locked" state. Without a lock, my October attendance is editable in March, which makes the whole document worthless as evidence and makes me nervous about what someone else might change under my name.

**3. WhatsApp group overload.** My school runs six WhatsApp groups: all-staff, my class's guardians, the exam committee, the cultural programme, the teachers' welfare fund, and the principal's broadcast. `F-OP-05` proposes channels, DMs and announcements — a **seventh** channel, inside an app with no push until R4 (R12). This is not a benefit, it is a tax. The right design is to **write into** WhatsApp, not compete with it: an announcement produces a share-to-WhatsApp link (which `GO-TO-MARKET.md §5.5` already understands for notices) and the app is the _record_, not the _channel_.

**4. Principal surveillance, and the staff-room's collective response to it.** Count the surveillance surfaces this product creates without ever naming them as such: read receipts per channel (`PRODUCT-DECISIONS.md 6.7`), staff self check-in with "geofence optional later" (`2.9`), logged-vs-scheduled variance (`3.8`), attendance edit-window audit, a full append-only audit log visible to owners (`6.8`), and `attendance_scan_events` from gate hardware (`2.1`). Individually each is defensible. Together they are a management system pointed at me, delivered as a teaching tool.

Staff rooms coordinate. If this reads as monitoring, the response will not be individual refusal, it will be collective workaround — check in from the gate for each other, mark attendance from the tea stall, log periods that did not happen. Then your data is worse than paper and you cannot tell. **Write down, explicitly, which teacher data the admin can and cannot see, and show it to the teacher on first run.** Trust that is not stated is not trust.

**5. Salary delays and the payslip that does not exist.** Teachers in southern Bangladesh went two months unpaid in 2025 ([TBS](https://www.tbsnews.net/bangladesh/education/non-mpo-teachers-struggle-years-unpaid-teaching-affect-education-quality)); non-MPO teachers work for years on nothing. The research's own delight list contains the answer:

> "Amar School 5★: '**I can easily see my result and every month Salary paid or not**.' Teachers value seeing _their own_ record, not only entering students'."
> — `VOICE-OF-CUSTOMER.md §6 #10`

`staff_compensation` and `app.staff_hourly_rate` exist (`ROADMAP.md M1 1.6`) — for the **cover-teacher payroll calculation**, admin-visible only. There is no teacher-facing "was I paid this month" view anywhere in Campus v1. You built the salary data and pointed it at the office. A payslip screen I can see would be worth more to me than every AI tool in the plan, and the data is already there.

**6. Coaching-centre side income is politically dangerous to record.** Most of us tutor, some of us tutor our own school's students, and that is officially frowned on. The personal workspace invites me to write my tuition students' names into a platform my employer also uses. `PRODUCT-DECISIONS.md 3.7` says "Personal-workspace resources are untouched" on removal — technically reassuring, invisible to me. The `/personal` area needs a plain Bengali sentence on first open: **"আপনার স্কুল এখানকার কিছুই দেখতে পাবে না"**, and it had better be true in RLS and provable in the pgTAP suite.

**7. Exam invigilation duty rosters and answer-script tracking.** During half-yearly and annual exams the most important sheet in the building is the **কক্ষ পরিদর্শক তালিকা** — who invigilates which room, which period, which day — plus who has which bundle of answer scripts and when marks are due. It is handwritten, photographed and forwarded thirty times. `F-AC-05` models the teaching timetable and `F-AC-06` models exams and marks, and neither models exam duty. This is a three-week period, twice a year, when the app could own the most chaotic artefact in the school, and it is absent.

**8. Guardian calls at 9pm on my personal number.** Guardians have my number because the office gave it to them. `contact_log` records a WhatsApp/phone hand-off after the fact (`PRODUCT-DECISIONS.md 6.7`) — it does not give me a boundary. What I need: guardians message me _in the app_ or through the office, my number is never shown, and I have quiet hours. The plan has quiet hours for **parents** ("no non-urgent push 22:00–07:00", `VOICE-OF-CUSTOMER.md §7 P3`) and none for teachers. Teachers are the ones being called.

**9. Bangla typing on a phone is Ridmik, phonetic, and it fights you.** Ridmik is the most-used Bangladeshi app with ~50M monthly actives ([Ridmik Labs](https://ridmik.com/)). Everything I type in Bengali goes through phonetic input with aggressive prediction. Consequences the design system never addresses: (a) I will often type **Banglish** rather than switch keyboards mid-sentence — accept it, never validate a field as "must be Bengali"; (b) Ridmik's autocorrect mangles student names and school-specific words, so any field holding a name needs correction to be cheap and an edit history; (c) switching between Bengali and the numeric pad for a field like "objectives" costs taps — the `<BnEnText>` component handles _display_ of mixed script, but nothing handles _input_ of it; (d) offer transliteration on the fields I will fight most (report-card comments, behaviour notes), because the alternative is that I type them in English and you have no Bengali content at all.

**10. Data-saver and restricted background data break realtime.** Messaging is specified as "Realtime via Supabase" (`PRODUCT-DECISIONS.md 6.7`). On my phone, background data is restricted for most apps and Chrome's data saver is on, because that is how a weekly pack survives the week. A websocket does not survive doze mode plus restricted background data. Realtime will work in your office and not in my school. Design messaging to be correct on **poll + open-the-app**, and treat realtime as an enhancement.

**11. Shared and inspected phones.** My phone is mine. The deputy head's phone is used by his wife and his son. Several women I work with have husbands who look through their phones. Into that you are putting: children's records, my salary, my document vault, and a flag that says I am looking for another job. You need an **app-level PIN/biometric lock** and **notification previews that never leak** — no "open to work", no marks, no message content on the lock screen. Neither appears anywhere in the design system or the PRD.

**12. The photocopy shop outside the gate is the real printer.** Report cards get printed at the shop on a shared pen drive, on a machine running an ancient PDF reader with no Bengali fonts installed. `ROADMAP.md §7` flags "Bengali PDF rendering issues" and `F-OP-03 P1` proves font embedding — good, and it must be **embedded subset, not linked**, and verified in an old reader, not just in Chrome. Also: the print queue's "browser print/download in v1" assumes I have a PC with a printer. I have a phone and a pen drive. Give me a "save all to one PDF for the shop" action.

**13. "English version" is a third category the ICP never names.** The documents talk about Bangla-medium and English-medium. My school is **English version** — the NCTB national curriculum, in English, with translated textbooks. That is a large and growing segment with its own syllabus, its own board exams and its own report-card format, and it sits exactly where your ICP thinks it is selling. `COMPETITORS.md §6.2` flags curriculum as "a significant finding"; the ICP tables never split it out.

**14. My salary arrives as cash, and payouts cost money to turn into cash.** Covered in R3. Nobody has modelled that ৳340 in bKash is not ৳340 in hand.

**15. January is the only month that matters for hiring and the worst month to onboard software.** Teachers move schools in December–January; that is when portable profiles and job boards matter. It is also admissions season, when the office has 200 new students to enter and no capacity for a migration — which `OUTREACH-TEMPLATES.md §9` correctly uses as a _closing_ argument ("January is the worst time to set up") without noticing it is also the only window when the hiring module has demand.

---

## 4. My adoption story

Told in weeks, honestly, including the parts where I leave.

**Week 0 — the trigger.** Not a job posting (R1) and not an AI feature. It is a **screenshot**. Someone in Bangladesh English Medium Schools Teachers' Association posts a photo of a প্রগতিপত্র in clean Bengali with the caption "পুরো সেকশনের রেজাল্ট ২ মিনিটে" and forty comments asking "কত টাকা?" and "ফ্রি?". I install it that night because it is free and because a real teacher, not a company, posted it. The research is right that the artefact is the channel (`TEACHER-SIDE.md §8`) — it is just wrong about which artefact. It is the report card, not the earnings screenshot.

**Week 1 — first use, and the first exit ramp.** I register. A personal workspace appears. I add my 12 tuition students, because that is the only thing in the app that is _mine_. I look for where to record who has paid. It is not there (R7). Disappointment #1.

I open AI tools. I make a worksheet (4 credits), another (8), a quiz (12), a lesson plan (17), one more worksheet — **blocked** (R4). It is 9:40pm and I have three more worksheets to make for tomorrow, so I open ChatGPT in the next tab and finish there. Disappointment #2, and it is the fatal one.

**This is where most people like me leave — day 2 or 3, not week 6.** Not from a bug. From discovering that the free tier is a sample and the thing I already use is not.

**Weeks 2–4 — what would make it daily.** Only one thing: my principal makes attendance mandatory. Then I open it every morning because I must, the way I open the register. That is not adoption, it is compliance, and it will show up in your "70% of teachers active weekly" metric as a success (R21).

The genuinely voluntary daily habit, if the product existed, would be the **tuition money ledger** — I would open that on the 1st and the 10th of every month for the rest of my life, because it is money and nobody else is tracking it.

**Weeks 5–8 — the moment it either wins or dies: term-end marks.** This is when I find out whether you are serious. If the numeric pad works (E6), if it saves while the wifi drops, if I can do it on the bus, and if the GPA and rank come out matching what the office computes by hand — I become a believer, because entering 45 × 6 marks is two evenings of my life every term and always has been.

If it loses a column, or logs me out mid-entry (the #1 documented pain, E4), or the Bengali in the report card breaks at the photocopy shop — I go back to the Excel file the office sends me, and I never open the app again except for attendance, under duress.

**When I invite a colleague.** The week report cards go out and I did not stay at school until 9pm. That is the screenshot I post, unprompted, with no referral code (R17). I would also invite the other English teacher if — and only if — she could see that the app does not show the principal my lesson-log variance (R13). I would say that part out loud to her, because she would ask.

**What makes me uninstall.** In descending order of likelihood:

1. **A forced re-login on a Sunday morning with 45 children in front of me.** Instant, permanent, and I will tell the staff room. (`VOICE-OF-CUSTOMER.md §5 #1`)
2. **I discover the principal can see my logged-vs-scheduled variance.** I stop logging first, then I stop opening it. (R13)
3. **A guardian confronts me about an AI report-card comment I approved without reading**, and it is wrong about her child, and the log says I approved it. (R8)
4. **The AI limit blocks me on the night I need it**, more than twice. (R4)
5. **The app eats my pack** — a big sync on mobile data in week two of the month, when I have nothing left. (R11)
6. **"Powered by Acadigma" on a প্রগতিপত্র** and the principal asks me why there is an advertisement on it. (R22)

Note what is not on that list: missing features. I will forgive an app for not doing something. I will not forgive it for making me look bad in front of a child's parent or my principal.

---

## 5. Ten changes to the plan, ranked

| #      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Maps to                                                                                                                                         | Why it ranks here                                                                                                                                                                                                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Kill pre-filled-present.** Default the roster to `unmarked`; ship "সবাই উপস্থিত / Mark all present" as one explicit header tap that writes an **audited bulk action** with the teacher's id and shows in the monthly register. Same tap count, honest record. Add a **month-close lock** with class-teacher signature and head countersignature states.                                                                                                                                                                                                                               | `F-AC-03`, D-22, `DESIGN-SYSTEM.md §5.1`, `ROADMAP.md M2 2.4`; register lock in `F-OP-03`                                                       | R9 + §3(2). Every downstream number — 75% eligibility, guardian alerts, at-risk score, the owner dashboard — is computed from this field. A default that fabricates records poisons the entire academic data layer and cannot be fixed later. Cheapest change in this table; highest blast radius.                              |
| **2**  | **Ship a tuition fee ledger in the personal workspace**, not a "session ledger": per-student monthly dues, paid/partial/owing, arrears, a receipt the tutor can send to a guardian on WhatsApp. Reuse `F-CM-08`'s allocation and arrears logic without the gateway.                                                                                                                                                                                                                                                                                                                     | `F-ID-02`/`F-ID-06`, `ROADMAP.md M3 3.8`; logic from `F-CM-08 P1–P6`; replaces `TEACHER-SIDE.md §10 P1 #11`                                     | R7. ~500K tutors (`TEACHER-SIDE.md §3.2`), a documented, _financial_ grievance, and the only feature in the entire plan I would open voluntarily every month. The machinery is already specified for schools; this is a scoped reuse, not new invention.                                                                        |
| **3**  | **Make workload and lesson-log variance teacher-private by default.** Admin sees **scheduled** periods only. Variance is a teacher-facing self-view; sharing it with the admin is an opt-in the teacher controls, per teacher. Raise `workload_thresholds` defaults to 26/32 or force them during onboarding. Publish a plain-Bengali "what your school can and cannot see" page on first run.                                                                                                                                                                                          | `F-TE-06 §4, §5.3`, `PRODUCT-DECISIONS.md 3.8`, `ROADMAP.md M5 5.11`; onboarding disclosure in `F-ID-05`                                        | R13 + R14 + §3(4). If teachers read this as surveillance, `lesson_logs` fills with fiction and `F-TE-02` pacing, `F-TE-06` and all five `F-TE-07` dashboards become confidently wrong. The anti-mock CI grep cannot detect dishonest inputs.                                                                                    |
| **4**  | **Web Push in R1, not R4.** Installed-PWA push on Chrome/Android for messages, announcements and low-attendance alerts, with a delivery ledger and Asia/Dhaka quiet hours **for teachers as well as parents**.                                                                                                                                                                                                                                                                                                                                                                          | `F-ID-07`, `PRD.md §4`/`§5.1`, `PRODUCT-DECISIONS.md 1.11`, `ROADMAP.md M1 1.4` (move from M7)                                                  | R12 + §3(8). Messaging is sold as a daily hook and has no delivery mechanism for four releases. Notification failure is the #3 pain in the whole VOC corpus. Without this, WhatsApp keeps the job permanently and `F-OP-05` is dead weight.                                                                                     |
| **5**  | **Refit the Free AI tier to beat free ChatGPT on one job.** Move from a daily credit reset to a **weekly bucket** (same monthly total). Route **by language risk, not plan tier** — anything Bangla and parent-facing goes to the better model on every plan. Keep the cost cap by limiting _which_ actions Free gets, never by degrading Bangla quality.                                                                                                                                                                                                                               | `F-TE-03 §5.12` + `features/03-teaching/README.md` conflict #5, `PRODUCT-DECISIONS.md 3.3` / `5.1`, `ROADMAP.md M5 5.2`                         | R4 + R5. Teachers' work arrives in bursts, not daily quotas. And `min_plan_tier` currently guarantees the worst Bengali goes to the schools least able to catch the errors — in direct conflict with `TEACHER-SIDE.md §10 P0 #4`.                                                                                               |
| **6**  | **Delete candidate browse.** Hiring becomes apply-only: I apply, only that school sees me, disclosure is per-application, time-limited and revocable — the model you already got right for document requests. `open_to_work` becomes a private preference that surfaces matching jobs _to me_, never me to schools.                                                                                                                                                                                                                                                                     | `F-OP-01`, `PRODUCT-DECISIONS.md 6.1`/`6.2` (reuse `1.15`), `ROADMAP.md M4 4.6`, `COMPETITORS.md §4.2 (5)`                                      | R15. In a city with forty relevant schools whose principals share a WhatsApp group, a browsable availability directory is only safe for the unemployed — which excludes everyone worth hiring. Also removes a PDPA surface.                                                                                                     |
| **7**  | **Fix payouts to match how money moves in Bangladesh.** Auto-payout to bKash/Nagad **weekly** at any balance ≥ ৳300, plus instant-on-request with the fee stated up front. Show the cash-out cost honestly in the earnings screen. Kill "monthly on the 1st".                                                                                                                                                                                                                                                                                                                           | `F-CM-05`, `PRODUCT-DECISIONS.md 4.2`, OQ-15, `ROADMAP.md M6 6.2`                                                                               | R3. The first payout is the retention event and the current design makes it take up to 29 days. Costs a payout-batch cron, not a redesign. Sits behind the M6 pilot gate, so it is cheap to decide now and free if the gate says no-go.                                                                                         |
| **8**  | **No bulk approval on anything a parent will read.** Report-card comments require a per-student edit or a typed sentence before `parent_visible`; the teacher's name appears on the comment; "Approve all" does not exist for parent-facing text. Non-parent-facing AI output can keep one-click approve.                                                                                                                                                                                                                                                                               | `F-OP-03 P4`, `PRODUCT-DECISIONS.md 6.6`, D-28, `TEACHER-SIDE.md §10 P0 #3`                                                                     | R8. Approval is liability transfer onto the teacher. If it is one tap for forty children, it will be one tap, and the first wrong comment about a real child costs you the school.                                                                                                                                              |
| **9**  | **Build the two artefacts that own my working year, and the one that owns my month.** (a) **Exam duty roster** — invigilation assignments per room/period/day and answer-script custody, inside the exams module. (b) **A teacher-facing payslip/salary-status view** from the `staff_compensation` data you already hold.                                                                                                                                                                                                                                                              | (a) `F-AC-05`/`F-AC-06`, `ROADMAP.md M3 3.1`; (b) `F-OP-06 P1–P2`, `ROADMAP.md M1 1.6`                                                          | §3(5) + §3(7). The invigilation roster is the most-photographed sheet on our noticeboard twice a year. "Was I paid this month" is the single highest-value teacher-facing screen available from data already in the schema, in a country where two months unpaid is normal. Both are small; both are things no competitor does. |
| **10** | **Fix the input and privacy layer for a real Bangladeshi phone.** Accept Banglish everywhere and never validate a field as "must be Bengali"; offer transliteration on report comments and behaviour notes; app-level PIN/biometric lock; notification previews that never show marks, messages or job activity; a separate Bengali base type size; self-host a subset Bengali font and test the fallback flash on Android 11. **And rewrite the teacher outreach scripts**: no referral-for-credits, no ৳2,000 principal bounty, no "WhatsApp me your files", group-admin routes only. | `DESIGN-SYSTEM.md §1.6`, `F-ID-01`/`F-ID-02`, `F-ID-07`, `F-OP-01`; scripts in `OUTREACH-TEMPLATES.md §6b/§6c/§8a/§8d`, `GO-TO-MARKET.md §3.5C` | R6 + R17 + R18 + §3(9) + §3(11). Ridmik has ~50M MAU — phonetic Banglish is how Bengali actually gets typed. Shared and inspected phones are normal. And the current teacher scripts will be screenshotted in the exact 43K-member group you are trying to enter.                                                               |

---

**Bottom line.** The research understands Bangladeshi schools better than any competitor document I have seen. It does not yet understand the Bangladeshi _teacher_ as a person with a second job, a principal, a shared reputation, a weekly data pack and no contract. Three decisions — pre-filled-present, admin-visible workload variance, and a metered Free AI tier that loses to free ChatGPT — are each individually enough to make people like me stop. All three are cheap to change now and very expensive to change after a school has a month of data in the system.
