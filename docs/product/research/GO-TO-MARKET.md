# Acadigma Campus — Go-to-Market, Outreach & Growth Playbook

Version 1.0 · 2026-09-17 · Owner: Mahadi (Acadigma) · Status: operating plan, reviewed monthly

Companion documents: `../PRD.md` (release map R0–R4) · `../PRODUCT-DECISIONS.md` (plans, commission, trial) · `../GLOSSARY-EN-BN.md` (the only approved Bengali wording) · `OUTREACH-TEMPLATES.md` (the actual scripts) · `../../plan/ROADMAP.md`.

**How to use this document.** Sections 1–2 are the strategy you memorise. Section 3 is what you do every day. Sections 4–7 are the channels you turn on in order. Sections 8–13 are the operating machinery. Section 11 is the calendar — start there on day 1. Every number in Sources is dated; re-check the funnel benchmarks against your own data after 30 days and overwrite the assumptions.

**The one constraint that shapes everything.** You are one technical founder with a small budget in Bangladesh. That means: no outbound sales team, no paid-media-first strategy, no enterprise RFP chase. Your unfair advantages are (a) you ship product weekly, (b) you speak Bengali and can sit in a principal's office, (c) the incumbents sell ৳50,000+ desktop-era licences with month-long implementations and no phone-first teacher app. Your GTM must convert those three into distribution: **founder-led sales into a tight beachhead, product-led loops that make each school recruit the next, and content that makes you the default Bengali answer to "how do I run my school on a phone."**

---

## 1. ICP and segmentation

### 1.1 Market shape (what actually exists)

| Segment                                                | Rough size                                                                                                                  | Device/ops reality                                                     | Buying behaviour                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **English-medium schools (O/A-level, registered)**     | ~142–148 formally registered as English-medium at secondary level; >1,700 institutions including semi-English and KG chains | Office on Windows, teachers on Android, parents on Messenger           | Fee-paying, budget exists, decide fast (owner decides), want "modern"      |
| **English-medium kindergartens / KG schools**          | ~2,000 institutions, ~450,000 students (Kindergarten Owners Association)                                                    | Often a single office PC + owner's phone                               | Price-sensitive, ৳2,000–5,000/mo is a real decision, owner = accountant    |
| **Bangla-medium private (non-govt) secondary schools** | ~19,000–21,086 secondary schools total, overwhelmingly Bangla-medium                                                        | Paper registers, Excel mark sheets, some have govt-mandated EMIS entry | Managing committee approves spend; slow; board circular compliance matters |
| **Govt primary/secondary**                             | Large but centrally procured                                                                                                | Bound to govt systems                                                  | **Not your market in year 1**                                              |
| **Coaching centres / tutorial homes**                  | Tens of thousands, unregistered, high churn                                                                                 | 100% phone-run                                                         | Buy instantly, churn instantly, low ARPU, but great for marketplace demand |
| **Madrasas (Alia/Qawmi)**                              | Large; Alia madrasas carry EIINs                                                                                            | Similar to Bangla-medium private                                       | Price-sensitive; good for the goodwill/free tier                           |

Context that sets the ceiling and the medium: Bangladesh had ~82.8M internet users (47.0% penetration) at end-2025, Facebook ~74.9M users and Messenger ~71.1M in July 2026, Android at ~95% of mobile OS share, mobile data around ৳33/GB, and bKash alone above 83M customers. A phone-first, Bengali, low-bandwidth product distributed through Facebook and Messenger is not a preference — it is the only shape that fits the country. (Sources §14.)

### 1.2 Tiered ICP — who you sell to, in order

**Tier A — the beachhead (schools 1–20). Sell only to these for the first 90 days.**

> A private English-medium or semi-English school or KG-to-Class-8 school, **150–700 students**, **10–40 teachers**, in **Dhaka** (Mirpur, Uttara, Mohammadpur, Bashundhara, Badda, Dhanmondi fringe) or **Chattogram** (Khulshi, Halishahar, Chandgaon), where **the owner or principal is reachable in one hop** (Facebook page, phone number on the signboard), teachers already run a WhatsApp/Messenger group for each class, and results are produced in Excel today.

Why this shape:

- Under 700 students ⇒ your Starter/Pro limits fit, onboarding is one evening of CSV import, and one person's decision is the whole sale.
- Over 150 students ⇒ the pain is real (10+ sections, report-card week is a crisis) and ৳2,999–7,999/month is trivially justified against one part-time data-entry salary.
- 10–40 teachers ⇒ enough seats for the teacher-side loops (marketplace, personal workspace) to bite; small enough for you to personally train everyone in two sessions.
- Dhaka/Chattogram ⇒ you can physically visit, which is the single highest-converting act available to you.

**Tier B — expand (schools 20–60, months 4–9).** Same profile in **Sylhet** (strong remittance-funded private English-medium demand) and **Rajshahi/Khulna**; plus **Bangla-medium non-govt secondary schools 300–1,200 students** in Dhaka district that already do EMIS data entry. Needs: full Bengali UI proven in production, report card (প্রগতিপত্র) in Bengali confirmed by a real school, and a reseller in each city.

**Tier C — later (months 9–18).** Multi-branch KG chains (need multi-campus — currently `FUTURE.md`), coaching centres (need a lighter SKU), madrasas (free/NGO tier, goodwill + volume for the marketplace), and Enterprise (400+ staff, custom terms).

**Explicit anti-ICP — say no, politely, and write it down:**

- ~~Schools that want fee collection / accounting as the first module~~ — deleted. Fees are now the anchor module; offline fee recording ships in R1 (see §1.5 objection 12). (amended per SYNTHESIS, row F-02)
- Schools demanding **on-premise installation** or "we want to own the server."
- Anyone who opens with "can you make it like [competitor] for ৳20,000 one-time."
- Universities and colleges (different model, different regs).
- Schools outside Dhaka/Chattogram in the first 90 days — no matter how keen. Travel time is your scarcest asset.

### 1.3 Buyer vs user vs champion

| Role                            | Who                                                                                                               | What they care about                                                                | What they must see                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Economic buyer**              | Owner/proprietor (private school), Principal (if empowered), or Managing Committee chair (Bangla-medium non-govt) | Cost vs one salary; "does this make us look modern to parents"; control and audit   | One-page price, a real report card PDF with their logo, "you can see every change anyone made"    |
| **Decision influencer**         | Head of Academics / Vice-Principal / senior class teacher                                                         | Will my teachers actually use it? Will result week get worse before it gets better? | The 60-second attendance demo, and that marks entry looks like their Excel sheet                  |
| **Champion (your real target)** | **The office admin/IT person** _or_ **one enthusiastic class teacher**                                            | Escaping manual work; being the person who fixed it                                 | That you answer their WhatsApp in 10 minutes. Champions are made by responsiveness, not features. |
| **Daily user**                  | Teachers (Android), office staff (Windows)                                                                        | Speed, Bengali, doesn't eat data                                                    | Attendance in under 60s; works on a ৳12,000 phone                                                 |
| **End beneficiary**             | Parents (অভিভাবক)                                                                                                 | Did my child attend? What were the marks?                                           | A clean Bengali notice and a shareable প্রগতিপত্র                                                 |
| **Gatekeeper**                  | Front-desk / peon / the owner's relative who "handles computers"                                                  | Not being bypassed                                                                  | Ask for them by name; give them a role in the pilot                                               |

**Rule: never demo to the owner without the champion in the room, and never onboard without the champion having admin access.** A sale made over the champion's head produces a school that never logs in.

### 1.4 Decision cycle and budget season

The Bangladeshi academic year runs **1 January – 31 December**. Admission circulars for the following year publish around **early November**. That produces a hard, exploitable calendar:

| Window                                                                  | School's state of mind                                                        | Your play                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sep–Oct 2027**                                                        | Annual exams looming; next year's budget being thought about; admission prep  | **Pilot window — shadow mode.** Pilots run alongside the school's existing process, never as the system of record for the November annual exam. "Run your annual exam on Acadigma in parallel, free; if the প্রগতিপত্র comes out clean, start January on a paid plan."                                                                                                                                                                                                                                                                                                                           |
| **Nov–mid Dec 2027**                                                    | Annual exams, results, admissions, chaos                                      | **Prove value, do not sell.** Be present. Generate their report cards alongside their existing process. This is where references are earned.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Late Dec 2027–Jan 2028**                                              | New academic year setup: new sections, promotions, new students, new teachers | **Closing window.** Committee schools sign in January. Target: convert every pilot to paid at the **January 2028 boundary**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Ramadan/Eid closure — 36–40 days, floats ~11 days earlier each year** | School functionally closed for the closure                                    | **Product:** treat the closure as a declared long-holiday mode, not an outage — every school goes to zero recorded attendance at once. **Metric:** health-score decay and churn alerts freeze for the closure's duration (see §9.4/§9.5); WATA is expected to trough, not read as churn. **Billing:** subscriptions keep running through the closure month — fees are still due even when the school is shut — state this explicitly in the contract so it is never discovered mid-closure. Committee schools that signed in January typically set up during this closure and go live mid-March. |
| **Apr–May 2028**                                                        | The first terminal exam under the new calendar                                | **This is the real proof point** — not the Sep–Oct 2027 shadow run. The প্রগতিপত্র claim is proven here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Jun–Aug 2028**                                                        | Half-yearly exams; quieter admin                                              | Second pilot cohort; content and community; Tier B city expansion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

(amended per SYNTHESIS, rows G-01, G-02, G-03 — see `MARKET-STRATEGY.md §i`: R1 needs 149 engineering parts starting 17 Sep 2026, so the Sep–Oct 2026 and January 2027 windows are already gone. The first real window is Sep 2027 pilots → January 2028 close, proven on the April–May 2028 terminal exam.)

**Implication:** the 90-day plan below assumes a launch that puts pilots in the Sep–Dec window and closes in January. If you start at a different point in the year, shift the calendar but keep the shape: _pilot through an exam cycle → close at a year boundary._

Sales-cycle length to plan against (assume until measured): **first contact → demo 3–10 days; demo → pilot start 7–21 days; pilot → paid 30–60 days (or "at the January boundary," whichever is later).** Median Tier A cycle: **~6 weeks**. Anything faster is a coaching centre; anything slower than 10 weeks is a committee school — deprioritise.

### 1.5 The 14 objections, and the answers

Answer format: **acknowledge → reframe → proof → next micro-commitment.** Never argue. Full Bengali/English phrasings live in `OUTREACH-TEMPLATES.md §9`.

| #   | Objection (as actually said)                                                 | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | "আমাদের তো সফটওয়্যার আছে / We already have software."                       | "Good — who uses it daily? If it's the office only, the teachers are still on paper and WhatsApp. Acadigma is the teacher's phone app that feeds the office. Keep your existing system for accounts; run attendance and results here for one month and compare." Proof: attendance demo. Ask: one section, one month.                                                                                                                                        |
| 2   | "Too expensive."                                                             | "Compare against the person who types marks into Excel for two weeks every term. ৳2,999/month is about one day of that salary. And Free is genuinely free — start there, pay only when you need report cards and print." Proof: price sheet with the Free column bolded.                                                                                                                                                                                     |
| 3   | "Our teachers aren't tech-literate."                                         | "They already use Facebook and bKash. If a teacher can send a Messenger voice note, she can take হাজিরা. Watch —" [do the 60-second demo on your phone, then hand your phone to the _youngest_ class teacher present and let _her_ do it — or, if that still reads as a test in front of her principal, offer a **private trial after the meeting** instead]. **Never demo a teacher's competence to her employer.** (amended per SYNTHESIS, row G-15)       |
| 4   | "We have no internet / data is expensive."                                   | "It's built for a ৳12,000 Android on mobile data — the app shell is cached, attendance saves in under a second, and attendance works offline and syncs when signal returns. A teacher's whole month costs a few taka of data." Proof: open it on 3G in front of them.                                                                                                                                                                                        |
| 5   | "Is our students' data safe? Where is it?"                                   | "Every table is locked so one school can never see another's data — that's tested automatically on every release, and we ran an independent security test before launch. Every change is logged and you, the owner, can see who changed what. We follow the Personal Data Protection Act 2026 (Act 63 of 2026), including parental consent for children's data, and we never advertise to minors." Proof: one-page security sheet + the audit log on screen. |
| 6   | "What if you shut down? / Who are you?"                                      | "Fair. Three things: you can export everything — students, marks, attendance — to Excel any time, it's your data; the Free plan means you're never locked out of your own records; and here are [N] schools running it now, call them." Never oversell company size — solo-founder honesty converts better with school owners than fake corporate.                                                                                                           |
| 7   | "Send me a proposal, I'll discuss with the committee."                       | "I'll send a one-pager tonight. Committees approve what they've seen work — can I set up one section free before the meeting so you have a real screen to show them?" Convert paper into a pilot.                                                                                                                                                                                                                                                            |
| 8   | "Can you customise X for us?"                                                | "Tell me the outcome you need. Most 'customisation' requests are settings we already have — grade scale, working days, report-card branding, custom titles like অধ্যক্ষ. If it's genuinely new and other schools need it too, it goes on the roadmap and you get it free. We don't build one-off forks."                                                                                                                                                     |
| 9   | "Our report card format is unique."                                          | "Show me. We'll match the header, logo, subject list, grade scale and comments. Give me your current প্রগতিপত্র and I'll send back a generated one with your school's branding by tomorrow." **This is your highest-leverage single deliverable — do it within 24 hours, every time.**                                                                                                                                                                       |
| 10  | "Parents won't use an app."                                                  | "They don't have to install anything to start — you send notices and results as a WhatsApp/Messenger link with your school's name on it. Parents who want more can log in. Adoption grows because parents ask for it."                                                                                                                                                                                                                                       |
| 11  | "We'll start next year."                                                     | "Perfect — that's exactly why we should start _now_, free, on one section. Setting up in January when you're admitting 200 students is the worst possible time. Do the setup in the quiet weeks and January is one click."                                                                                                                                                                                                                                   |
| 12  | "Does it do fee collection?"                                                 | Tell the truth, and it's better news than it used to be: "Yes — offline fee recording is in this version: fee structures, invoices, receipts, arrears and a defaulter list. Online bKash/card collection is coming next, in R1.5 — if online collection specifically is what you need today, I'd rather give you the real date than promise it now." Honesty here buys the next three referrals. (amended per SYNTHESIS, rows F-01, F-02)                    |
| 13  | "Do you take a cut of what we pay teachers / is the marketplace compulsory?" | "The marketplace is optional and separate. Teachers who sell materials keep 70%; we take 30% and handle payment, delivery and piracy protection. Your school pays nothing for it."                                                                                                                                                                                                                                                                           |
| 14  | "Can we get it free?" (madrasa/NGO/very small school)                        | "Yes — genuinely. Free plan, 5 teachers, 150 students. And if you're a madrasa or an NGO school, ask me about the sponsored Starter plan." (§8.5)                                                                                                                                                                                                                                                                                                            |

---

## 2. Positioning and messaging

### 2.1 The one-liner

> **English:** _Acadigma Campus is the school that runs from your teacher's phone — attendance, marks, report cards and parent notices, in Bangla, on any Android._
>
> **বাংলা:** _অ্যাকাডিগমা ক্যাম্পাস — আপনার স্কুল এখন শিক্ষকের ফোনেই। হাজিরা, নম্বর, প্রগতিপত্র আর অভিভাবকের বিজ্ঞপ্তি — সবই বাংলায়, যেকোনো অ্যান্ড্রয়েডে।_

Positioning statement (internal, not copy):

> For **owners of private K-12 schools in Bangladesh** who are **running the school day on paper registers, Excel mark sheets and WhatsApp groups**, Acadigma Campus is **the school operating system** that **puts every daily job — হাজিরা, নম্বর, প্রগতিপত্র, বিজ্ঞপ্তি — on the teacher's Android phone and the office's Windows PC in one place**. Unlike **desktop-era school ERPs sold as ৳50,000+ one-time licences with month-long implementations**, Acadigma is **live the same week, priced per month, in Bengali, and fast on a cheap phone — and it pays teachers back through a marketplace for their own materials.**

**Category we claim:** _School OS_ (স্কুল ওএস) — not "school ERP", not "school management software". You will still _rank_ for "school management software Bangladesh" (§4.8), but in the room you say "your school's operating system," because ERP means "expensive, slow, IT project" to a principal who has been burned.

### 2.2 Three value props per persona

**Owner / Principal (মালিক / অধ্যক্ষ)**

1. **See the whole school before your first cup of tea.** One screen: who's present, which teachers haven't marked হাজিরা, which classes are behind syllabus. _Proof to build: a Monday-morning screenshot from a real school._
2. **Report-card week stops being a crisis.** A whole section's প্রগতিপত্র in under two minutes, with your logo, your grade scale, your comments — no re-typing, no formatting. _Proof: before/after timing from a pilot school._
3. **Nothing happens in your school that you can't see.** Every change is logged with a name and a time, roles are enforced, and one school can never see another's data. _Proof: audit log screenshot + the pentest summary._

**Teacher (শিক্ষক)**

1. **হাজিরা in under a minute, with one thumb.** No register, no ticking after school. _Proof: a 45-second phone-screen video of a 40-student section._
2. **The work you already do, saved and reusable.** Lesson plans, worksheets, question papers — created with AI help, stored with your name on them, and carried with you if you change schools (your CV and materials are yours).
3. **Get paid for what you make.** List your materials in the marketplace; you keep 70%; we handle payment, delivery and watermarking. _Proof: first seller's payout screenshot with permission._

**Parent (অভিভাবক)**

1. **Know the same day, not at the end of term.** Attendance, marks, homework and notices for your own child — and only your child.
2. **In Bangla, on the phone you already have.** No app to install to read a notice; log in when you want the full picture.
3. **One place instead of five WhatsApp groups.** Official notices from the school, not forwarded screenshots.

### 2.3 Proof points to build (and the order to build them in)

You currently have zero proof. These are the assets that replace it, in build order:

| #   | Asset                                                                                                     | Format                                                                               | When                               |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| 1   | **60-second attendance video** (real phone, real 40-student section, timer on screen, Bengali voice-over) | Vertical MP4 ≤60s, subtitled                                                         | Before first outreach              |
| 2   | **Their-logo report card, in 24 hours**                                                                   | PDF generated from a school's own format                                             | On demand, every prospect          |
| 3   | **Pilot school case study #1**                                                                            | 1 page, see template below                                                           | End of first pilot month           |
| 4   | **"Result week: 3 days → 2 hours"** timing study                                                          | Chart + quote                                                                        | After first exam cycle on-platform |
| 5   | **Security one-pager**                                                                                    | PDF: RLS/tenant isolation, audit, PDPA 2026 (Act 63 of 2026) alignment, pentest date | Before first paid school           |
| 6   | **First teacher payout screenshot**                                                                       | Image + quote                                                                        | R3                                 |
| 7   | **Reference call list**                                                                                   | 3 owners who will take a phone call                                                  | Month 3                            |

**Case study format (one page, Bengali + English side, always this shape):**

```
[School logo]  [School name], [Area, City]
Students: N · Teachers: N · Medium: English/Bangla · On Acadigma since: [Month Year]

BEFORE — কী অবস্থা ছিল
  3 sentences. Concrete: "12 sections, attendance on paper, marks in 9 Excel files,
  report cards took 3 days of two people's time."

WHAT CHANGED — কী বদলালো
  3 bullets, each with a number:
  - Attendance marked in 48s per section (was ~6 min + evening copying)
  - 214 report cards generated in 1m 50s (was 3 days)
  - Parent notices: 1 message, 214 guardians, 0 forwarded screenshots

IN THEIR WORDS — অধ্যক্ষের কথা
  One quote, <=40 words, from the named owner/principal, with photo and permission.

THE NUMBERS — ফলাফল
  Weekly active teachers: N/N (x%) · Attendance completeness: x% · Plan: Starter/Pro

[QR to 14-day trial]  acadigma.com/campus
```

Rule: **never publish a case study without a number and a named human.** Anonymous "a school in Dhaka" proof converts nothing in this market.

### 2.4 Module naming — Bengali/English

Use the `GLOSSARY-EN-BN.md` wording without exception; marketing copy and product UI must match or trust breaks. The navigation-level names:

| Module              | Bengali (UI)         | Marketing shorthand (BN) | Note                                                  |
| ------------------- | -------------------- | ------------------------ | ----------------------------------------------------- |
| Attendance          | উপস্থিতি / হাজিরা    | **হাজিরা**               | Use হাজিরা in all marketing — it's what teachers say  |
| Timetable           | রুটিন                | **রুটিন**                | Never সময়সূচি in ads                                 |
| Exams & marks       | পরীক্ষা ও নম্বর      | **নম্বর তালিকা**         |                                                       |
| Report card         | প্রগতিপত্র           | **প্রগতিপত্র**           | Never "রিপোর্ট কার্ড" in print or ads                 |
| Mark sheet          | নম্বরপত্র            | নম্বরপত্র                |                                                       |
| Parent portal       | অভিভাবক পোর্টাল      | **অভিভাবক কর্নার**       | "কর্নার" reads friendlier in parent-facing copy       |
| Messaging / notices | বার্তা ও বিজ্ঞপ্তি   | **বিজ্ঞপ্তি**            |                                                       |
| Lesson planner      | পাঠ পরিকল্পনা        | পাঠ পরিকল্পনা            | AI framed as সহায়ক ("assistant"), never "AI teacher" |
| Marketplace         | শিক্ষা উপকরণের বাজার | **শিক্ষক বাজার**         | "Teachers' market" — warmer than মার্কেটপ্লেস         |
| Hiring              | নিয়োগ               | **শিক্ষক নিয়োগ**        |                                                       |
| Print queue         | প্রিন্ট সারি         | প্রিন্ট                  |                                                       |

Product name is always **Acadigma Campus / অ্যাকাডিগমা ক্যাম্পাস** — never translated, never abbreviated to "Campus" alone in public copy.

### 2.5 Tone

**Voice: a competent colleague, not a vendor.** Four rules, applied to every asset:

1. **Plain, respectful Bengali — আপনি form, always.** Never তুমি to a teacher or parent. No English sentence structure wearing Bengali words. Read every line aloud; if a teacher wouldn't say it, rewrite it.
2. **Lead with the job, not the technology.** "হাজিরা এক মিনিটে" beats "cloud-based AI-powered platform". Say "AI" only where it does a specific job ("পাঠ পরিকল্পনা তৈরিতে সহায়তা").
3. **Numbers or nothing.** 60 seconds. 2 minutes. 70%. 14 days. Vague superlatives ("best", "world-class", "revolutionary") are banned — they are exactly what the incumbents write, and school owners have learned to discount them.
4. **Never denigrate a competitor or a teacher's current method.** The paper register worked for 40 years. You are not replacing their judgement; you are saving their evenings.

Banned words in all Acadigma copy: _revolutionary, world-class, seamless, cutting-edge, one-stop solution, disrupt, best-in-class, 360°_. Banned Bengali: বিপ্লব, সর্বাধুনিক as filler adjectives.

---

## 3. Outreach playbook (founder-led sales)

### 3.1 List-building — where the names come from

Target: a clean, de-duplicated **working list of 400 Tier A schools** in Dhaka + Chattogram before week 1 ends. Sources, in order of value:

| Source                                                                  | What you get                                                           | Ethics / method                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BANBEIS EIIN directory** (banbeis.gov.bd) + mirrors                   | Institution name, EIIN, district/thana, type, often phone              | Public government data, published for exactly this kind of lookup. Download the spreadsheets; filter to non-govt secondary in your target thanas. **Note: EIIN covers secondary/madrasa/college — most English-medium KGs have no EIIN**, so this misses a big slice of Tier A. |
| **Facebook Pages search**                                               | Page, phone, address, Messenger inbox, _and the owner's posting style_ | Search "স্কুল [thana name]", "school Mirpur", "English medium Uttara". Highest-quality source for Tier A because a school with an active page has a decision-maker who is already online. Record the page admin's response speed.                                               |
| **Facebook Groups** (school-owner, teacher, principal, KG-owner groups) | Real names and real complaints                                         | Join, read for two weeks, never pitch in-group before contributing. See §7.1.                                                                                                                                                                                                   |
| **Google Maps / Places**                                                | Name, address, phone, rating, photos                                   | Manual collection or the official **Places API within its Terms of Service**. **Do not scrape Google's result pages** — it breaches their terms and gets you blocked. Budget a small API spend or collect manually by thana; 400 records is two evenings of honest work.        |
| **Kindergarten owners' associations & school federations**              | Member lists, event access                                             | Approach as a partner, not a scraper (§4.5). This is the fastest route to the ~2,000 English-medium KGs.                                                                                                                                                                        |
| **Admission-season lists (Nov–Dec)**                                    | Schools actively admitting                                             | Pairs with the season play in §1.4                                                                                                                                                                                                                                              |
| **Signboards**                                                          | The unlisted long tail                                                 | One afternoon per thana, phone camera, 30–60 schools. Unglamorous and it works.                                                                                                                                                                                                 |
| **Teacher groups & your own network**                                   | Warm intros — worth 10× cold                                           | Every teacher you help is a route to their principal                                                                                                                                                                                                                            |

**Ethics line (write it into your CRM notes):** use public data for _identification and first contact only_; never buy lists of parent or student data; never mass-email addresses harvested without consent; honour "don't contact me" permanently on first request; identify yourself as Acadigma in the first sentence of every message. Under the **Personal Data Protection Act 2026 (Act 63 of 2026)** you are additionally on notice that children's data requires parental consent and that targeted advertising to minors is prohibited — so **no ad targeting of under-18s, ever**, and no prospecting database that contains a student's name. (amended per SYNTHESIS, row C-01)

**The list schema** (one Google Sheet; upgrade to a real CRM only after 100 rows):

`school_name | eiin | area | city | type(EM/BM/KG/coaching) | est_students | est_teachers | fb_page | phone | owner_name | champion_name | source | stage | last_touch | next_action | next_action_date | notes`

Stages: `new → contacted → replied → demo_booked → demo_done → pilot → paid → lost(reason)`. **`next_action_date` is the only field that matters daily** — your morning is whatever is due today.

### 3.2 Channel sequence per prospect

Messenger is the primary channel: Facebook has ~74.9M users in Bangladesh and Messenger ~71.1M, and schools answer their page inbox faster than any email. Email is a _document delivery_ channel here, not a prospecting one.

**The 5-touch sequence over 12 days** (stop immediately on reply or on any "no"):

| Day | Channel                                     | Purpose                                                                                                         | Template                   |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 0   | **Messenger to the school Page** (Bengali)  | Get a reply, not a meeting. One question.                                                                       | `OUTREACH-TEMPLATES.md §1` |
| 2   | **Phone call** (if number known)            | Ask for the right person by name; 90 seconds                                                                    | `§3`                       |
| 4   | **WhatsApp** (if you got a personal number) | Send the 60-second attendance video                                                                             | `§2`                       |
| 7   | **The 24-hour report card**                 | Offer to rebuild _their_ প্রগতিপত্র free                                                                        | `§2b`                      |
| 12  | **Polite close-out**                        | "I'll stop here — message me any time." Leaves the door open; this message gets a surprising number of replies. | `§1c`                      |

Rules: never send two messages before a reply on the same day; always Bengali first unless the school's own page posts in English; always one question per message; never a price in the first message; never a wall of features.

### 3.3 The 15-minute phone demo

Screen-shared demos are unreliable on BD mobile data. The default is a **phone call + you sharing your screen over Messenger video, or a physical visit.** Structure, timed:

| Time        | What                                                                                                                                                                                                          | Script cue                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 0:00–2:00   | **Their world, not yours.** "How do your teachers take হাজিরা today? Who types the marks? How long did last term's প্রগতিপত্র take?" Write the numbers down and repeat them back.                             | Do not open the product yet                                     |
| 2:00–3:00   | **The 60-second attendance moment.** "I'll show you one thing. Watch the clock." Open a section of 40, mark absentees with one thumb, save. Say the elapsed time out loud.                                    | This is the demo. Everything else is support.                   |
| 3:00–6:00   | **Marks → প্রগতিপত্র.** Enter a few marks in the grid, then generate a whole section's report cards and open the PDF **with their school's name and logo already on it** (you prepared this before the call). | The "their logo" moment is what they remember                   |
| 6:00–9:00   | **Parent side.** Show the parent view of one student; send a notice; show the WhatsApp share of the notice carrying the school's name.                                                                        | Owners sell this to parents                                     |
| 9:00–11:00  | **Owner's dashboard + audit.** Attendance completeness by teacher; who changed what.                                                                                                                          | Answers control and trust objections                            |
| 11:00–13:00 | **Price, plainly, once.** Free / ৳2,999 / ৳7,999 / Enterprise, 14-day Pro trial, no card. Say the numbers, then stop talking.                                                                                 | Silence after a price is a tool                                 |
| 13:00–15:00 | **One micro-commitment.** "Give me one section and one teacher for two weeks. I'll set it up myself Thursday evening. If হাজিরা isn't faster than the register by day three, we stop."                        | Book the date on the call. Never end without a dated next step. |

Demo hygiene: seed the demo workspace with a realistic BD school (Bengali names, Class 6–ক, Bangla subjects, BD grade scale A+…F/GPA 5.00) — never `Student 1, Student 2`. Charge your phone. Test on mobile data, not office wifi. Have the PDF pre-generated as a fallback if the network dies.

### 3.4 The pilot offer (the core of the whole motion)

**"এক শাখা, দুই সপ্তাহ" — One section, two weeks, free, I set it up.**

| Element                                                | Spec                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**                                              | 1–3 sections, 1 class teacher + 1 admin. Not the whole school.                                                                                                                                                                                      |
| **Duration**                                           | 14 days, aligned to the 14-day Pro trial, extendable once to cover an exam cycle                                                                                                                                                                    |
| **Price**                                              | ৳0. No card. No contract.                                                                                                                                                                                                                           |
| **What you do**                                        | Personally: create the workspace, import the student CSV, set the grade scale and working days (Sat–Thu), upload the logo, configure the প্রগতিপত্র, run one 30-minute training with the teachers, and be in their WhatsApp group for the fortnight |
| **What they do**                                       | Take হাজিরা daily on the phone. That's the only obligation.                                                                                                                                                                                         |
| **Success criteria (agreed in writing, before day 1)** | (1) attendance marked >=80% of school days (2) at least one প্রগতিপত্র or নম্বরপত্র generated (3) the class teacher says it's faster than the register                                                                                              |
| **The close**                                          | Booked at pilot start, on the calendar: _"On day 15 we sit for 20 minutes. If all three are met, you start Starter/Pro from [date]. If not, I'll ask you why and fix it — no charge either way."_                                                   |
| **Expansion trigger**                                  | Met criteria → "let's do the other 9 sections this week, same setup, free" → then the paid plan covers the whole school                                                                                                                             |

**Why a written success criterion matters:** it converts "we'll see" into a decision with a date, and it gives you a real reason to walk away from a school that was never going to use it — which protects the only resource you cannot buy more of (your weeks).

**Sweeteners you may offer, in escalating order (never all at once):**

1. Free setup + data import (always included — it costs you an evening and removes the biggest real barrier).
2. Founding-school pricing: **first 10 schools lock their price for 24 months** and are named on the site (with permission).
3. Annual prepay: **2 months free** (pay 10, get 12 — already the plan convention in `PRODUCT-DECISIONS.md §5.1`).
4. Case-study discount: 20% off year one in exchange for a filmed testimonial and a reference call commitment.
5. **Never** discount below Starter for a school over 300 students. Free-tier abuse is fine; discounted-Pro precedent is not.

### 3.5 Referral incentives

Referrals are the whole game in a market this relationship-dense. Three programmes, all mechanised in-product (§5.7):

**A. School → School (principal to principal).** The referring school gets **one month free** (credited to their subscription) when the referred school reaches its 2nd paid month; the new school gets **their second month free**. Both sides benefit — never one-sided. Ask at exactly one moment: **the day their first bulk প্রগতিপত্র batch succeeds.** That is the peak-emotion moment; the ask is `OUTREACH-TEMPLATES.md §6`.

**B. Teacher → Teacher.** Every teacher gets a referral code. Another teacher who signs up for a personal workspace (free) gets **+200 AI credits**; the referrer gets **+200 credits** when the new teacher completes a real action (logs attendance or creates a lesson plan). Credits are your cheapest currency — they cost you model spend, not cash, and they drive exactly the behaviour you want. Cap at 10 successful referrals/month per teacher to blunt gaming.

**C. Teacher → her School (the pull-through).** A teacher on a personal workspace invites her principal, using the pre-written forward message and one-page PDF from §5.2 — that mechanic is unchanged. **The ৳2,000 bKash cash bounty to the teacher is deleted** (amended per SYNTHESIS, row G-12): paying an individual teacher cash to deliver her own employer reads badly and invites the wrong incentive. If a reward is paid at all, it is a **referral credit to the school she brought in**, not cash to her personally. This remains the single most valuable referral type — it turns your free tier into a sales channel — even though it no longer pays cash to an individual.

**Ambassador tier (§7.5)** sits on top for the top 20 teacher referrers.

**Anti-gaming rules:** referral rewards vest only on the _referred_ party's real activity (paid month, or a real product action), never on signup; one reward per referred workspace ever; self-referral and same-phone-number referrals void; all referral credits appear in the audit log.

### 3.6 First 10 schools in 90 days — weekly cadence and metrics

**The funnel arithmetic.** Work backwards from 10 paid schools. Assume (and then correct with your own data):

| Stage            | Conversion assumption                                         | Volume needed             |
| ---------------- | ------------------------------------------------------------- | ------------------------- |
| Paid schools     | —                                                             | **10**                    |
| Pilots → paid    | 50% (you personally run them; be ruthless about who gets one) | **20 pilots**             |
| Demos → pilot    | 40%                                                           | **50 demos**              |
| Replies → demo   | 50%                                                           | **100 replies**           |
| Contacts → reply | 25% (Messenger to a school page, Bengali, one question)       | **400 contacted schools** |

So: **400 contacts → 100 replies → 50 demos → 20 pilots → 10 paid, over 13 weeks.** That is ~31 new contacts, ~4 demos and ~1.5 pilots per week. All of it is doable by one person _only if_ the list is built up front and you protect the mornings.

**Amendment (per SYNTHESIS, rows G-04, G-06):** the 25% cold-Messenger reply rate above is an assumption carried over from the old calendar — **test it on a cohort of 60 schools before planning the rest of this funnel on it.** And the ultimate target this funnel was built to hit is no longer "10 in 90 days" or the 110-schools-by-month-12 figure implied elsewhere in this document (§11.3): under the real calendar (§1.4) and a founder-days-honest read of onboarding capacity, the replacement target is **18–25 paid schools by January 2028.**

**The weekly operating rhythm (non-negotiable shape):**

| Day         | Block       | Activity                                                                                                                 |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Sat**     | 09:00–12:00 | **Outreach block.** 40 new Messenger contacts + all follow-ups due today. No exceptions, no product work.                |
| **Sat**     | 14:00–18:00 | Demos and school visits (schools are open; owners are in)                                                                |
| **Sun**     | 09:00–12:00 | Outreach block (follow-ups + 20 new)                                                                                     |
| **Sun**     | 14:00–18:00 | Pilot onboarding / training sessions                                                                                     |
| **Mon–Wed** | Full days   | **Build.** Ship the release map. Protect this or the product dies.                                                       |
| **Mon–Wed** | 20:00–21:00 | WhatsApp support hour (§9.2) + answer every pilot message                                                                |
| **Thu**     | 09:00–13:00 | Demos + pilot day-15 reviews                                                                                             |
| **Thu**     | 15:00–17:00 | **Content block.** One Bengali video + one post + one newsletter (§7.2)                                                  |
| **Thu**     | 17:00–18:00 | **Scorecard + pipeline review** (§10.3). Update every `next_action_date`.                                                |
| **Fri**     | —           | Rest. (Fri is the weekend; schools are shut. Do not send outreach on Friday — it reads as desperate and converts worst.) |

**Weekly targets, weeks 1–13:**

| Metric                                   | Weekly target     | Cumulative at week 13 |
| ---------------------------------------- | ----------------- | --------------------- |
| New schools contacted                    | 31                | 400                   |
| Replies                                  | 8                 | 100                   |
| Demos delivered                          | 4                 | 50                    |
| Pilots started                           | 1.5               | 20                    |
| Pilots converted to paid                 | — (starts week 6) | 10                    |
| Teachers signed up (personal workspaces) | 15                | 200                   |
| Bengali content pieces published         | 2                 | 26                    |

**Escalation rules — what to change when a number misses two weeks running:**

- _Contacts short_ → the list is the bottleneck. Spend a full Saturday on list-building only.
- _Reply rate < 15%_ → the first message is wrong. Rewrite the opener, A/B two versions across the next 60 contacts.
- _Demo → pilot < 25%_ → you are demoing features, not the 60-second moment, or you're demoing to non-buyers. Re-read §3.3 and qualify harder.
- _Pilot → paid < 35%_ → the pilot lacked written success criteria or you weren't present during it. Cut pilot count, raise pilot quality.
- _Any pilot with < 50% attendance completeness in week 1_ → that's a dead pilot. Intervene on day 3, not day 14.

---

## 4. Channels

Turn these on in order. Do not open channel N+1 until channel N has a number attached to it.

### 4.1 Facebook — groups, page, ads

Facebook is not _a_ channel in Bangladesh; for this ICP it is _the_ channel (~74.9M users, ~95% daily login rate among users, Messenger ~71.1M). Three distinct plays:

**(a) Groups — free, highest ROI, slowest to compound.** Target group types: school-owner and KG-owner groups, principal/head-teacher groups, subject-teacher groups (English teachers BD, Math teachers BD…), education-job groups, exam/result discussion groups, and district-level teacher groups. Method: join 25–40, read for 2 weeks, then **answer questions with substance and no link for 30 days** before ever mentioning Acadigma. Post format that works: a Bengali how-to with a screenshot, ending with a free template download. Budget: ৳0, ~5 hrs/week. Expected: 3–8 inbound teacher signups/week by week 6, 1–2 school conversations/week by week 10.

**(b) Page — your credibility check.** Every prospect will look at your page before replying. It must show: 3+ posts/week, real screenshots, real Bengali, a pinned 60-second attendance video, response time badge "typically replies instantly," and a Messenger greeting that starts the qualification. Treat page response time as a support SLA (§9.2) — it is visible to prospects.

**(c) Ads — only after organic proves the message.** Benchmarks to plan against: BD CPM ranges roughly ৳85 (consumer FMCG) to **৳280 for SaaS/B2B**, CPC roughly **৳5–20**; CPMs spike 2–3× around Eid — **pause spend during both Eids.**

| Band         | Monthly spend | Campaign shape                                                                                                                                                                  | Realistic expectation                                                                                                 |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **৳0**       | —             | Groups + page only                                                                                                                                                              | 3–8 teacher signups/wk organic                                                                                        |
| **৳5,000**   | ৳170/day      | One campaign: video views on the 60s attendance video, Dhaka+Ctg, interests: teacher/school/education, age 25–55                                                                | ~20–50k impressions; ~10–25 Messenger conversations; **CPL ৳200–500** on a "message us" objective                     |
| **৳20,000**  | ৳670/day      | Two campaigns: (i) Messenger-conversation ads to school owners (ii) lead-magnet download (template pack) to teachers. 3 creatives each, kill anything under 1% CTR after ৳2,000 | 40–100 teacher leads + 15–40 school conversations; blended **CPL ৳250–600**; expect **school-level CPL ৳1,500–4,000** |
| **৳50,000+** | ৳1,700/day    | Add retargeting (page/video viewers, site visitors), lookalike from your paid-school list, city expansion                                                                       | School CPL should fall toward ৳1,200–2,500 with retargeting; only spend here once pilot→paid ≥ 40%                    |

**Ad rules for this product:** never optimise for link clicks (optimise for _Messenger conversations started_ — that's the native BD behaviour); never run an ad that can serve to under-18s (PDPA 2026 / Act 63 of 2026 prohibits targeted advertising to minors — set age 22+ and exclude interest clusters that skew young); always Bengali; always a face or a phone screen in the first second; always a price or the word "ফ্রি" in the creative (unqualified leads are the expensive kind).

**Kill criteria:** if a campaign's cost per Messenger conversation exceeds ৳600 after ৳5,000 spent, kill the creative not the campaign. If _every_ creative fails, the offer is wrong — go back to §2.

### 4.2 YouTube and TikTok — Bangla tutorials

YouTube has ~24M users in Bangladesh with very high daily usage; TikTok is large and skews young (better for teacher-persona reach than principal reach). Both are **search-and-trust assets more than acquisition channels** — but a Bengali "how to make প্রগতিপত্র" video ranks and keeps ranking.

- **Format A — 60–90s vertical (TikTok, FB Reels, YouTube Shorts), 2/week.** One job per video, phone screen recording, big Bengali captions (most viewing is sound-off), your face for 3 seconds at the start. Topics: "৪০ জনের হাজিরা ৫০ সেকেন্ডে", "প্রগতিপত্র ২ মিনিটে", "রুটিনে সংঘর্ষ ধরবেন কীভাবে".
- **Format B — 5–8 min YouTube tutorial, 1/week.** Titled as a search query in Bengali _and_ English ("স্কুলের হাজিরা সফটওয়্যার — কীভাবে শুরু করবেন | School attendance software Bangladesh"). These become your onboarding library (§9.3) — every support answer you record once is a support ticket you never take again.
- **Production budget: ৳0.** Phone + free editor + a ৳500 lapel mic. Do not buy production until a video has earned a signup.
- **Metric:** signups attributed to video (UTM'd link in description + "video" source in your CRM), and support-tickets-deflected.

### 4.3 Teacher communities and training institutes

There are **99 teacher-training colleges (14 public, 85 private)** plus **NAEM**, which trains heads of secondary schools and college principals, and **NAPE** for primary. NAEM is uniquely valuable: _it is a room full of your economic buyers, at government expense._

Plays, in order of difficulty:

1. **Free training for a TTC's B.Ed cohort** — "Digital tools for the modern classroom", 90 minutes, no pitch, Acadigma used as the demo tool throughout. Every trainee leaves with a free personal workspace. This is how you get to 500 teachers without ad spend.
2. **A guest session at a NAEM / district education-officer training** — requires an introduction; pursue through a friendly principal who has attended one. Payload: a Bengali handout on "what a school should ask before buying software" (genuinely neutral, with a short Acadigma section at the back).
3. **BRAC and large NGO education programmes** — long sales cycles, but a single partnership covers hundreds of schools. Approach with the **free-for-NGO-schools offer** (§8.5) as the opener, not a licence quote.
4. **Private B.Ed / teacher-certification institutes** — these are commercial and fast-moving; offer them a co-branded module and revenue share on marketplace sales to their alumni (§6.1).

### 4.4 Education fairs and school events

The large Dhaka fairs (e.g. the Bangladesh International Education Expo at ICCB) are **study-abroad focused — your buyers are not the exhibitors, they're not even in the building.** Do not buy a stall.

Go instead to:

- **School annual prize-givings, sports days and parents' days** at your pilot schools. You are a guest of the principal; you meet three other principals per event.
- **KG-owners' association AGMs and district private-school federation meetings.** This is where 50 Tier A buyers sit in one room. Getting on the agenda costs a relationship, not money.
- **ICT/EdTech meetups, BASIS events, startup demo days** — useful for partnerships and hiring, not for school sales. One per quarter, maximum.
- **Your own event beats all of them:** a free Saturday "প্রগতিপত্র ও ফলাফল কর্মশালা" (report card & results workshop) for 20 principals in a borrowed school hall. Cost: tea and photocopies. Conversion: far above any fair stall.

### 4.5 Board, association and institutional partnerships

- **Kindergarten owners' associations** (national and district) — the fastest route to the ~2,000 English-medium KGs and ~450,000 students. Offer: a member rate (10–15% off, never more), a free workshop at their AGM, and a co-branded landing page. Ask for: the member list and an endorsement email.
- **District private-school federations / non-govt teachers' associations** — same structure. These bodies value _training delivered to members_ far above a sponsorship cheque.
- **Education boards / DSHE** — do **not** chase government procurement in year 1. What you _should_ do is track board circulars (dshe.gov.bd, banbeis.gov.bd, board sites) and **ship compliance features fast when a circular lands** (e.g. a new EMIS field, a changed grade rule, a mandated report format). "Acadigma updated it the same week the circular came out" is the most powerful word-of-mouth available in this market, and it costs one afternoon of engineering.
- **Publishers / guide-book houses** — they already sell into every school, have field reps in every district, and would rather bundle than build. Reseller terms per §4.7.

### 4.6 Telecom, bKash and fintech co-marketing

With **83M+ bKash customers**, ~146M MFS accounts nationally and ~900k bKash merchants, the MFS rails are both a payment method and a distribution surface.

- **Now (do this):** accept bKash at checkout via SSLCommerz, and _say so on every price page and creative_ — "bKash / নগদ / কার্ডে পেমেন্ট". Payment familiarity removes a real objection for a ৳2,999 recurring charge.
- **Month 6+:** apply to the **bKash merchant/partner programmes** for co-marketing (offer/cashback placement in the bKash app). Pitch angle: "school fee-adjacent SaaS with monthly recurring bKash payments in a category they want" — realistic outcome is a cashback promo, not a headline partnership. Requirements to have ready: trade licence, NID, bank account, live website/app (§13).
- **Telecom (GP/Robi/Banglalink) education bundles / zero-rating:** attractive but slow and relationship-gated. Do not spend founder time here before you have 50 paying schools. When you do, the ask is a _zero-rated or discounted data bundle for teachers using the app_, which is a genuinely differentiating offer given ~৳33/GB data pricing.

### 4.7 Resellers and agents

A solo founder cannot cover Sylhet, Rajshahi, Khulna and Bogura. Agents can — but a badly designed agent programme produces oversold, under-onboarded, churning schools. Design it defensively:

| Term                     | Spec                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who**                  | Existing IT-service shops, guide-book distributors, and ex-teachers with local standing. Prefer people who already sell _something_ to schools.                                                                                                                                             |
| **Commission**           | **50% of the school's months-1–3 subscription revenue, paid at signing, + another 50% of that same amount paid again at month 6, + 10% recurring thereafter.** Marketplace GMV excluded. **One schedule, published once — no agent may quote a variant.** (amended per SYNTHESIS, row P-15) |
| **Clawback**             | Full clawback of the signing and month-6 payments if the school churns before month 4 — this is what stops overselling.                                                                                                                                                                     |
| **Certification**        | An agent may not quote the commission schedule until certified: training plus a **signed list of what the product does not do** — certification, not enthusiasm, is what stops overselling from the agent's own mouth.                                                                      |
| **Payment**              | Monthly by bKash/bank against a statement; minimum ৳1,000 payout (mirrors the seller payout rule)                                                                                                                                                                                           |
| **Territory**            | Non-exclusive by default; exclusivity in a district only after 10 paid schools, reviewed quarterly                                                                                                                                                                                          |
| **What they may not do** | Quote custom prices, promise unshipped features, hold school data, or set up the school without your onboarding call being offered. Breach = termination.                                                                                                                                   |
| **Enablement**           | A Bengali deck, the price sheet, the 60s video, a demo workspace of their own, and a 2-hour training. Nothing else.                                                                                                                                                                         |
| **When to start**        | Month 5+, and only after _you_ have personally closed 10 schools and can therefore teach the motion                                                                                                                                                                                         |

### 4.8 SEO

Low volume, high intent, and it compounds — start it in month 1 and forget it until month 6.

**Priority keyword clusters:**

| Cluster           | Example queries                                                                                                       | Page to build                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Category, English | _school management software Bangladesh_, _school management system BD price_, _best school software Bangladesh_       | Pillar page + honest comparison page                               |
| Category, Bengali | _স্কুল ম্যানেজমেন্ট সফটওয়্যার_, _স্কুল সফটওয়্যার বাংলাদেশ_, _স্কুলের হাজিরা সফটওয়্যার_                             | Bengali pillar page (not a translation — written natively)         |
| Job-to-be-done    | _প্রগতিপত্র তৈরি_, _report card format Bangladesh_, _নম্বরপত্র ফরম্যাট_, _হাজিরা খাতা ফরম্যাট_, _class routine maker_ | **Free tool/template pages** — these are your best lead magnets    |
| Rules & reference | _GPA calculation Bangladesh_, _A+ grading system BD_, _SSC GPA 5 হিসাব_, _75% attendance rule_                        | Evergreen explainer pages with a calculator                        |
| Comparison        | _[competitor] alternative_, _Shikkha vs_, _school ERP price Bangladesh_                                               | Fair, factual comparison pages — never trash the competitor        |
| Local             | _school software Dhaka / Chattogram / Sylhet_                                                                         | Thin city pages only once you have a customer in that city to name |

**Technical must-haves:** Bengali and English URLs with `hreflang`, fast on mobile (your LCP budget already forces this), schema.org `SoftwareApplication` + `FAQPage`, and a real pricing page with real numbers — BD buyers filter out "contact us for pricing" vendors instantly, and publishing ৳2,999/৳7,999 is itself a differentiator against the ৳50,000-licence incumbents.

**Programmatic SEO from your own product (do this in month 6+):** public marketplace listing pages, public seller storefronts, public job pages and public school profile pages (§5) generate hundreds of indexable, genuinely useful pages with zero content-writing cost. This is the highest-leverage SEO available to you and it is a _product_ task, not a marketing one.

### 4.9 WhatsApp

~22M WhatsApp users vs ~71M on Messenger — so **Messenger is primary for cold contact, WhatsApp is primary for warm relationships** (pilot groups, support, teacher ambassadors).

- **Per-pilot WhatsApp group** — you, the champion, the class teachers. Created on day 0 of every pilot, archived at conversion. This group is the pilot's success mechanism.
- **Broadcast lists** (not groups) for announcements to opted-in teachers/principals: max 2/month, always useful-first (a template pack, a circular explainer), never a naked pitch. Personal-account broadcast lists require the recipient to have saved your number — so ask for that in the onboarding call.
- **WhatsApp Business API / template messages** — deferred per `PRODUCT-DECISIONS.md §7`; revisit at ~100 schools when parent notice volume justifies the cost and approval process.
- **Never** put student names or marks in a WhatsApp message. Send a link into the parent portal instead. This is both a PDPA 2026 (Act 63 of 2026) posture and a real safeguarding rule.

### 4.10 Print and offline — promoted to a primary channel

**Amendment (per SYNTHESIS, row G-07):** this is no longer a bottom-of-list minor channel. The guide-book/খাতা/প্রগতিপত্র-booklet seller below is estimated to see **~40 principals a month**, already trusted by every one of them — that puts him on the same priority tier as §4.1's Facebook groups, not after every other channel.

Cheap, local, and it reaches the schools with no Facebook page:

- **School stationery and guide-book vendors (primary motion)** — the shops that sell attendance registers (হাজিরা খাতা), report-card booklets and exam pads to every school in a thana, led by the specific booklet sellers who personally visit ~40 principals a month. Put a Bengali card in every register they sell, with a QR to a free template pack. **Commission structure:** ৳50–100 per scanned lead, or ৳1,000 per converted school, with the same certification-and-clawback discipline as §4.7 once volume justifies a formal agreement. ৳3,000 of printing covers a thana.
- **A4 Bengali one-pager** you leave at every school visit. One side: the three numbers (60 seconds, 2 minutes, ৳0 to start). Other side: a QR to the trial and your phone number.
- **Report-card sample pack** — print 5 beautiful প্রগতিপত্র samples on good paper. Hand them to the principal. Physical artefacts survive in an office long after a Messenger thread is buried.
- **Printers** who produce school report cards and ID cards — natural partners; they get a better file, you get introductions.

### 4.11 Play Store ASO (from R4)

The Android wrapper ships in R4; prepare the listing before it does. Android is ~95% of the market, so the Play listing is a primary storefront, not an afterthought.

- **Title:** `Acadigma Campus — School & Attendance` (include the category keyword; keep the brand first)
- **Short description (80 chars), Bengali-first:** `হাজিরা, নম্বর, প্রগতিপত্র ও অভিভাবক বিজ্ঞপ্তি — এক অ্যাপে`
- **Long description:** two full versions (bn-BD and en-US) with the natural keywords (স্কুল, হাজিরা, প্রগতিপত্র, রুটিন, school management, attendance, report card) used in sentences, never stuffed
- **Screenshots:** 6, Bengali UI, with a caption bar on each stating the benefit; first screenshot = the attendance screen
- **Localisation:** `bn-BD` as a first-class locale — most competitors ship English-only listings, which is free differentiation
- **APK size:** keep the initial download small; document it in the listing ("small download, works on slow internet")
- **Reviews:** ask for a rating in-app only after a teacher's 10th successful attendance save — never on first launch. Target 20 reviews in the first month from pilot schools.
- **Data safety form:** must be accurate about children's data and match your privacy policy (§13.4) — an inconsistency here is both a policy risk and a takedown risk.

---

## 5. Product-led growth loops to build into the app

These are **feature requests**, written so they can go straight into the backlog. Each loop: _mechanic → metric → where it lives → release_. Sequenced so that nothing is built before the audience that makes it work exists.

### 5.1 Parent invite loop

- **Mechanic:** Every student record carries guardians with phone numbers. When a school publishes results or a notice, guardians without accounts receive an SMS/Messenger **invitation** — never a link to a student-scoped view. **There is no unauthenticated student-scoped page, ever** (amended per SYNTHESIS, row G-09): the invitation resolves to a generic sign-up/login screen; only an authenticated, verified guardian session can render a child's attendance or marks. Once logged in, the parent returns weekly. Parents who log in see a prompt to invite the other guardian. **The DPIA required by §8.4 is mandatory and must be completed before this loop ships** — MUST, not a nice-to-have.
- **Metric:** _Guardian activation rate_ = activated guardians ÷ guardians with a phone number, per school. Target ≥ 35% by pilot week 4, ≥ 60% by month 3.
- **Where:** parent portal, guardian invite flow, notification wrappers.
- **Release:** **R1.** This is the loop that makes the school unable to leave — once parents expect results in the portal, churn drops hard.

### 5.2 Teacher personal workspace → school pull-through

- **Mechanic:** Any teacher can sign up free and get a personal workspace (already decided: auto-created, exactly one). She uses it for tutoring students, her diary, her files, her CV. Inside it, a persistent, non-nagging card: **"আপনার স্কুলকে যুক্ত করুন"** → generates a pre-written Bengali message + a one-page PDF she can forward to her principal, and notifies you (as a warm lead) with her consent.
- **Metric:** _Pull-through rate_ = schools created from a teacher invite ÷ active personal workspaces. Target 2–4%. Secondary: personal workspaces created/week.
- **Where:** `/personal` dashboard; referral service; a `lead_source` on workspace creation.
- **Release:** **R1** (the card), **R3** (the cash reward in §3.5C).

### 5.3 Marketplace seller storefront as a public SEO page

- **Mechanic:** Every verified seller gets `acadigma.com/s/<slug>` — a public, indexable storefront with bio, subjects, listings, ratings. Every approved listing gets a public page with preview, price, and schema.org `Product` markup. Sellers share their storefront on Facebook because it is _their_ shop window; each share is a backlink and a landing page.
- **Metric:** organic sessions to `/s/` and `/listing/` pages; new buyer signups attributed to them; % of sellers who share their storefront within 7 days of approval.
- **Where:** marketplace listings & seller profile, public route group, sitemap generation.
- **Release:** **R3.** **Gated behind the marketplace go/no-go decision, which now defaults to "no" — do not plan acquisition strategy on this being live.** (amended per SYNTHESIS, row M-03)

### 5.4 Public job pages

- **Mechanic:** Every job posting publishes to `acadigma.com/jobs/<slug>` (already specified as a public apply page). These pages are shared into education-job Facebook groups — by the school, for free, with your branding on them. Applicants create a lightweight account → they now have a teacher profile → some become sellers, some become the teacher who pulls in her next school.
- **Metric:** job-page sessions, applicants per posting, % of applicants who later become active teachers or sellers.
- **Where:** hiring module, public routes.
- **Release:** **R3.** (Jobs in BD education groups get enormous organic reach — this loop is underrated.) **Gated behind the resolved hiring scope (apply-only, no candidate browse, M4/R1.5) — do not plan acquisition strategy on this being live before then.** (amended per SYNTHESIS, row H-01)

### 5.5 Share-to-WhatsApp of notices and report cards, with branding

- **Mechanic:** Every notice, প্রগতিপত্র and নম্বরপত্র has a "শেয়ার করুন" action producing a **permissioned link**. **The OG/share preview image for any student-scoped link carries the school's mark only — logo and name, plus a small "Acadigma Campus" line — and never a child's name, photo, marks or attendance**, because the preview is fetched by the chat app's own crawler before any login or consent exists (amended per SYNTHESIS, row G-10). Parents forward these to family; other parents at other schools see them. **Never share a PDF with marks into a chat — always a permissioned link** (safeguarding + Personal Data Protection Act 2026).
- **Metric (reframed):** authenticated click-through on shared links by the intended guardian, and signups attributed to `?ref=share`. **Not** raw "shares per school per week" — as originally worded, that metric rewards onward transmission of children's records, which is the risk, not the win.
- **Where:** report PDF/share service, notices, OG image generation.
- **Release:** **R1** (notices), **R1/R2** (report cards).

### 5.6 "Powered by Acadigma" footer — text only, internal documents only

- **Mechanic:** **No QR code on any student-facing artefact, ever** (amended per SYNTHESIS, row G-11). A **text-only** footer — `Acadigma Campus দিয়ে তৈরি · acadigma.com`, no QR — appears **only on registers and internal sheets**, is **school-disableable**, and **never appears on a প্রগতিপত্র, নম্বরপত্র or an ID card** under any plan. **Design rule: it must never make the school look cheap.** Small, grey, bottom-right, outside the signature area. **Note:** this loop is largely moot once the Free plan is killed (§8.5/owner decision) — it was designed as a Free-tier upgrade lever and Free is slated for abolition.
- **Metric:** footer visibility on internal documents; Free→Starter conversions citing branding, if Free survives.
- **Where:** PDF renderer, plan entitlements.
- **Release:** **R1.**

### 5.7 Referral codes

- **Mechanic:** Implements §3.5. Every workspace has a code. **Teacher↔teacher AI-credit referral codes are killed** — they read as MLM in the Facebook groups we are trying to enter (amended per SYNTHESIS, row G-13). **School↔school subscription-month referrals are kept, unaffected.** Rewards vest on the referred party's _activity_, not signup. A visible referral panel shows status of each referral.
- **Metric:** _k-factor_ = referred signups ÷ active referrers, computed on the surviving school↔school programme. Target k ≥ 0.15 by month 6 (it will not be ≥1 — that's fine; referral is an accelerant, not the engine).
- **Where:** school settings; subscription-month credit integration; audit entries for every grant.
- **Release:** **R2** (school↔school subscription-month version).

### 5.8 Public school profile page

- **Mechanic:** Opt-in `acadigma.com/school/<slug>` — name, logo, address, medium, grades offered, contact, current job openings, public notices the school chooses to publish, and an "Admission enquiry" form that lands in the school's inbox. Schools want an online presence and most don't have a website. You are giving them one, and receiving an indexable page plus admission-enquiry lock-in.
- **Metric:** % of schools that enable it; organic sessions; enquiries generated per school per month (this is a _retention_ number — a school receiving admission enquiries does not churn).
- **Where:** school settings → "Public profile"; public routes; sitemap.
- **Release:** **R2.**

### 5.9 Teacher CV portability

- **Mechanic:** A teacher's profile, certificates, subjects, experience and (with permission) verified teaching stats — attendance consistency, years taught, sections handled — export to a clean PDF CV and to a public `acadigma.com/t/<slug>` if she opts in. Her materials and CV follow her between schools. This makes the _teacher_, not the school, your retained user.
- **Metric:** CVs generated; profiles set `open_to_work`; applications submitted; teachers retained after leaving a customer school.
- **Where:** teacher profile, hiring module.
- **Release:** **R3.** **Gated behind the marketplace go/no-go and the resolved hiring scope (both now conservative) — do not plan acquisition strategy on this being live.** (amended per SYNTHESIS, rows M-03, H-01)

### 5.10 Embeddable timetable (রুটিন) and notice widget

- **Mechanic:** A school can embed its রুটিন, exam schedule or notice board into its existing website (or Facebook page tab) with one `<iframe>` snippet carrying a small Acadigma credit. Also: ICS export for teachers' phone calendars (already in the PRD).
- **Metric:** embeds installed; referral sessions from embeds.
- **Where:** timetable module; a public embed route with per-school tokens.
- **Release:** **R2.**

### 5.11 Waitlist and beta badges

- **Mechanic:** Before each module ships (marketplace, hiring, Android app), an in-product waitlist with a counter ("১,২৪০ জন শিক্ষক অপেক্ষায়") and an early-access badge for the first joiners — displayed on seller storefronts and teacher profiles as **"প্রতিষ্ঠাতা বিক্রেতা" / Founding Seller**. Badges are permanent and non-purchasable, which makes them worth something.
- **Metric:** waitlist size per module; waitlist→activation within 14 days of launch (target ≥ 40%).
- **Where:** feature-flag gated banners; profile badges.
- **Release:** **R1 onward** (waitlists precede every module launch).

### 5.12 Loop sequencing summary

| Release | Loops live                                                                                          | What the loops are _for_ at that stage                            |
| ------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **R1**  | 5.1 parent invite · 5.2 pull-through card · 5.5 share-to-WhatsApp · 5.6 powered-by · 5.11 waitlists | Make each school's own parents and teachers do the distribution   |
| **R2**  | + 5.7 credit referrals · 5.8 school profile · 5.10 embeds                                           | Make schools visible publicly; start compounding SEO surface      |
| **R3**  | + 5.3 storefronts · 5.4 job pages · 5.9 CV portability · 5.7 cash referrals                         | Turn the marketplace and hiring modules into acquisition channels |
| **R4**  | + Play Store ASO · push-driven re-engagement                                                        | Convert installed base into daily habit                           |

---

## 6. Marketplace supply/demand kickoff

The marketplace is a **retention and teacher-loyalty engine first, a revenue line second.** Do not let it consume founder time before R3 — but _do_ recruit supply during R1/R2 with a waitlist, because a marketplace that launches empty never recovers.

### 6.1 Recruiting the first 50 sellers

**Sequence (start 8 weeks before R3 ships):**

| Wave                                            | Who                                                                                                                            | How many | The ask                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Your own pilot schools' best teachers**    | The 3–5 teachers per pilot school who already make good worksheets                                                             | 15       | "You already made this. Put it up, keep 70%, we handle everything." Personally help them upload their first 3 items.                                                    |
| **2. Teacher influencers**                      | Bengali education Facebook page / YouTube channel owners (10k–200k followers) who already share free notes and question papers | 15       | Founding Seller badge + featured placement + 0% commission for 90 days + you build their storefront for them. They already have demand; you are giving them a checkout. |
| **3. Training institutes and coaching centres** | Private B.Ed institutes, coaching chains with in-house material                                                                | 10       | Institutional seller accounts; revenue share; their alumni become buyers                                                                                                |
| **4. Subject specialists from teacher groups**  | The people who answer questions helpfully in Facebook teacher groups                                                           | 10       | Direct message, personal, `OUTREACH-TEMPLATES.md §8`                                                                                                                    |

**Why influencers matter most:** a Bengali education page with 100k followers who already posts free question papers _is_ the demand side. Converting five of them makes the marketplace non-empty and self-marketing on day one.

### 6.2 Seed content strategy

Target at launch: **≥ 100 approved listings** (matches PRD success metric §3.5) across a deliberately narrow set, because a shallow-but-complete category beats a broad-but-empty one.

**Launch categories (only these five):**

1. **Class 1–5 worksheets** (English, Bangla, Math, Science) — highest volume demand, lowest production cost
2. **Question paper banks** by class and term (১ম সাময়িক / ষান্মাসিক / বার্ষিক) — the single most-searched teaching material in BD
3. **Lesson plans and pacing charts** aligned to the national curriculum
4. **Exam and admin templates** — প্রগতিপত্র formats, নম্বরপত্র, হাজিরা খাতা, admission forms, notice templates
5. **Classroom decoration and activity packs** for KG — high perceived value, easy to produce

**Your own seed content (platform-published, free):** 20–30 free template packs you produce, listed at ৳0 and used as lead magnets (§7.3). They set the quality bar visually, fill the category pages, and give you something to give away in every Facebook group.

**Pricing guidance to sellers** (published, not enforced): worksheets ৳30–100; question paper sets ৳100–300; full-term packs ৳300–800; templates ৳50–200. Anchor low — BD willingness-to-pay for a digital file is real but modest, and volume beats price here.

### 6.3 Launch promotions

| Promo                                   | Terms                                                                                                                           | Why                                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0% commission for the first 90 days** | For all sellers approved before launch + 30 days. Explicitly time-boxed and communicated as a founding offer, reverting to 30%. | Costs you almost nothing (30% of a near-zero base) and buys the supply that makes the marketplace real. **Set the end date in writing at the start** — an open-ended 0% is impossible to walk back. |
| **Founding Seller badge**               | Permanent, first 50 approved sellers                                                                                            | Status is free and it retains                                                                                                                                                                       |
| **Featured storefront**                 | Top of category for 30 days, first 20 sellers                                                                                   | Free inventory                                                                                                                                                                                      |
| **Fast-track KYC**                      | 1 business day instead of 2 for founding sellers                                                                                | Removes friction at exactly the moment enthusiasm is highest                                                                                                                                        |
| **Upload service**                      | You personally upload and format the first 3 items for any founding seller                                                      | The #1 reason sellers stall is the upload step, not the willingness                                                                                                                                 |

### 6.4 Quality bar

Moderation is already specified (`draft → submitted → approved/changes_requested/rejected → published`). The published rubric — make it a public page so rejections are never arbitrary:

**Accept if all of:** (1) the file opens and is complete (no missing pages, no broken fonts, Bengali renders correctly) (2) it is original or the seller holds the rights (3) the preview honestly represents the contents (4) it has a real title, description, class level and subject (5) no student PII anywhere in the file (6) no political, religious-sectarian or discriminatory content (7) answer keys included where a worksheet implies one (8) minimum substance (a single-page listing priced above ৳100 needs a reason).

**Reject or request changes for:** photocopied textbook pages, scanned board question papers passed off as original, watermark-stripped material from other creators, AI-generated filler with factual errors, misleading previews, or prices wildly out of band.

**Review SLA:** 2 business days (already the KYC SLA — use the same number everywhere). Every rejection carries a specific, actionable reason in Bengali.

### 6.5 Buyer-side promotions to schools

- **School-funded credits:** a school buys a materials budget (e.g. ৳5,000) that teachers spend with admin approval — already supported by the request→approve→school-pays flow. Sell it to owners as _"a professional-development budget that actually gets used"_ and market it in January when budgets are set.
- **First purchase free:** every new school gets ৳500 of marketplace credit on activation. It costs you the seller's 70% and buys the habit.
- **Bundle with the plan:** Pro includes ৳1,000/month of marketplace credit. This makes Pro's price feel smaller and directly seeds demand for sellers — the two sides of the marketplace funded by one line item.
- **Seasonal pushes:** question-paper bundles 3 weeks before each exam window; worksheet packs in the first week of January; KG activity packs before annual day.

### 6.6 Fraud and plagiarism handling

| Risk                                              | Control                                                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Uploading copyrighted textbook/board material** | Moderation rubric + a required rights declaration checkbox at submission + spot checks. Repeat offence = seller termination and forfeiture of pending earnings.                                                    |
| **Re-uploading another seller's file**            | Perceptual/file hashing on upload to flag near-duplicates for human review; a public takedown form with a 3-business-day response; first strike = delisting, second = ban.                                         |
| **Buyer resharing purchased files**               | Already decided: private bucket, 5-minute signed URLs, per-download logging, **buyer name/email watermarked into the PDF at download**. Publish that watermarking exists — deterrence works better than detection. |
| **Fake reviews**                                  | Only entitled buyers can review, one per order line (already decided)                                                                                                                                              |
| **Payment fraud / chargeback**                    | SSLCommerz IPN validation before entitlement; 7-day earnings hold before `available`; refunds reverse pending earnings or become a negative adjustment                                                             |
| **Seller identity fraud**                         | KYC before payout eligibility; payout methods encrypted; platform-staff-only visibility                                                                                                                            |
| **AI slop flooding**                              | Minimum-substance rule in the rubric; a per-seller submission rate limit (e.g. 20 pending items); quality score visible to moderators                                                                              |

**Publish a one-page marketplace policy in Bengali** covering rights, refunds, takedowns and payouts before the first listing goes live. Doing it after the first dispute is ten times harder.

---

## 7. Community and content

### 7.1 Facebook group strategy

**Run your own group and participate in others — in that order of long-term value, reverse order of speed.**

**Your group: "বাংলাদেশের স্কুল ব্যবস্থাপনা — শিক্ষক ও পরিচালকদের আড্ডা"** (School management in Bangladesh — teachers & administrators).

- **Positioning:** not an Acadigma user group. A professional community about _running schools in Bangladesh_. Acadigma is the sponsor, mentioned in the pinned post and nowhere else by you.
- **Seeding:** invite every pilot-school teacher, every teacher you've helped in other groups, every workshop attendee. Target 300 members by month 3, 2,000 by month 12.
- **Rules (pinned, enforced):** no job-posting spam, no "inbox me" selling, no student photos or student data, Bengali or English both welcome, questions get answers.
- **Weekly rhythm:** Sat = question of the week; Mon = a free template; Wed = a member's problem solved publicly; Thu = a short tutorial video.
- **Your job:** answer every question within 12 hours for the first 6 months. Groups die of founder absence, not of bad content.

**Other groups:** the 25–40 you joined in §4.1(a). Rule: **give 10 substantive answers before you post anything with your name on a product.** Track which groups produce replies; drop the dead ones.

### 7.2 12-week Bengali content calendar

One long piece (video or post) + one short (Reel/TikTok) per week. All Bengali, all phone-shot, all ending with a free downloadable. Publish to: your group, your page, 3–5 relevant groups, YouTube, TikTok, and the blog (for SEO).

| Wk  | Long piece (YouTube + blog, Bengali)                          | Short (Reel/TikTok)            | Lead magnet                            |
| --- | ------------------------------------------------------------- | ------------------------------ | -------------------------------------- |
| 1   | স্কুলে হাজিরা ব্যবস্থাপনা: খাতা থেকে ফোনে — কীভাবে শুরু করবেন | ৪০ জনের হাজিরা ৫০ সেকেন্ডে     | হাজিরা খাতা টেমপ্লেট (Excel + PDF)     |
| 2   | প্রগতিপত্রের সঠিক ফরম্যাট: কী কী থাকা উচিত                    | প্রগতিপত্র ২ মিনিটে            | ৩টি প্রগতিপত্র টেমপ্লেট                |
| 3   | GPA ও গ্রেড হিসাব: A+ থেকে F পর্যন্ত পুরো নিয়ম               | GPA ভুল হিসাবের ৩টি কারণ       | GPA ক্যালকুলেটর (Sheet)                |
| 4   | ক্লাস রুটিন তৈরির সহজ পদ্ধতি ও সংঘর্ষ এড়ানো                  | রুটিনে ক্ল্যাশ ধরার উপায়      | রুটিন টেমপ্লেট                         |
| 5   | অভিভাবকের সাথে যোগাযোগ: WhatsApp গ্রুপের বাইরে                | বিজ্ঞপ্তি পাঠানোর সঠিক উপায়   | ১০টি বিজ্ঞপ্তির নমুনা                  |
| 6   | পরীক্ষার নম্বর এন্ট্রি: Excel-এর ভুলগুলো যেভাবে এড়াবেন       | নম্বর তালিকা তৈরি              | নম্বরপত্র টেমপ্লেট                     |
| 7   | শিক্ষকের পাঠ পরিকল্পনা: ১৫ মিনিটে এক সপ্তাহ                   | AI দিয়ে পাঠ পরিকল্পনা         | পাঠ পরিকল্পনা ফরম্যাট                  |
| 8   | ছাত্রছাত্রীর তথ্য ডিজিটাল করা: CSV ইমপোর্ট গাইড               | Excel থেকে ২০০ ছাত্র ইমপোর্ট   | ছাত্র তথ্য CSV ছক                      |
| 9   | স্কুলে ডেটা নিরাপত্তা: শিশুদের তথ্য ও নতুন আইন                | আপনার স্কুলের ডেটা কোথায় আছে? | ডেটা নিরাপত্তা চেকলিস্ট                |
| 10  | শিক্ষক নিয়োগ: ভালো শিক্ষক খুঁজে পাওয়ার প্রক্রিয়া           | সাক্ষাৎকারের ৫টি প্রশ্ন        | নিয়োগ বিজ্ঞপ্তি ও স্কোরকার্ড টেমপ্লেট |
| 11  | ভর্তি মৌসুমের প্রস্তুতি: নভেম্বর-জানুয়ারির চেকলিস্ট          | ভর্তি ফরমে যা যা রাখবেন        | ভর্তি ফরম + চেকলিস্ট                   |
| 12  | নতুন শিক্ষাবর্ষ শুরু: ১ জানুয়ারির আগে ১০টি কাজ               | প্রমোশন ও নতুন শাখা সেটআপ      | শিক্ষাবর্ষ শুরুর চেকলিস্ট              |

Repeat the cycle in weeks 13–24 with updated examples and real customer footage. Every lead magnet sits behind a name + phone/email + school name — that's your list.

### 7.3 Template packs as lead magnets

The single cheapest acquisition asset you have. Build **12 packs** (one per calendar week above), each: a Bengali PDF + an editable Excel/Docs file + a one-page "how to use it" sheet, all branded, all with a QR to the trial.

Delivery: a landing page per pack (also an SEO page), gated by `name + phone + school + role`. Follow up within 24 hours with a Messenger/WhatsApp message referencing _the specific pack they downloaded_. Download→conversation rate should run 10–20%; if it's under 5%, your follow-up is too generic.

### 7.4 Webinars for principals

Monthly, Saturday morning, 45 minutes, Bengali, free, capped at 30 attendees (scarcity + you can actually talk to everyone).

Format: 20 min genuine content (not a demo) → 15 min live walkthrough of the relevant Acadigma feature → 10 min Q&A → an offer at the very end, once. Topics tracked to the school calendar: _Sept:_ preparing for annual exams; _Oct:_ result processing without Excel chaos; _Nov:_ admission season data; _Dec:_ closing the year, promotions; _Jan:_ starting a new শিক্ষাবর্ষ digitally; _Feb:_ parent communication that actually reaches parents.

Promotion: your group + Messenger to your pipeline + the pilot schools' principals inviting peers. Zoom/Google Meet; record; the recording becomes that month's long-form content. **Expect 30 registrations → 12 attendees → 3 demos → 1 pilot.** That's a good webinar. Run it monthly regardless of numbers — the recording compounds.

### 7.5 Teacher ambassador program

**"অ্যাকাডিগমা শিক্ষক অ্যাম্বাসেডর"** — 20 teachers, recruited from the most active pilot and community teachers, renewed quarterly.

- **They get:** Pro features free on their personal workspace; unlimited AI credits; a permanent profile badge; early access to every new module; direct WhatsApp line to you; featured placement if they sell; a printed certificate (this matters more than you'd expect — it goes on a staff-room wall); and 0% marketplace commission for 12 months.
- **They do:** one piece of content per month (a tip, a screen recording, a testimonial), answer questions in the community, and host one workshop at their own school per quarter.
- **You track:** referrals generated, content published, community answers, schools sourced. Publish a leaderboard in the group.
- **Start:** month 4, after you have enough real users to pick from. Recruiting ambassadors before you have users produces ambassadors with nothing to be enthusiastic about.

---

## 8. Pricing and packaging tactics

Current plan matrix (placeholders per `PRODUCT-DECISIONS.md §5.1`): **Free ৳0** (5 teachers / 150 students / 1 GB / 20 credits-day), **Starter ৳2,999** (20 / 600 / 10 GB / 100), **Pro ৳7,999** (75 / 2,500 / 50 GB / 400), **Enterprise** (contact), 14-day Pro trial, yearly = 10× monthly.

### 8.1 The frame to sell against

Never compare to other software. Compare to **one part-time data-entry salary (~৳8,000–15,000/month)** and to **the ~৳50,000+ one-time licences** the incumbents quote. Starter at ৳2,999/month is _one fifth of a salary_; Pro at ৳7,999 is _one salary's worth of two people's evenings, given back_. Say it in those words.

### 8.2 Annual discounts

Yearly = 10× monthly (**2 months free**) is already the convention — keep it, and push it hard in **December–January**, because (a) that's when school budgets are set, (b) annual prepay solves your cash-flow problem as a bootstrapped founder, and (c) an annually-prepaid school does not churn in March. Target **≥ 40% of paid schools on annual by month 12.** Add one extra lever for the January window only: _annual prepay before 31 January includes free setup, data import and two on-site training sessions._

### 8.3 Per-school vs per-student

~~Stay per-school with student/teacher caps~~ — deleted. Pricing is now **band + overage, with no teacher caps** — see `PRODUCT-DECISIONS.md §5.1` and `MARKET-STRATEGY.md §c` for the live numbers. (amended per SYNTHESIS, rows P-05, P-06) **Exception:** Enterprise, where per-student or per-campus negotiated pricing is normal and expected above ~2,500 students.

Watch one failure mode: a 900-student school needing Pro (৳7,999) purely for the student cap while using none of Pro's modules will churn or haggle. If that pattern appears more than 3 times, introduce **Starter+ (৳4,999, 1,200 students, no Pro modules)** rather than discounting Pro.

### 8.4 Regional pricing

Do **not** publish different prices by city — it leaks instantly in a market this connected, and it insults Sylhet. Instead, absorb regional willingness-to-pay differences through: the **Free tier** (genuinely usable for a small mofussil school), **reseller-negotiated annual terms** within a 10–15% band, and **association member rates** (which are earned, not geographic). If a district genuinely can't bear ৳2,999, the right answer is a smaller-cap tier, not a secret discount.

### 8.5 Free for madrasa / NGO schools

Run it deliberately, not ad hoc:

- **Who qualifies:** registered madrasas, NGO-run and charity schools, and schools with >50% students on free/subsidised tuition. Requires a simple application with the institution's registration document.
- **What they get:** **Starter free for 12 months**, renewable on reapplication, **with AI off**, and a "Supported by Acadigma" note on their public profile (their choice). Budgeted as a named **৳7,500/month programme line** — this is a budgeted programme, not an accounting leak. (amended per SYNTHESIS, row P-07)
- **Cap:** 25 schools in year 1 — a hard number, so it stays a programme and not a leak.
- **Why it's good business, not just charity:** goodwill in exactly the associations that gatekeep the paid market; volume for the marketplace's demand side; real usage data from Bangla-medium contexts you otherwise wouldn't reach; and a clean, honest answer to objection #14.

### 8.6 How to run a price test

With 10–40 customers you cannot run a statistically valid A/B price test — so don't pretend to. Run **sequential cohort tests** instead:

1. **Cohort 1 (schools 1–10):** founding price, locked 24 months, at the placeholder numbers. Purpose: learn, not optimise.
2. **Instrument the conversation, not the page.** In every demo, after stating the price, record verbatim in the CRM: the reaction (immediate yes / hesitation / pushback / walk-away), the number they counter with, and the comparison they reach for. Thirty of these beat any A/B test you could run at this volume.
3. **Cohort 2 (schools 11–30):** change _one_ variable — most likely Starter's student cap, not the price — and compare demo→pilot→paid rates against cohort 1.
4. **Price increases** apply to new customers only; existing schools keep their price for at least 12 months and are told so in writing. Announce any increase 60 days ahead.
5. **Signals you're underpriced:** >70% of demos accept the price with no hesitation; no one asks for a discount; schools upgrade within 30 days. **Signals you're overpriced:** pilots complete successfully and still don't convert; the word "committee" appears in every close; Free-tier schools with 400 students refuse to upgrade even when they hit read-only limits.

### 8.7 When to introduce paid seller subscriptions

**Not before month 12, and not before these three gates are all true:** ≥ 300 active sellers, ≥ ৳300,000 monthly marketplace GMV, and a top decile of sellers earning > ৳5,000/month. Until then, 30% commission is the only seller monetisation — adding a subscription to a thin marketplace kills supply.

When the gates clear, the right shape is a **Seller Pro at ~৳499/month** offering: reduced commission (20% instead of 30%), storefront customisation, bulk upload, sales analytics, featured placement credits, and priority review. It must always be optional and always pay for itself for a seller doing >৳5,000/month — sell it with a calculator, not a paywall.

---

## 9. Support and retention

### 9.1 Onboarding call checklist

Every new school gets a **60-minute onboarding call/visit within 48 hours of signup or pilot start.** Work this list in order; do not skip a line.

**Before the call (you, 30 min):** workspace created · school profile (name, address, EIIN, logo) · academic year and terms · working days Sat–Thu, Asia/Dhaka · BD grade scale confirmed (A+…F, GPA 5.00, pass 33) · grade levels and sections created · a sample প্রগতিপত্র generated with their branding to show.

**On the call (60 min):**

1. (5 min) Confirm who is champion, who is owner, who is class teacher. Get everyone's WhatsApp number. Create the school's WhatsApp group.
2. (10 min) Student import: take their Excel, map it live, import, show the count. _Do this yourself, on the call._ Never send a CSV template and hope.
3. (5 min) Invite the staff: teachers by phone/email, or hand them the join code and approve live.
4. (10 min) **Train on হাজিরা only.** Have every teacher present mark one real section on their own phone before the call ends. Nothing else matters on day 1.
5. (5 min) Show the owner their dashboard and the audit log.
6. (5 min) Set up guardians and send one real notice to one section, live.
7. (5 min) Set expectations: "For two weeks, do only attendance. We'll add marks at exam time." Feature-by-feature staging is how you avoid overwhelm.
8. (5 min) Book: the day-3 check-in, the day-15 review, and the first exam date.
9. (5 min) Give: the Bengali quick-start PDF, the video playlist link, WhatsApp support hours, and your direct number.
10. (5 min) Ask: "What would make this a failure for you?" Write the answer down verbatim. It is your retention roadmap for this account.

**After the call (same day):** WhatsApp summary of what was agreed + the three dates · add to the health dashboard · set a day-3 reminder.

### 9.2 WhatsApp support hours

- **Published hours: Sat–Thu, 08:00–22:00.** Friday: emergencies only (define "emergency" = cannot log in, data appears wrong, payment failed).
- **Targets:** first response < 30 min in hours; resolution or a stated next step same day; a Bengali voice note beats a paragraph — school staff prefer and act on voice.
- **During exam and result weeks at any pilot school, respond within 10 minutes.** These are the weeks that decide renewal.
- **Escalation tiers:** (1) canned Bengali answer + video link, (2) voice note walkthrough, (3) screen-share call, (4) you do it for them in the admin console and then show them. Tier 4 is allowed and correct in year 1 — do not be precious about "teaching them to fish" while you have 10 customers.
- **Log every ticket** with school, module and a one-line cause. After 50 tickets, the top 5 causes are your next product sprint and your next 5 videos. This log is the cheapest product research you will ever get.

### 9.3 Training material

| Asset                          | Format                                                            | Audience              |
| ------------------------------ | ----------------------------------------------------------------- | --------------------- |
| **Quick-start card**           | 1-page Bengali PDF, printable, laminated for the staff room       | All teachers          |
| **হাজিরা in 60 seconds**       | 60s video                                                         | Teachers              |
| **Marks entry and প্রগতিপত্র** | 5 min video + 2-page PDF                                          | Class teachers, admin |
| **Admin setup guide**          | 8 min video + 6-page PDF                                          | Champion/admin        |
| **Owner's dashboard tour**     | 4 min video                                                       | Owner                 |
| **Parent guide**               | 1-page Bengali PDF the _school_ sends to parents (school-branded) | Parents               |
| **FAQ, Bengali**               | Web page, searchable, updated from the ticket log weekly          | Everyone              |

Rules: **Bengali first, English second** (never English-only); every video ≤ 8 minutes; every video downloadable for offline viewing (data cost is real); host on YouTube (unlisted for internal, public for anything that doubles as marketing); and **remake any video whose UI has changed** — a stale video is worse than no video.

### 9.4 Health score

Computed weekly per school from real tables (no mock data — same rule as the dashboards):

```
Health = 0.35 x Attendance completeness   (sessions recorded / expected sessions, trailing 14 days)
       + 0.30 x Weekly active teachers    (teachers with >=1 action in 7 days / active teacher memberships)
       + 0.15 x Parent activation         (activated guardians / guardians with contact details)
       + 0.10 x Module breadth            (modules used >=once in 30 days / modules entitled)
       + 0.10 x Admin engagement          (owner/admin logins in 14 days, capped at 6)
```

**All of the above denominate on `app.is_school_day`, not calendar days** — a declared closure (e.g. the Ramadan/Eid closure, §1.4) suppresses churn alerts and freezes health-score decay for its duration; it must never fire as a false Red band during a closure. (amended per SYNTHESIS, row G-03)

**Bands:** ≥ 75 Green (expansion/referral/case-study candidate) · 50–74 Yellow (intervene this week) · < 50 Red (call the owner within 48 hours). Surface this in the platform console as a sortable list — it is the founder's Monday morning screen.

### 9.5 Churn signals and interventions

| Signal                                     | Threshold                                                                                          | Intervention                                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Attendance completeness falling**        | < 60% for 5 school days (per `app.is_school_day`; suppressed during a declared closure — see §9.4) | Highest-signal leading indicator. WhatsApp the champion _that day_: "I noticed Class 6 হাজিরা hasn't been marked since Sunday — anything broken?"     |
| **Weekly active teachers dropping**        | < 50% of teachers                                                                                  | Free re-training session; find out if a specific teacher is blocking                                                                                  |
| **Champion goes quiet**                    | No login in 10 days                                                                                | Call the champion; if they've left the school, _immediately_ identify and onboard a new champion — champion departure is the #1 cause of silent churn |
| **No exam cycle completed**                | 60 days on platform, zero marks entered                                                            | They haven't reached the value moment. Offer to do the first exam setup yourself.                                                                     |
| **Support tickets spike then stop**        | Frustration curve                                                                                  | Personal call from you, not a message                                                                                                                 |
| **Owner asks about export**                | Any time                                                                                           | Give it immediately and cheerfully, then ask why — an export request is a resignation letter you can still reply to                                   |
| **Payment fails / card or bKash declines** | Any                                                                                                | Contact within 24h; never suspend without three notices                                                                                               |
| **Renewal month approaching**              | 45 days out                                                                                        | Start the QBR (§9.6), not a renewal invoice                                                                                                           |

### 9.6 Quarterly business reviews (Pro and Enterprise)

45 minutes, with the owner, every quarter. Deck of five slides, generated from their own data:

1. **Usage:** teachers active, attendance completeness, sessions, report cards generated — vs last quarter.
2. **Time saved:** hours of attendance and report-card work replaced, costed against a data-entry salary. **This slide is why they renew.**
3. **Where you're under-using it:** two modules they're entitled to and not using, with an offer to train.
4. **What shipped for you this quarter** and what's coming — including anything built because _they_ asked.
5. **The ask:** one of — a referral, a case study, an upgrade, or a testimonial. One only, chosen in advance.

Also send a **monthly one-screen email digest** to every paid school's owner with the top three numbers. Owners who see numbers monthly do not experience a renewal as a surprise expense.

---

## 10. Metrics and dashboard

### 10.1 North star

> **Weekly Active Teaching Actions (WATA)** — the number of distinct teachers who completed a real teaching action (attendance session saved, marks entered, lesson logged, notice sent) in the last 7 days, across all workspaces.

Why this and not revenue or signups: it is the only number that rises when the product is genuinely being _used_ by the person whose habit determines retention, and it cannot be inflated by a school that bought and never logged in. Revenue follows WATA with a lag; WATA does not follow revenue.

Supporting pair: **Attendance Completeness** (the leading retention indicator) and **Net Paid Schools** (the lagging business indicator).

### 10.2 Funnel definitions (write these down once; never redefine mid-quarter)

| Stage         | Definition                                                                                   | Counted when                       |
| ------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Contact**   | A school you sent a first message to                                                         | Message sent                       |
| **Reply**     | Any human response that isn't a rejection                                                    | Response received                  |
| **Qualified** | Tier A fit confirmed + decision-maker identified                                             | You've spoken to buyer or champion |
| **Demo**      | ≥10 minutes of live product shown to a decision-maker                                        | Demo delivered                     |
| **Pilot**     | Workspace created, students imported, ≥1 teacher trained, success criteria agreed in writing | First attendance session saved     |
| **Activated** | ≥80% attendance completeness in any 5-day window                                             | Threshold crossed                  |
| **Paid**      | First successful subscription payment                                                        | Payment settled (not invoiced)     |
| **Expanded**  | Upgraded plan, added sections beyond pilot, or bought marketplace credit                     | Transaction                        |
| **Churned**   | Subscription lapsed >30 days, or dropped to Free from paid                                   | Day 31                             |

Teacher-side funnel (separate): `personal signup → first action → weekly active → invited school → seller`.

### 10.3 Weekly scorecard template

Fill every Thursday 17:00. One screen. Colour: green if ≥ target, amber within 20%, red below.

```
ACADIGMA CAMPUS — WEEK ENDING [date]                      Week [n] of 90-day plan

NORTH STAR
  Weekly Active Teaching Actions (teachers)   [  ]   target [  ]   change vs last wk [  ]

SALES FUNNEL (this week / cumulative)
  Schools contacted           [  ] / [  ]     target 31 / [  ]
  Replies                     [  ] / [  ]     reply rate    [  ]%   (target 25%)
  Demos delivered             [  ] / [  ]     reply->demo   [  ]%   (target 50%)
  Pilots started              [  ] / [  ]     demo->pilot   [  ]%   (target 40%)
  Pilots converted            [  ] / [  ]     pilot->paid   [  ]%   (target 50%)
  PAID SCHOOLS (net)          [  ]            MRR  BDT [     ]

PRODUCT USAGE
  Attendance completeness, all schools (avg)  [  ]%    (target 80%)
  Weekly active teachers / total teachers     [  ]%    (target 70%, PRD 3.4)
  Parent activation rate                      [  ]%    (target 35%+)
  Schools in Red health band                  [  ]     (target 0)

GROWTH LOOPS
  Personal workspaces created                 [  ]
  Teacher->school pull-throughs               [  ]
  Referral signups (k-factor)                 [  ]
  Shared links clicked                        [  ]

MARKETPLACE (from R3)
  Approved listings [  ]  Active sellers [  ]  GMV BDT [    ]  Take BDT [    ]

CONTENT & COMMUNITY
  Pieces published [  ]   Group members [  ]   Lead magnet downloads [  ]
  Paid spend BDT [    ]   Cost per Messenger conversation BDT [   ]
  Cost per pilot BDT [    ]

SUPPORT
  Tickets [  ]   Median first response [  ] min   Top cause: [            ]

THE ONE NUMBER THAT WORRIES ME THIS WEEK: ______________________
THE ONE THING I WILL CHANGE NEXT WEEK:     ______________________
```

Those last two lines are the point of the whole exercise. A scorecard that doesn't change a behaviour is bookkeeping.

### 10.4 Instrumentation you must build

Minimum viable analytics — none of it requires a third-party product: `lead_source` and `referral_code` on every workspace and user; UTM capture persisted through signup; an events table for the funnel stages; the health-score view (§9.4); and a platform-console page that renders the scorecard above from SQL. **Build this in R1** — retrofitting attribution after 50 schools is misery.

---

## 11. 90-day launch plan and 12-month roadmap

### 11.1 Pre-launch (weeks −4 to 0, runs alongside R0/R1 engineering)

| Week   | Do                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **−4** | Legal: trade licence application, e-TIN, business bank account started (§13). Domain, brand assets, Facebook page live. Join 25 Facebook groups and start reading.             |
| **−3** | Build the 400-school list (BANBEIS + FB pages + Maps, per §3.1). Write and translate all `OUTREACH-TEMPLATES.md` scripts; have a Bengali-fluent teacher review every one.      |
| **−2** | Record the 60-second attendance video and 3 shorts. Build 4 lead-magnet template packs and their landing pages. Publish pricing page and privacy policy.                       |
| **−1** | Seed the demo workspace with a realistic BD school. Dry-run the 15-minute demo on 3 friendly teachers and fix what breaks. SSLCommerz sandbox verified. Scorecard sheet built. |

### 11.2 Days 1–90, week by week

| Wk     | Sales                                                 | Product/loops                                                 | Content & community                                           | Milestone                                                |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| **1**  | 40 contacts; first 5 demos booked                     | R1 core stable; `lead_source` instrumentation live            | Content #1 + pack #1; FB group created                        | First demo delivered                                     |
| **2**  | 40 contacts; 4 demos                                  | Powered-by footer (5.6); share-to-WhatsApp for notices (5.5)  | Content #2; 10 group answers                                  | **First pilot school signed**                            |
| **3**  | 35 contacts; 4 demos; 2 pilots                        | Parent invite loop (5.1) shipped                              | Content #3; first webinar announced                           | 3 pilots running                                         |
| **4**  | 30 contacts; 4 demos; 2 pilots                        | Teacher pull-through card (5.2)                               | Content #4; **Webinar #1**                                    | 5 pilots · first day-15 reviews                          |
| **5**  | 30 contacts; 4 demos; 2 pilots                        | Health score view + platform scorecard page                   | Content #5; 100 group members                                 | **First paid school**                                    |
| **6**  | 30 contacts; 4 demos; 2 pilots                        | Report-card sharing; PDF branding polish                      | Content #6; case study #1 drafted                             | 2 paid · 8 pilots                                        |
| **7**  | 30 contacts; 4 demos; 2 pilots                        | CSV import hardening (from ticket log)                        | Content #7; **Webinar #2**; ৳5k ads test begins               | 3 paid                                                   |
| **8**  | 30 contacts; 4 demos; 2 pilots                        | Referral codes v1 (credits, 5.7)                              | Content #8; case study #1 **published**                       | 4 paid · k-factor first reading                          |
| **9**  | 30 contacts; 4 demos; 2 pilots                        | School public profile (5.8) behind a flag                     | Content #9; first TTC workshop booked                         | 5 paid                                                   |
| **10** | 25 contacts; 4 demos; 2 pilots                        | Embeddable রুটিন (5.10); marketplace **waitlist** live (5.11) | Content #10; **Webinar #3**; seller recruitment wave 1 begins | 6 paid · 25 sellers waitlisted                           |
| **11** | 25 contacts; 4 demos; 2 pilots                        | Top-5 ticket causes fixed                                     | Content #11; TTC workshop delivered (60+ teachers)            | 7 paid · 100 personal workspaces                         |
| **12** | 25 contacts; 4 demos; 2 pilots                        | QBR data view; annual-prepay flow                             | Content #12; case study #2; **annual prepay push**            | 9 paid                                                   |
| **13** | Close-out week: every open pilot reviewed and decided | Roadmap replanned from the ticket log                         | 90-day retro published to the group                           | **10 paid schools · 200 teachers · scorecard baselined** |

**Exit criteria for day 90:** 10 paying schools · ≥70% weekly active teachers in them (PRD §3.4) · ≥80% average attendance completeness · 2 published case studies · 3 schools willing to take reference calls · ≥200 teacher personal workspaces · a repeatable message with measured conversion rates at every funnel stage.

### 11.3 12-month growth milestones (tied to the PRD §4 release map)

| Months    | Release                      | Growth milestone                                                                                                                    | Key motion                                                                                                |
| --------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **1–3**   | R1 Campus core               | **10 paid schools, 200 teachers, MRR ~৳40k**                                                                                        | Founder-led, Dhaka+Ctg, pilot→paid                                                                        |
| **4–5**   | R2 Teaching intelligence     | **25 paid schools, 600 teachers, MRR ~৳110k** · ambassador program launches · Sylhet opened via first reseller                      | AI + analytics become the Pro upgrade lever; teacher-side loops carry acquisition                         |
| **6–7**   | R2 → R3 prep                 | **40 schools, 1,200 teachers, MRR ~৳180k** · 50 sellers recruited and waitlisted · SEO pages begin ranking                          | Association partnership #1 signed; first agent producing                                                  |
| **8–9**   | **R3 Commerce & operations** | **60 schools, 2,500 teachers, MRR ~৳280k** · marketplace live with 100+ listings · first payouts executed · hiring module live      | Marketplace and job pages become acquisition channels (5.3, 5.4); school-funded credits sold into budgets |
| **10–11** | R3 hardening                 | **85 schools, 4,000 teachers, MRR ~৳400k** · marketplace GMV ~৳150k/mo · 3 cities · 5 resellers                                     | Land-and-expand; annual prepay push begins for the January boundary                                       |
| **12**    | **R4 Native & automation**   | **110 paid schools, 6,000 teachers, MRR ~৳550k, marketplace GMV ~৳300k/mo** · Android app in Play Store · ≥40% of schools on annual | Play Store ASO opens a self-serve funnel; the January cohort closes; Seller Pro gates evaluated (§8.7)    |

These are targets to plan capacity against, not forecasts. The two that actually matter are **pilot→paid ≥ 50%** and **weekly active teachers ≥ 70%**; if those hold, the school count takes care of itself, and if they don't, no amount of top-of-funnel will save it.

---

## 12. Budget scenarios

All figures BDT/month. Founder time is the real budget in every scenario — the money only changes how much reach you buy on top of it.

### 12.1 ৳0/month — bootstrapped (assume this is your actual state)

| Line                                               | ৳                                                         |
| -------------------------------------------------- | --------------------------------------------------------- |
| Facebook groups, page, organic content             | 0                                                         |
| Messenger/WhatsApp outreach                        | 0                                                         |
| Phone + local travel (unavoidable)                 | ~2,000 (personal)                                         |
| Hosting until launch (Supabase free, Vercel hobby) | 0                                                         |
| **Total**                                          | **~0 cash (really ~৳15,000/month — see amendment below)** |

**Amendment (per SYNTHESIS, row I-08; MARKET-STRATEGY §k):** ৳0 is not actually zero. Counting the founder's own AI/API spend, incorporation costs, domain and phone, this scenario really runs **~৳15,000/month**. Capital need, stated honestly: **~৳300,000 of runway** even in this lean scenario.

**What you can achieve:** 400 contacts and 10 paid schools in 90 days is _entirely achievable at ৳0_ — everything in §3 is free. Expect ~10 hrs/week of outreach + ~5 hrs/week of content. **Constraint:** you cannot also build fast. Realistically at ৳0 the 90-day plan slips to ~120 days because founder hours are the binding constraint, not money.
**Outcome at 12 months:** 40–60 paid schools, MRR ৳180k–280k. Slower, but with better unit economics and a message hardened by hundreds of conversations.
**The one thing to spend on if you have nothing:** travel to school visits. In-person converts several times better than remote in this market.

### 12.2 ৳50,000/month

| Line                                                          | ৳                                                               | Purpose                                                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Facebook/Meta ads                                             | 20,000                                                          | Messenger-conversation ads + lead magnets, Dhaka+Ctg                                              |
| Part-time sales/support assistant (Bengali, phone)            | 12,000                                                          | Takes first-response WhatsApp duty and list-building off you — **this is the highest-value line** |
| Infrastructure (Supabase Pro, Vercel, Sentry, Resend, domain) | 6,000                                                           | Backups and branching become mandatory at R1 launch                                               |
| AI/model spend (credits given to schools and referrals)       | 5,000                                                           | The credit economy's cost of goods                                                                |
| Content production (mic, editing, design help, printing)      | 4,000                                                           | Template packs, one-pagers, report-card samples                                                   |
| Travel, workshops, tea-and-photocopies events                 | 3,000                                                           | The principal workshops in §4.4                                                                   |
| **Total**                                                     | **50,000 (really ~৳66,000–74,000/month — see amendment below)** |                                                                                                   |

**Amendment (per SYNTHESIS, row I-08; MARKET-STRATEGY §k):** ৳50,000 is not the real monthly figure. Adding the founder's own AI cost, an accountant (VAT + AIT), and the PDPA BD-residency replica cost from month 18 brings this scenario to **~৳66,000–74,000/month**. Capital need for this scenario: **~৳800,000–950,000 — pending owner (OQ-24).**

**Expected outcome:** the 90-day plan lands on time and **12-month arrives at 100–130 paid schools (MRR ৳500k–650k)** — roughly the roadmap in §11.3. Ads contribute ~30% of pipeline at a school CPL of ৳1,500–3,000; the assistant roughly doubles your outreach capacity by protecting your build days.
**Payback check:** at Starter ৳2,999, a ৳3,000 school CPL pays back in ~1 month of subscription with healthy margin. If school CPL exceeds ৳6,000, stop ads and go back to groups.

### 12.3 ৳200,000/month

| Line                                               | ৳           | Purpose                                    |
| -------------------------------------------------- | ----------- | ------------------------------------------ |
| Meta ads (multi-city, retargeting, lookalikes)     | 60,000      | Dhaka, Ctg, Sylhet, Rajshahi, Khulna       |
| 2 full-time field sales reps (Dhaka + Ctg)         | 60,000      | With a commission structure mirroring §4.7 |
| Full-time support/onboarding specialist            | 25,000      | Owns onboarding calls and WhatsApp hours   |
| Content/community manager (part-time)              | 15,000      | Owns the calendar, group and ambassadors   |
| Infrastructure + AI credits                        | 20,000      | Scale                                      |
| Events, workshops, association partnerships, print | 12,000      | Two principal workshops/month              |
| Reseller enablement and commissions (float)        | 8,000       |                                            |
| **Total**                                          | **200,000** |                                            |

**Expected outcome:** **250–350 paid schools by month 12 (MRR ৳1.2m–1.8m)**, 4–6 cities, 15k+ teachers, marketplace GMV ৳800k+/month.
**The trap:** at this spend you can buy schools faster than you can make them successful. **Gate the spend on a ratio, not a calendar: never onboard more schools per month than your support capacity can keep above health-score 75.** A churned school in a market this connected costs you three future ones, because principals talk. If health scores drop below 70 on average, cut ad spend and hire support — in that order.

---

## 13. Legal and operations checklist (Bangladesh)

Sequence matters: trade licence → TIN → bank account → BIN/VAT → payment gateway. Expect **2–6 weeks** end to end; start it before you need it, because SSLCommerz onboarding is blocked on documents you can't get overnight.

**Cost and lead-time summary (amended per SYNTHESIS, rows F-06, C-06 — MUST priority for the cost/timeline facts; the go-ahead itself is the owner's call):**

| Item                                                          | Cost                   | Lead time       |
| ------------------------------------------------------------- | ---------------------- | --------------- |
| RJSC registration + trade licence + TIN + VAT BIN             | **~৳35,000** one-time  | **6–10 weeks**  |
| Monthly accountant (VAT + AIT bookkeeping)                    | **৳5,000–8,000/month** | ongoing         |
| BD data-residency encrypted replica (of the sensitive subset) | **~৳96,000/year**      | starts month 18 |

Starting company formation now is an owner decision — **pending owner (OQ-20)** — but the cost and lead-time figures above are facts to plan against regardless of when that decision lands.

### 13.1 Business registration

- [ ] **Decide the structure.** Sole proprietorship is fastest and adequate to start; a private limited company (RJSC registration, Certificate of Incorporation, MoA/AoA, board resolution) is needed before taking investment or signing larger institutional contracts. **Recommendation: start as a proprietorship, convert before the first Enterprise contract or funding round.**
- [ ] **Trade licence** from the City Corporation / Union Parishad for the business address. Required for everything downstream; annual renewal. Keep the business name identical across trade licence, bank account and payment gateway — mismatches are the #1 cause of merchant-onboarding rejection.
- [ ] **e-TIN** from the NBR portal — free, online, and required before you can open a business bank account.
- [ ] **Business bank account** in the trade-licence name; you will need a cheque leaf or statement for merchant onboarding.
- [ ] **BIN / VAT registration** via the NBR VAT Online portal (vat.gov.bd), Mushak 2.1, using TIN + trade licence + bank details. Register when turnover approaches the threshold or when a school demands a VAT invoice — **schools demand VAT invoices, so treat this as near-mandatory rather than optional.**
- [ ] **DBID** (Digital Business Identification Number) — required in SSLCommerz's document list for e-commerce/digital merchants.
- [ ] Annual calendar: trade licence renewal, income tax return, VAT returns (Mushak 9.1, monthly once registered).

### 13.2 Payments

**SSLCommerz live merchant account** — assemble before applying:

- [ ] Merchant Enrollment Form (MEF)
- [ ] Trade licence copy · DBID · e-TIN certificate · VAT/BIN document
- [ ] NID of proprietor / all directors
- [ ] Business bank account details matching the trade-licence name (cheque leaf or statement)
- [ ] If limited company: Certificate of Incorporation, MoA/AoA, board resolution
- [ ] Live website/app with **publicly visible** Terms, Privacy Policy, Refund/Return Policy, Contact page with a real address and phone — gateways reject on missing policy pages more often than on documents
- [ ] Sandbox integration tested end-to-end (IPN + validation API before entitlement, per the architecture) before requesting live keys

**bKash** — accepted through SSLCommerz initially (nothing extra to do). A direct **bKash merchant/PGW account** (NID, trade licence, bank account, live site; ~1.5–2% per transaction) is worth applying for at month 6+ for better rates and the co-marketing door (§4.6). Keep the abstraction: all buyer-side charges go through the `PaymentProvider` interface, so adding bKash direct is an adapter, not a migration.

**Seller payouts** — manual bank/bKash/Nagad, monthly on the 1st, 7-day hold, minimum ৳1,000. Operational requirements: seller KYC before first payout, encrypted payout details, a transfer reference recorded per payout, and a seller statement PDF. Keep a payout reconciliation sheet from day one — this is where money goes missing quietly.

### 13.3 Terms of Service — essentials

- [ ] Parties, definitions, and that the **school is the data controller** for student data while Acadigma is the processor — this single clause answers most principal questions about ownership
- [ ] Subscription terms: plan, price in BDT, billing cycle, renewal, 14-day Pro trial, what happens at trial end (**downgrade to Free, over-limit data becomes read-only, never deleted** — state it explicitly)
- [ ] Cancellation, refund policy, and **data export on request** (a named format and a stated turnaround)
- [ ] Marketplace terms as a separate schedule: seller obligations, IP warranty, 30% commission, payout schedule and minimum, refund window (7 days), takedown process, prohibited content
- [ ] Acceptable use; suspension for non-payment with notice periods; limitation of liability; governing law = Bangladesh, courts of Dhaka
- [ ] Uptime expectation stated honestly (no SLA you can't meet as a solo founder — "commercially reasonable efforts" with a published status page beats a fake 99.9%)

### 13.4 Privacy policy — children's data essentials

The **Personal Data Protection Act 2026 (Act 63 of 2026)** requires parental consent for processing children's data, prohibits tracking, profiling and targeted advertising directed at children, and carries criminal penalties (reported, under the earlier repealed 2025 Ordinance, as up to 5–7 years' imprisonment and fines up to ৳20 lakh for serious violations, including misuse of children's data — **[FLAG: these figures have not been reverified against the enacted Act 63 of 2026 text; confirm before publishing]**). Your policy and your product must both reflect this — and the product decisions already point the right way (data minimisation, private buckets, audit trails, no student PII in AI prompts beyond first name + grade). (amended per SYNTHESIS, rows C-01, C-26)

- [ ] **What is collected** per role — student, guardian, teacher, staff — stated in plain Bengali and English
- [ ] **Lawful basis and consent:** the school obtains guardian consent at admission; provide schools with a **consent clause they can paste into their own admission form** (ship this as a template — it removes a genuine blocker and is a great lead magnet)
- [ ] **No advertising, profiling or tracking of children. Ever.** State it flatly; it is both law and your strongest trust line in a demo.
- [ ] **No student PII in AI prompts** beyond first name and grade — already a product rule; say it publicly
- [ ] Retention periods; deletion and export rights; the 30-day account-deletion grace
- [ ] Sub-processors named (Supabase, Vercel, Anthropic, SSLCommerz, Resend) with their regions
- [ ] Security measures summarised: row-level tenant isolation, private storage with signed URLs, encryption of payout details, append-only audit, annual penetration test
- [ ] Breach notification commitment and a contact address
- [ ] Candidate document consent for hiring (time-limited, revocable — already specified)
- [ ] A **Bengali version of equal standing**, not a machine translation

### 13.5 Invoicing and VAT

- [ ] School invoice PDF carrying your BIN and the school's BIN/VAT fields, sequential invoice numbers, and VAT shown as a separate line once registered
- [ ] Buyer receipt for every marketplace order; seller monthly statement
- [ ] Mushak 6.3 (VAT challan) compliance once BIN-registered; monthly Mushak 9.1 return
- [ ] Withholding tax on seller payouts — **confirm treatment with an accountant before the first payout**; get it wrong once and reconciling it is painful
- [ ] Keep books from month 1 (a spreadsheet is fine): revenue by school, marketplace GMV and take, payouts, refunds, ad spend, infra. You need this for tax, for pricing decisions, and for any future investor.

### 13.6 Operational

- [ ] Business email on your own domain (a gmail.com address costs you credibility with school owners)
- [ ] A published status page and an incident-communication template in Bengali
- [ ] Daily backups verified by an actual restore test (Supabase Pro at R1 launch)
- [ ] Authorized penetration test completed and summarised into the one-page security sheet before the first paid school
- [ ] A signed one-page **Data Processing Agreement** offered to every school — most won't ask, but the one that does is usually your biggest prospect
- [ ] Insurance and formal contracts: skip in year 1 for proprietorship; revisit at Enterprise

---

## 14. Sources

Market and channel facts cited above, accessed 2026-09-17. Figures from commercial trackers vary by methodology — where two sources disagree (notably TikTok's Bangladesh user count), both are noted and the conservative figure is used for planning.

1. **DataReportal — Digital 2026: Bangladesh** (internet users ~82.8M, penetration 47.0%; social media identities). https://datareportal.com/reports/digital-2026-bangladesh
2. **NapoleonCat — Social Media Users in Bangladesh, July 2026** (Facebook 74.87M / 41.3%; Messenger 71.12M / 39.3%; Instagram 11.29M; LinkedIn 13.98M). https://stats.napoleoncat.com/social-media-users-in-bangladesh/
3. **Datambar — Bangladesh Social Media Usage Trends 2026** (Facebook ~95% daily login rate; YouTube ~24M users, ~89% daily usage; WhatsApp ~22M / ~13%; TikTok ~15M — note ad-tool reach figures for TikTok run far higher, ~56M aged 18+, which reflects reach not unique users). https://datambar.com/en/social-media-global-trends-bangladesh/
4. **StatCounter — Mobile Operating System Market Share Bangladesh** (Android ~95.2%, iOS ~4.65%, July 2025). https://gs.statcounter.com/os-market-share/mobile/bangladesh
5. **The Daily Star — Bangladesh offers 12th cheapest mobile data in the world** (~৳33 / US$0.32 per GB). https://www.thedailystar.net/tech-startup/news/bangladesh-ranks-12th-worldwide-terms-receiving-data-low-prices-3156891
6. **bKash — About**; **The Fintech Times — Bangladesh's Fintech Ecosystem in 2026** (83M+ bKash customers as of April 2026; 350,000+ agents, 900,000+ merchants; ~146.4M MFS accounts nationally). https://www.bkash.com/en/about · https://thefintechtimes.com/south-asian-nation-of-bangladeshs-fintech-ecosystem-in-2026/
7. **BANBEIS — Bangladesh Education Statistics** (secondary institution counts; registered English-medium institutions ~142–148). https://banbeis.portal.gov.bd/
8. **The Business Standard — Enrolment doubles in a decade: the growing appeal of English-medium education** (>21,000 registered secondary schools, ~148 English-medium; >1,700 institutions including semi-English and KG). https://www.tbsnews.net/features/pursuit/enrolment-doubles-decade-inside-growing-appeal-english-medium-education-1383736
9. **Daily Sun — English Medium Schools and Private Coaching Menace** (Bangladesh Kindergarten Owners Association: ~2,000 English-medium kindergartens, ~450,000 students). https://www.daily-sun.com/5/656638
10. **Educational Institute Identification Number (EIIN)** and **BANBEIS** overviews (EIIN scope: secondary, colleges, technical, Alia madrasas — _not_ most KGs). https://en.wikipedia.org/wiki/Educational_Institute_Identification_Number
11. **Teacher-training infrastructure** — 99 teacher training colleges (14 public, 85 private); **NAEM** (in-service training for secondary heads and college principals); **NAPE** (primary). https://en.wikipedia.org/wiki/National_Academy_for_Educational_Management · https://naem.portal.gov.bd/
12. **GSA Teletalk / government school admission portal** (academic year 1 Jan–31 Dec; 2026 admission circular published 3 November 2025; application fee ৳110). https://gsateletalk.com.bd/ · https://admissionwar.com/en/govt-school-admission-circular/
13. **Facebook ads cost benchmarks, Bangladesh 2026** (CPM ~৳85–280 by industry, SaaS/B2B at the top of the range; CPC ~৳5–20; CPMs 2–3× during Eid seasons). https://www.morshedpp.com/blog/facebook-ads-cost-bangladesh-2026 · https://arafatlabs.com/blog/facebook-ads-cost-bangladesh-2026-benchmarks
14. **SSLCOMMERZ — Onboarding Requirements** (DBID, TIN certificate, Merchant Enrollment Form, trade licence, VAT document; NID of proprietor/directors; incorporation documents for limited companies). https://sslcommerz.com/onboarding-requirements/
15. **bKash — Merchant / Business** (merchant registration requires NID, trade licence, bank account, website or app; transaction fee ~1.5–2%; personal retail accounts for businesses without a trade licence). https://www.bkash.com/en/business/merchant
16. **NBR / Bangladesh Trade Portal guidance on trade licence, e-TIN and VAT (BIN) registration** (sequence and 2–6 week timeline; VAT registration via vat.gov.bd, Mushak 2.1). https://www.bangladeshtradeportal.gov.bd/index.php?r=searchProcedure%2Fview1&id=77 · https://juralacuity.com/vat-registration-process-in-bangladesh/
17. **Personal Data Protection Act 2026 (Act 63 of 2026), Bangladesh** — re-cited per SYNTHESIS row C-01; supersedes the repealed 2025 Ordinance previously cited here (parental consent for children's data; prohibition on tracking, profiling and targeted advertising directed at children; penalty figures below were reported under the repealed Ordinance and are flagged, not confirmed, against the enacted Act text: up to 5–7 years and fines up to ৳20 lakh). https://securiti.ai/bangladesh-personal-data-protection-act-overview/ · https://mahbub-law.com/key-highlights-of-the-personal-data-protection-ordinance-2025-for-businesses/ **[source URLs still describe the superseded Ordinance draft — re-verify against the enacted Act 63 of 2026 text before citing further]**
18. **Competitive landscape — Bangladeshi school management software** (Shikkha from ~৳50,000; Pipilika Soft, Addie Soft i-School, Smart Academic System, BD Tender E-School; predominantly module-priced/one-time licence, desktop-era, office-centric). https://shikkha.biz/ · https://pipilikasoft.com/best-school-management-software-in-bangladesh/ · https://www.bidyaan.com/blog-details/best-school-management-software-in-bangladesh-2026
19. **Bangladesh International Education Expo (64th, ICCB Dhaka, July 2026)** — noted as _study-abroad_ focused and therefore not a school-software buyer venue. https://bangladeshinternationaleducationexpo.com/ · https://www.tbsnews.net/economy/corporates/three-day-bangladesh-international-education-expo-begins-dhaka-23-july-1491936

**Internal sources:** `docs/product/PRD.md` (release map §4, success metrics §3, NFRs §6) · `docs/product/PRODUCT-DECISIONS.md` (plan matrix §5.1, trial §5.2, commission §4.3, payouts §4.2, moderation §4.4, KYC SLA §4.5, digital rights §4.7, school-funded purchases §4.6) · `docs/product/GLOSSARY-EN-BN.md` (all Bengali terminology).
