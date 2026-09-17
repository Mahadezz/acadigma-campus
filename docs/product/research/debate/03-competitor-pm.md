# Adversarial review 03 — the incumbent's product head

**Critic #3 of 5.** Persona: Head of Product at an established Bangladeshi school-ERP vendor — several hundred paying institutions, field agents in a dozen districts, biometric and RFID hardware bundles, an SMS resale margin that pays for the field agents, a bKash biller integration, and a Play Store app whose rating I do not put on slides.

I have read the whole plan: `COMPETITORS.md`, `PRICING-AND-SALES.md`, `VOICE-OF-CUSTOMER.md`, `GO-TO-MARKET.md`, `TEACHER-SIDE.md`, `PRD.md`, `PRODUCT-DECISIONS.md`, `ROADMAP.md`, `FUTURE.md`, plus `COMPLIANCE-PDPA.md` where the competitive research pointed at it.

**Credit where it is due, so you know I am not just posturing.** The SSLCommerz numbers are right (৳25,500 one-time, 2.5% standard, 3.5% AMEX — [sslcommerz.com/pricing](https://sslcommerz.com/pricing/)). The BD GPA spine is right, including F ⇒ GPA 0.00 and the 4th-subject rule being flagged as a gap. The decision to keep the school as merchant of record for fees is the correct regulatory answer and it takes a real attack away from me. `COMPLIANCE-PDPA.md` is the best document in the set and is materially better than the competitor research it supposedly supports. And the Teachmint ERP-exit finding is real: multiple 2026 comparison sources report Teachmint shutting down its school-ERP line from April 2026 while teachmint.com now leads with Teachmint X hardware ([EdunodeX comparison, 2026](https://edunodex.in/blog/edunodex-vs-teachmint-comparison-2026), [teachmint.com](https://www.teachmint.com/en-us)).

Everything below is what I would do to you on Monday.

---

## 1. Factual errors and flattering framings about my industry

Fifteen. Each one quoted from your own documents, corrected, sourced.

### 1.1 "The only published BD price" — three more were published, in your own sibling document

> `COMPETITORS.md §1.2`, Smart Academic System row: "**Published — the only one found.** Setup **৳10,000** (all tiers) + monthly per student…"
> and `§8.2`: "**The BD market norm is per-student-per-month plus a one-time setup fee.** The only published BD price sheet found (Smart Software Ltd)…"

**Wrong, and contradicted 40 pages later in the same research bundle.** `PRICING-AND-SALES.md §2` tabulates three further published BD price sheets. I re-verified all three today:

| Vendor             | Published price                                                                                                                                  | Verified                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Bidyaan (DevsZone) | সূচনা ৳10 / বিবর্তন ৳15 / উত্তরণ ৳20 per student per month                                                                                       | [bidyaan.com/pricing](https://www.bidyaan.com/pricing) |
| Edufy (Softifybd)  | Basic ৳2,000 (0–300 students) → ৳16,000 (5,001–8,000); Standard ৳2,500 → ৳20,000; Premium ৳4,000 → ৳40,000; one-time ৳2,000/3,000/5,000; +5% VAT | [edufy.com.bd/pricing](https://edufy.com.bd/pricing)   |
| Sheba Shikkha      | Basic ৳10 / Standard ৳15 / Premium ৳20 per student per month, identical features across tiers                                                    | [shebashikkha.com](https://shebashikkha.com/)          |

Whoever writes your pricing page from `COMPETITORS.md` will anchor against one vendor's ladder and miss that the market's published shape is **per-student ৳10–20 with everything bundled**, or **base-by-band plus one-time**, which is what you will actually be compared against in the room.

### 1.2 Bidyaan described as having no pricing and "marketing-only public presence"

> `COMPETITORS.md §1.2`, Bidyaan row: "Pricing (public): **Not published** … Weaknesses / risks: **Marketing-only public presence**"

Bidyaan publishes a full three-tier grid and its actual differentiator is hardware: **free biometric device at ৳15/student, free face-recognition device at ৳20/student**, plus domain, free hosting and a dynamic website, with _unlimited_ attendance / late / notice / payment SMS in every tier ([bidyaan.com/pricing](https://www.bidyaan.com/pricing), verified 2026-09-17). Calling that "marketing-only" is how you end up surprised in a sales call when a principal says "the other people are giving me a fingerprint machine for free."

### 1.3 Edufy described as not publishing pricing

> `COMPETITORS.md §1.2`, Edufy row: "**Not published.** Their own blog states the BD market average is **BDT 10,000–50,000 per year**"

Edufy publishes a complete tier × student-band grid up to ৳40,000/month, names its one-time charges, states "+5% VAT applicable on all fees," and lists **iOS app, payment gateway and a white-label licence as chargeable add-ons** (verified). Your matrix then uses the blog's ৳10,000–50,000/year as "the most-cited market number" while the vendor's own price list says a 5,000-student school pays ৳480,000/year on Premium. You have anchored your entire pricing narrative on the bottom of a range whose publisher sells 40× above it.

### 1.4 The largest self-reported incumbent is missing from the vendor table entirely

> `COMPETITORS.md §1.1`: "The largest verified player by self-reported scale is **School360** (Spate Initiative Ltd), claiming 996+ schools / 470,800+ students"

**Eduman** (Leadswin Limited) claims **5,000+ institutions, 60,000+ teachers, 3,000,000+ students, 40+ districts**, with auto fee collection, bulk SMS, result processing, device integration and a live bKash merchant number on the homepage ([edumanbd.com](https://edumanbd.com/features/), [Eduman Prime](https://prime.edumanbd.com/about)). That is five times School360's claim. Eduman appears **nowhere** in `COMPETITORS.md` — it surfaces only in `VOICE-OF-CUSTOMER.md §2a` as two apps ("Eduman – Staff", "Eduman – Admin") with "50+" installs, and nobody joined the two facts up. You built a competitive map and left out the largest player on it.

While we are here: "the largest **verified** player by **self-reported** scale" is a sentence that cancels itself out. Nothing in §1.1 is verified. Which brings me to:

### 1.5 Vendor scale claims repeated credulously, in a document that flags everything else

> `PRICING-AND-SALES.md §2`: "Claims 200+ schools, **500,000+ active students**, 40+ districts."

500,000 students across 200 schools is **2,500 students per school**. There is no population of 200 Bangladeshi private schools averaging 2,500 students. That is a cumulative registration count with dormant institutions in it, and it should have been flagged the way you flagged Edufy's blog. Your own `VOICE-OF-CUSTOMER.md §1` proves you know how to do this — it catches School360's "cluster of long, marketing-toned five-star reviews all posted within three weeks of each other." The scepticism is applied to our reviews and not to our numbers.

### 1.6 "No government school-ERP product" — IEIMS exists, it is live, and it is free

> `COMPETITORS.md §1.3`: "**a2i / ICT Division** — no evidence found of a government school-ERP product competing with commercial vendors. Government activity is portals, content and teacher training."
> `PRICING-AND-SALES.md §5`: "I found **no evidence of a current free-software programme** that would displace a paid product"

**Establishment of Integrated Educational Information Management System (IEIMS)** is a live Secondary and Higher Education Division / BANBEIS project with its own officer cadre, rolling out **Student Unique IDs** and institution logins keyed to EIIN, where institutions submit "details on student enrollment, teacher profiles, and institutional operations," and "the process has no fees." It is already installing software and hardware at the boards, including the Madrasah Education Board. Sources: [shed.gov.bd IEIMS project page](https://shed.gov.bd/pages/static-pages/694146bca31054345f0fca1d), [banbeis.gov.bd/site/view/officer_list_category/IEIMS](https://banbeis.gov.bd/site/view/officer_list_category/IEIMS), [EIIN — Wikipedia](https://en.wikipedia.org/wiki/Educational_Institute_Identification_Number), [Student Unique ID form guidance](https://allresultbd.com/student-unique-id-form/). DSHE separately runs **EMIS** ([emis.gov.bd](https://emis.gov.bd/)) as the MPO / institution / teacher spine.

Why this matters more than it looks: IEIMS/EMIS data entry is **unpaid work the school hates**, and my field agents do it for free as a retention service. It is the stickiest thing I own and it is not in your product, your roadmap or your competitive map. You wrote "Government activity is portals, content and teacher training" — that was true in 2019.

### 1.7 The PDPA section omits data localisation, which is the only fact that can move your architecture

> `COMPETITORS.md §6.3`: "**Cross-border transfer is a live question.** Supabase and Vercel host outside Bangladesh… **Region selection and a transfer-safeguards note need an owner decision.**"

The competitive research lists consent, children under 18, sensitive categories, the NDMA, breach notification and the ৳25/50 lakh fines — and omits the **localisation limb**, which is the one that matters to me:

- Data classified **"confidential" or "restricted" must be stored within Bangladesh** ([SCL Insights](https://bd-scl.com/insights/personal-data-protection-ordinance-2025-compliance.html), [security.land](https://www.security.land/bangladesh-data-protection-law-localization/)).
- Organisations on foreign cloud infrastructure must keep **at least one synchronised real-time copy inside Bangladesh** (reported as Article 29, security.land).
- **Advance regulatory approval** for bulk transfers of sensitive identifiers (fingerprints, DNA, NID numbers, passports).
- Government may order cessation of a foreign cloud service within **60 days** on national-interest grounds.
- Enforcement machinery has an 18-month runway to approximately **May 2027**.

Your own `COMPLIANCE-PDPA.md §1.7` says it plainly — "the brief did not mention **localisation**, the one fact that could force an architecture change" — and §5.5 concedes "Acadigma Campus stores **100% of its data in Mumbai** … **our current architecture does not comply**," then parks the decision at **"decide by Q2 2027."**

So the competitive research under-describes the risk, and the compliance research correctly describes it and defers it past the window in which this market gets decided. See §2.1. This is my best weapon and you handed me the ammunition in your own repository.

### 1.8 The feature matrix scores my distribution model as absent

> `COMPETITORS.md §7`: "White-label app in the school's own name | S360: **✘** | SAS: ✘ | PSoft: ✔"

School360 runs an explicit area-entrepreneur programme with a white-label option — "opportunities for IT institutions or small entrepreneurs to work through a 'white label' (in their own institution's name) method" ([school360.com.bd/reg](https://school360.com.bd/reg)) — and Edufy's Enterprise tier bundles "1 Copy White Label License" (verified on their pricing page). `PRICING-AND-SALES.md §6` gets this right and quotes the recruiting line verbatim. `COMPETITORS.md §7` scores it ✘.

That matters because white-label reselling is not a feature, it is **the dominant BD distribution model**, and your matrix codes it as a gap in my product rather than as the channel that puts my logo in Bogura and Sylhet while you are driving to Uttara.

### 1.9 "White-label apps are an operational tax" — they are a review-laundering machine, and you spotted it and forgot it

> `COMPETITORS.md §7c`: "**White-label apps published under each school's own name** … It is an agency business model masquerading as a product feature"
> `VOICE-OF-CUSTOMER.md §2b`: "Entab ships per-school white-label builds … so there is **no aggregate review base to mine**. `[INFERENCE]` The per-school-build model **hides** bad reviews by fragmenting them — a distribution strategy worth noting, and one Acadigma may want to consider"

Two documents, opposite conclusions, neither referenced by the other. The second one is correct and it is the reason my org tolerates the operational tax. A fragmented review base means no journalist, no principal and no competitor can ever compute my real rating. Your single-brand Play listing will carry every bad month you have, publicly, forever — and your own VOC data shows what Bangladeshi users do to a school app that fails during an exam ("dozens of 1★ reviews are pure Bengali profanity").

### 1.10 "None exist" for Bangla teacher marketplaces — your own review corpus lists one

> `COMPETITORS.md §3.4`: "**None exist.** Searching for Bangla/Bangladeshi teacher-resource marketplaces returns only…"

`VOICE-OF-CUSTOMER.md §2a`, same bundle, same day, lists **"Teachers BD (tutor marketplace) — com.techsoft24.teachers_bd — 4.26★, 46 ratings, 10K+ installs."** And `TEACHER-SIDE.md §2.1` documents "the existing informal market" for materials running at scale inside Facebook groups, with the tuition-media layer (Dhaka Tuition Media 163K, টিউশনির অভিজ্ঞতা 89K) already intermediating teacher supply for a 40–50% fee.

The honest claim is "**no BD teacher-material marketplace with payment rails, verification and search exists**." That is still a real opportunity. But "none exist" is the framing that makes a 45-part R3 commerce build feel like uncontested ground, when the contest is actually against _free_, which is the hardest price to beat and which `§3.4` itself identifies as "the single highest-risk assumption in the product" two paragraphs later.

### 1.11 Two BANBEIS English-medium numbers, three market sizes, one beachhead

> `COMPETITORS.md §6.1`: "BANBEIS (Bangladesh Education Statistics 2022) counts **137 English-medium schools with 71,456 students**"
> `PRICING-AND-SALES.md §5`: "Registered English-medium schools — **140 schools, 68,825 students, 6,453 teachers**"
> `GO-TO-MARKET.md §1.1`: "**~142–148** formally registered as English-medium at secondary level; **>1,700 institutions** including semi-English and KG chains"

Three documents, three figures, one source organisation, no reconciliation. Your whole Tier A beachhead — "10 schools in six months is ~3–6% of the segment" — rests on which of these a reader happens to pick up. And note what all three agree on: the registered English-medium segment **cannot support the business**, which `§6.1` says out loud and the GTM's 90-day plan then ignores by spending all 13 weeks there.

### 1.12 "I could not verify complaints" vs 26,900 harvested reviews

> `COMPETITORS.md §1.4`: "**I could not verify complaints.** Play Store review text was not retrievable through the available tooling, no BD software review site exists… **Inferred pain points (all unverified)**"
> `VOICE-OF-CUSTOMER.md §1`: "Raw reviews harvested **~26,900** … of which from Bangladeshi publishers **8,571** (2,581 of them 1–3★)"

One researcher declared my industry's complaint data unobtainable; another pulled 26,900 rows of it the same day. Nobody merged them. The consequence is substantive, not cosmetic: `§1.4`'s four inferred pain points lead with "**The teacher is not the customer**," while the actual measured negative-review distribution is media/upload 15.6%, speed/crash 13.3%, parent–teacher comms 11.8%, notifications 10.6%, login/OTP 8.7%. The VOC doc even warns you: "the 60 seconds only counts if the teacher can get into the app at all."

If your positioning is built from `COMPETITORS.md §1.4` you will attack me on a weakness that is real but third-order, and leave the top three untouched. I would rather fight you on "teachers aren't the customer" than on "your app takes 40 seconds to load and the OTP doesn't arrive."

### 1.13 SMS framed as a cost to pass through — it is the margin line that funds my field force

> `COMPETITORS.md §7c`: "Provide SMS as metered pass-through with per-parent channel preferences — **never sell 'unlimited'**"
> `PRICING-AND-SALES.md §11`: "**SMS — ৳0.35/SMS**, 500 included/month on Pro"

Correct on the risk, wrong on the economics. At volume a BTRC-enlisted aggregator sells masking well under the ৳0.25 retail floor your research quotes ([Zaman IT ৳0.25 retail](https://zaman-it.com/sms/)); we buy wholesale and bill schools ৳0.35–0.50 without anyone ever auditing the count. **SMS is 15–30% of my revenue per school and close to 100% gross margin on the spread.** Deciding to run it at cost is a decision to fund no field agents, ever — and field agents are how this market is actually covered.

You also name the wrong gate:

> `COMPETITORS.md §5.1`: "Institutional masking sender IDs require a **signed, sealed authorisation letter from the head of institution** — that is lead time, not just money."

The binding gate is **BTRC enlistment**: all A2P traffic must flow through a [BTRC-listed aggregator](http://old.btrc.gov.bd/notice-board/name-list-enlisted-a2p-sms-service-provider-sms-aggregator-0), and each sender ID needs per-operator approval submitted through that aggregator with the registered company name, trade licence, TIN certificate and the NID of the authorised person — typically 2–5 working days across GP, Robi, Banglalink and Teletalk, with route suspension if masking and non-masking traffic are misclassified. Your `ROADMAP.md` line 3.11 budgets **2 "glue" parts** for "SMS adapter … provider behind flag, sender-ID onboarding checklist." That is a procurement, regulatory and per-school paperwork workflow, not two parts.

### 1.14 Teachmint cited as a live comparable in one document and as dead in another

> `PRICING-AND-SALES.md §3`: "**Teachmint** | India | **Free-forever tier** + custom enterprise quote"
> `COMPETITORS.md §2.2`: "Teachmint **ceased selling school ERP from April 2026** … If true: the best-funded pure-play teacher-first ERP in South Asia retreated to hardware."
> `COMPETITORS.md §9`: "**Teachmint's ERP exit is unconfirmed** and, if true, is the most important competitive datapoint in this document."

You flagged it as the most important datapoint in the document and then left a sibling document citing the dead product as a live pricing comparable. My check corroborates the exit reporting. For me the lesson is not schadenfreude — it is that **the best-funded teacher-first ERP in South Asia could not make the teacher-first ERP economics work and went to hardware.** That is the argument I will make to your investors and to any principal who asks "why hasn't anyone done this."

### 1.15 "No BD competitor has a free tier" — the free competitor is the government, and the free _thing_ is hardware

> `COMPETITORS.md §8.2`: "Free | ৳0 | 150 | **Correct. No BD competitor has a free tier. Strong wedge**"

Three corrections. (a) The ৳0 competitor in this market is **IEIMS/EMIS** (§1.6) plus Shikkhok Batayon plus a Facebook group — none of which you can out-price. (b) bKash enables **cantonment institutes' education fees free of charge** and has run cashback promotions on named schools' fee payments ([Prothom Alo](https://en.prothomalo.com/corporate/local/47p6j6lzwr)) — free is already a competitive instrument in the fee rail you do not yet occupy. (c) In the paid market "free" does not mean a SaaS tier, it means **capex you do not have to spend**: Bidyaan's free biometric at ৳15 and free face-recognition device at ৳20. A 150-student free tier is invisible next to a free fingerprint machine, because the principal is comparing a monthly line against a one-off ৳9,000 purchase order she does not have to raise.

**Minor, but symptomatic of the bundle not being cross-read:** `COMPETITORS.md §6.4` reports "bKash merchant reportedly **1.5%** (**unverified** — Facebook-sourced)" while `PRICING-AND-SALES.md §4` reports **1.85% standard**, sourced to [bkash.com](https://www.bkash.com/en/products-services/payment). And `FUTURE.md` still says "**Fee management / tuition invoicing to parents** — Belongs to Admin (finance) app," while `PRD.md §4` Amendment D-27 moves fees into R1.5 and `ROADMAP.md` M4 builds 14 parts of it, and `GO-TO-MARKET.md §1.5` objection 12 still scripts the founder to tell principals "**Not in this version**" and `§1.2` still lists fee-first schools as **anti-ICP**. Four documents, three answers, on the flagship module of this market.

---

## 2. How I kill Acadigma in twelve months

Ranked by expected damage per taka. I do not need to build a better product. I need to make the next twelve months not exist for you.

### 2.1 — "Your children's data is in India." (Highest effectiveness, lowest cost, hardest to answer)

A single-sided Bengali A4, in every school in your beachhead thanas, carried by agents who are already going there:

> **আপনার শিক্ষার্থীদের তথ্য কোথায় থাকে?** — Under the Personal Data Protection Act 2026, data classified confidential or restricted must be stored inside Bangladesh, and a foreign cloud requires a synchronised real-time copy inside Bangladesh. _Their servers are in Mumbai, India._ Ours are in Dhaka.

Cost: ৳15,000 of printing. Why it works:

- It is **substantially true**. `COMPLIANCE-PDPA.md §5.5` says "Acadigma Campus stores 100% of its data in Mumbai … our current architecture does not comply," and your own mitigation plan defers the fix to "**decide by Q2 2027**" — six months after this fight is over.
- In Bangladesh "your children's data is in India" is not a technical argument. It is a political one, and **no managing committee can be minuted as having ignored it**.
- Your honest answer requires explaining Article 29, adequacy lists that do not exist, and a Q2-2027 roadmap item. Mine fits on a leaflet.
- Your rebuttal costs you money and architecture; my attack costs me a photocopy.

I deploy this at the KG owners' association AGM you plan to speak at (`GTM §4.5`), at every school running one of your pilots, and as a comment under every Facebook post you make. Your `PRD.md §6` Privacy row does not mention residency at all; your public privacy policy will have to name Mumbai; I will screenshot it.

### 2.2 — Free hardware plus an un-comparable bundle

Bidyaan already wrote this playbook and it works because it defeats arithmetic. I bundle a free biometric/RFID terminal (my capex ৳4,000–9,000, amortised over a 36-month contract = ৳110–250/month) with unlimited attendance/notice SMS and a free dynamic website, at ৳10–15/student.

Your research tells you the right response — `PRICING-AND-SALES.md §12`: "**Don't bundle hardware.** That is a working-capital game a solo founder cannot fund." You are correct. That is precisely why I do it. The principal does not compare ৳2,999 against ৳4,500; she compares "software" against "software + a machine + unlimited SMS + a website," and she cannot run your per-student division because I never quote her a per-student number for the bundle.

Your counter is `PRODUCT-DECISIONS §3.10` — no biometrics, ever, on PDPA grounds. That is legally right and commercially a gift: you have converted a checkbox into a principle you cannot flex, and I will make sure every RFP and every checklist she is handed has that line on it.

### 2.3 — Take the fee rail in the Sep–Dec window, before R1.5 exists

Your `GTM §1.4` publishes your own calendar: Sep–Oct is the pilot window, Nov–mid Dec is prove-value, **close every pilot before 15 January**. Your fee module is `ROADMAP` M4 — **62 parts**, behind a 54-part M3 launch gate. Even at four parallel streams that is not January.

So from October my agents offer, free, in your thanas: fee-structure setup, invoice runs, a bKash pay-by-Student-ID link, and a 24-month collection agreement. Once school fees flow through my rail, **nobody rips out the thing that collects the money mid-year** — not for faster attendance, not for prettier report cards. Your own research says it: "A school will not replace its existing system with one that cannot collect money, no matter how fast attendance is."

And I have the rails already. bKash Education Fee is live for roughly 1,000 institutions with instant digital receipts and `*247#` for feature phones ([bKash Education Fee](https://www.bkash.com/en/products-services/education), [TBS](https://www.tbsnews.net/economy/corporates/bkash-apps-education-fee-icon-revamped-more-user-friendly-features-462558)), bKash runs a dedicated [Educational Institutions](https://www.bkash.com/en/business/educational-institutions) business line, and vendors like Eduman publish a bKash merchant number on the homepage. Your `PRD §7` says live SSLCommerz keys arrive "before R3 launch." Mine arrived years ago.

### 2.4 — Poach the pilots. You published the target list.

`GTM §1.2` names the beachhead down to the thana: Mirpur, Uttara, Mohammadpur, Bashundhara, Badda, Dhanmondi fringe, Khulshi, Halishahar, Chandgaon. 150–700 students. Owner reachable in one hop. `§3.6` gives the funnel: 400 contacts → 100 replies → 50 demos → 20 pilots → 10 paid.

My agents work those nine thanas from October. Any school seen running your pilot gets: **12 months free**, free migration (you built the CSV export for me — `PRD §6`: "data export and deletion for schools on request"), a free biometric terminal, and I pay their SMS for a year. All-in ~৳40,000 per stolen pilot. Ten of them costs me ৳400,000 — less than one mid-level salary — and it costs you the reference customers that your entire Phase-2 referral engine (`PRICING §12`) is built on. You cannot manufacture referrals from schools that left.

### 2.5 — Hire the champion

`GTM §1.3`: "**Champion (your real target)** — the office admin/IT person _or_ one enthusiastic class teacher," and "never onboard without the champion having admin access." Every school in Bangladesh has that person and they are underpaid.

I offer them a district-agent contract on exactly the terms your own pricing doc recommends and cannot yet fund: **100% of months 1–3 plus 10% recurring** (`PRICING §9.5`). Your champion becomes my agent. The school you onboarded becomes my lead source. This is cheap, it is invisible, and it is completely legal.

### 2.6 — Copy the phone-first UI, on a clean Play listing

The uncomfortable one. Sixty-second attendance is three screens: section list → pre-filled present, tap the absentees → save. That is a sprint, not a moat. What is genuinely hard for me is my per-school install model and my app's rating — which is why I do **not** ship it into my existing listing.

I ship **"Teacher Lite" as a separate Play listing**: new package name, new review pool, 6 MB APK, Bangla-first, attendance and marks only, free for any school on my platform. The old app keeps the old reviews. Your own `VOICE-OF-CUSTOMER.md §2b` identified this mechanism in Entab's per-school builds and called it "a distribution strategy worth noting, and **one Acadigma may want to consider**." I read that note too.

Eighteen months from now my Lite app is as fast as yours and you have spent your differentiation. Meanwhile you carry every bad month on one public listing.

### 2.7 — Own the board and IEIMS ground

My agents already file IEIMS/EMIS data and Student Unique ID forms for my schools as a free retention service (§1.6). I turn it into a named module — "IEIMS/EMIS প্রস্তুত এক্সপোর্ট" — and I ship a field update the same week any board circular lands.

Your `GTM §4.5` identifies this exact play — "'Acadigma updated it the same week the circular came out' is the most powerful word-of-mouth available in this market, and it costs one afternoon of engineering" — and then puts it behind a solo founder who is also building 275 parts, running 400 outreach contacts and doing WhatsApp support at 20:00. **One person cannot watch eleven boards.** I have a compliance analyst whose only job is that.

### 2.8 — Match the free tier and out-give it

I publish ৳0 up to 200 students, funded by the SMS spread on my paid base. It does not need to be profitable. It needs `COMPETITORS.md §8.2`'s "No BD competitor has a free tier. Strong wedge" to be false by the time your pricing page goes live.

Bonus: `ROADMAP` 3.12 puts a **"powered by Acadigma" footer on Free-plan PDFs**. That means a free school's প্রগতিপত্র goes home to 400 parents with a vendor's brand on the school's own document. I will photograph one and put it in the KG owners' group with the caption "আপনার স্কুলের প্রগতিপত্রে অন্যের নাম।" Owners in this market are proud. That single design decision is worth more to me than a month of ads.

### 2.9 — Buy the teacher supply before your marketplace exists

Your marketplace is pilot-gated to R3 (`ROADMAP` M6), with 50 sellers recruited eight weeks before launch (`GTM §6.1`). I spend **৳500,000 now** on a commissioned-content programme in the NTRCA and BEMSTA groups your `TEACHER-SIDE.md §1.1` maps so helpfully (999K, 785K, 585K, 43.2K members): ৳3,000–5,000 per Bangla question-bank or worksheet pack, 12-month exclusivity, published **free** inside my ERP to every school I have.

When your marketplace opens, the best 200 Bangla packs are already free somewhere else, and your sellers are asking why they should take 70% of ৳150 from a platform with no buyers. This is the cheapest permanent damage on this list and nothing in your plan detects it until R3.

### 2.10 — The Bangla-AI screenshot

I put "AI-Powered" on my ৳15 tier at no premium — Sheba Shikkha already does exactly this, and your own `PRICING §8` concludes "nobody in BD has yet successfully sold AI as a line item to a school." Then I wait. Your `TEACHER-SIDE.md §5.3` documents teachers reporting Bengali AI output "contains errors" and your own P0 #4 demands a Bangla quality gate. One garbled Bangla parent message, screenshotted into a 261K-member group, does more damage than my entire ad budget. It is a race between your Bangla QA gate and my screenshot, and I only need you to lose once.

### 2.11 — Win on paperwork

For Bangla-medium non-government schools I supply the managing-committee resolution template, my trade licence, VAT BIN, TIN, a three-year price lock and a signed AMC. `GTM §13` has all of this as a to-do list. A solo founder without a BIN-bearing invoice loses the committee school on the paperwork, never on the product, and never finds out why.

### 2.12 — Solo-founder FUD, for committees only

`GTM §1.5` objection 6 answers "what if you shut down" honestly and well — "Never oversell company size — solo-founder honesty converts better with school owners than fake corporate." That is true **with an owner who already likes him**. It does not survive a managing committee meeting he is not in the room for, and committees are where the Bangla-medium segment (the segment `COMPETITORS §6.1` correctly says he will eventually need) is decided.

---

## 3. Your assumptions, and how I exploit each one

| Assumption                                        | Where it lives                                                                                                                                                             | How I use it                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **The marketplace is a moat**                     | `PRD §5.4`, `COMPETITORS §7b.1` ("the strongest strategic asset in the product")                                                                                           | Your own maths: ৳6,750/year platform take at 100 schools; "~0.6% of revenue" at 1,000 schools; "not revenue before 5,000 schools" (`PRICING §7`). It is ~45 parts for 0.6% of revenue against a free government content portal with 650,000 teachers. **I want you to build it.** Every month in M6 is a month not spent on fees, SMS or device integration — the three things that decide the sale. I will even praise it publicly so you keep going. |
| **Hiring is an acquisition channel**              | `TEACHER-SIDE §10` P0 #1 ("highest-leverage change in this document"), `ROADMAP` 4.6 (scope "decided by the research debate (D-28)", 4–9 parts, undecided)                 | Either way I win a year. Pull it into R1 and you are building a job board with no demand side against Bdjobs (৳3,098–6,195 a post, a live Education category) and ~3.7M Facebook group memberships that are already free. Leave it in M4 and R0–R2 has, by your own researcher's admission, **no teacher-acquisition engine at all**. Meanwhile I run job postings free in my ERP for my hundreds of schools, which is demand you cannot manufacture.  |
| **SMS can wait / SMS is pass-through**            | `FUTURE.md` (provider deferred), `ROADMAP` 3.11 (2 glue parts), `PRICING §11` (৳0.35 at ~cost)                                                                             | "We don't send SMS yet" ends the meeting for any school whose parents are not all on smartphones — which is most of mine. And 2 parts does not cover BTRC aggregator enlistment plus per-school, per-operator sender-ID approval. You will discover the lead time in the week you need it. I bundle unlimited and never quote a unit price.                                                                                                            |
| **Fees can wait until R1.5**                      | `PRD §4` amendment, `ROADMAP` M4 (62 parts behind M3's 54)                                                                                                                 | See §2.3. This is the single biggest gift in the plan. I get an entire admission season with a fee rail you do not have, and `GTM §1.5` objection 12 scripts your founder to say so out loud.                                                                                                                                                                                                                                                          |
| **Vercel + Supabase abroad is a config decision** | `PRD §6` Availability, `COMPLIANCE-PDPA §5.5` ("decide by Q2 2027")                                                                                                        | See §2.1. Not a config decision — a leaflet.                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Solo-founder capacity**                         | `GTM §3.6` (Mon–Wed build, Sat/Sun/Thu sell, 20:00–21:00 support), `ROADMAP` (275 parts, 46 specs, 7-gate DoD, 11 CI checks, pgTAP per table, Playwright at two viewports) | I do not have to beat the product. I have to **outlast the calendar**. `PRD §8` lists "Owner availability for decisions" with the mitigation "PRODUCT-DECISIONS defaults apply until overridden" — that is a documented plan to ship unreviewed decisions at speed. I will be patient and well-staffed.                                                                                                                                                |
| **14-day trial**                                  | `PRODUCT-DECISIONS 5.2`, `GTM §3.4` (pilot "aligned to the 14-day Pro trial")                                                                                              | Wrong instrument, and `PRICING §12` already says so: "the value … only appears after a term." Fourteen days ends before one exam cycle, with a half-finished migration and a workspace that flips to read-only. I offer a **full-term demo ID**, which is this market's norm (`PRICING §6`). Yours expires; mine does not.                                                                                                                             |
| **Free plan at 150 students**                     | `PRD §5.4`, `PRICING §11` (Free at 60)                                                                                                                                     | Two different free caps in two documents, and either way it tops out exactly where a KG becomes worth selling to. Plus the "powered by Acadigma" PDF footer (§2.8). I match the tier and out-give it with hardware.                                                                                                                                                                                                                                    |
| **No biometrics, ever**                           | `PRODUCT-DECISIONS 3.10`, `COMPETITORS §7c`                                                                                                                                | Right on law, fatal on checklist. I make sure the checklist gets asked, and I bring a free device.                                                                                                                                                                                                                                                                                                                                                     |
| **QR ID cards substitute for biometrics**         | `PRD §5.2`, `COMPETITORS §7c` ("QR + signed token gets 90% of the value at 0% of the risk")                                                                                | Cards are lost, swapped and photographed. Proxy attendance by card is **the reason schools bought fingerprint readers in the first place.** One "the boys are scanning each other's cards" story in a parents' meeting answers your entire legal argument, and no citation of the PDPA answers back.                                                                                                                                                   |
| **"Schools browse only opted-in profiles"**       | `COMPETITORS §4.2`, `TEACHER-SIDE` P1 #8                                                                                                                                   | The day a teacher's current principal sees an `open_to_work` flag, your teacher-side trust story is over in every staffroom in Dhaka. Your research flags this correctly; the PRD does not yet have the "hide from my current school" control. I need one incident.                                                                                                                                                                                    |

---

## 4. What I genuinely fear

Honestly, and in order.

1. **Sixty-second attendance, demonstrated with a stopwatch, in a staffroom.** Not the number — the _method_. `PRD §3` puts it in e2e tests and a field test; `§6` puts LCP <2.5s and attendance save <300ms p95 in CI budgets. My teacher app is a desktop data-entry form ported to a WebView, and I know what my rating is. If your founder hands his phone to the oldest teacher in the room and she marks 40 students before he finishes his sentence (`GTM §1.5` objection 3), **my own teachers will ask me why our app is not like that** — and that conversation, inside my installed base, is the thing I cannot control.

2. **The 24-hour report card.** `GTM §1.5` objection 9: "Give me your current প্রগতিপত্র and I'll send back a generated one with your school's branding by tomorrow." This is the most dangerous sentence in your plan. It costs you an evening. It hits the exact artefact a principal is emotionally attached to. My equivalent is a support ticket, a developer, a template change and two weeks — because every one of my report cards is a per-school customisation. If you do this reliably for a hundred schools, you have a weapon I structurally cannot match.

3. **True multi-tenancy with RLS and pgTAP isolation tests gating CI.** My cost per school is an install and a support liability on a version I cannot patch; yours is a row. `ROADMAP` M0 0.3 lands this while the codebase is small, which is the right sequencing and the one I got wrong in 2017. If you reach 100 schools you are structurally cheaper than me forever, and you can ship a board-circular change to every school in one deploy while my agents patch three hundred instances. **This is the only thing in your plan that compounds against me.**

4. **The owner-visible append-only audit trail.** School owners in this market are not suspicious of software; they are suspicious of their own office staff. "You can see exactly who changed which mark, and when" sells directly to the person who signs the cheque, and it is the one feature I cannot retrofit onto a fifteen-year-old schema. `PRD §5.1` has it as a substrate, not a feature. Market it as a feature.

5. **The cover-teacher engine.** `F-OP-02`. A small, unglamorous module that solves an 8:05am crisis that happens every single day, computed from a timetable you already have. Nobody in BD or India has it. It demos in forty seconds, it is the kind of thing one vice-principal tells another vice-principal about in a corridor, and **I have no answer and nothing on my roadmap.** If I were you I would lead with this in every owner demo, not with AI.

6. **"School as merchant of record; not one row lands in Acadigma's revenue tables"** (`ROADMAP` M4 exit criterion). That is the correct answer to the regulatory question and it disarms the "they will sit on your fee money" attack I would otherwise run all day. Whoever wrote that understood the flow of funds better than most people selling fee modules in this country.

7. **The teacher-side network, if it ever spins.** A portable verified profile whose claims are evidenced by real work history in the system of record — sections taught, attendance consistency, lesson plans authored — plus earnings and job discovery. If that ever gets a flywheel, teachers will lobby their principals to displace me, and I cannot buy my way out because my product has **no teacher identity at all**, only staff records. I do not believe you get there in twelve months. If you did, it would be the end of my category.

---

## 5. If I were running Acadigma — ten changes, ranked

Mapped to your own documents. These are the changes that would make my job hardest.

| #      | Change                                                                                                                                                                                                                                                                                                                                                       | Where it lands                                                                                                                                                           | Why it hurts me                                                                                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Decide data residency before R1 launch, not Q2 2027.** Either (a) zero retention for NID/birth-certificate/KYC scans — verify, record a boolean, keep nothing — or (b) a Bangladesh-resident encrypted store for the sensitive subset. Then publish a Bangla **"আপনার তথ্য কোথায় থাকে"** page naming exactly what lives where.                            | `COMPLIANCE-PDPA §5.5` mitigations 1 and 5; new milestone alongside `ROADMAP` 3.13 launch hardening; `PRD §6` Privacy row                                                | Destroys attack §2.1 — my cheapest, most political weapon — and converts it into _your_ differentiator, because no incumbent can say it either. Do it before you have a public privacy policy naming Mumbai.                                 |
| **2**  | **Ship fee _collection_ (not accounting) inside the R1 launch gate.** Fee heads, per-student invoice, cash receipt, defaulter list, one bKash/Nagad pay link with the school as merchant. Cut the platform console (`ROADMAP` 4.4, 7 parts) and defer hiring (4.6) to pay for it.                                                                            | `ROADMAP` M3/M4 — move `F-CM-08` P1–6 and the minimum of `F-CM-01` forward; delete the `FUTURE.md` fee row; rewrite `GTM §1.5` objection 12 and the `§1.2` anti-ICP rule | Removes attack §2.3 and the whole "they cannot collect money" close. Right now three of your documents tell your own salesperson to concede the market's anchor module.                                                                      |
| **3**  | **Make SMS a first-class R1 workstream with margin.** Sign a BTRC-enlisted aggregator in month 1, build sender-ID onboarding into the school wizard as a tracked task, buy at wholesale and sell at ৳0.40.                                                                                                                                                   | `ROADMAP` 3.11 (promote from 2 glue parts to a real chunk); `PRICING §11`                                                                                                | Removes "they cannot reach parents without the app," and funds a field agent per district. Pass-through SMS is a decision to have no channel.                                                                                                |
| **4**  | **Replace the 14-day trial with a one-term paid pilot** (৳1 or 50% off, written success criteria, auto-converts at the January boundary). Keep 14 days for self-serve signups only.                                                                                                                                                                          | `PRODUCT-DECISIONS 5.2`; `GTM §3.4`                                                                                                                                      | Your own pricing doc already argues this. A pilot that expires before an exam cycle hands the school back to me at exactly the wrong moment.                                                                                                 |
| **5**  | **Land banded pricing before the first paid school.** `plan_prices` with student bands and overage is already listed in `ROADMAP` M0 0.5 as "(D-28)" — make it non-optional and ship it in M0.                                                                                                                                                               | `ROADMAP` M0 0.5; `PRICING §11` Option C                                                                                                                                 | The first ten prices set your reference price forever. Flat ৳2,999/৳7,999 loses the 26,299 kindergartens and gives away 50–70% of revenue above 800 students — where _my_ margin comes from.                                                 |
| **6**  | **Build the IEIMS/EMIS export and the Student Unique ID field.** Two parts, inside the student record.                                                                                                                                                                                                                                                       | `ROADMAP` 2.3 (`F-AC-02`); `PRD §5.2`                                                                                                                                    | Takes away my stickiest free retention service. This is unglamorous, unpaid work schools genuinely hate, and being new is an advantage here because my schema predates it.                                                                   |
| **7**  | **Accept existing biometric/RFID terminals as an attendance _input_, without storing templates.** Take the device's card/employee id as a punch into `attendance_scan_events`. Pull it from R4 to R1.5.                                                                                                                                                      | `FUTURE.md` gate-scan row; `ROADMAP` M7 → M4; `PRD §5.2`                                                                                                                 | Kills the RFP checkbox _and_ my hardware lock-in in one move, with zero sensitive data — the school keeps the machine I sold her and stops paying me. Right now "no biometrics ever" reads as a missing feature to everyone except a lawyer. |
| **8**  | **Make the marketplace a free school-library sharing layer in R2 and defer all commerce.** Ship sharing inside `F-TE-05` Resources; see whether anyone uploads before building KYC, moderation, payouts and watermarking.                                                                                                                                    | `ROADMAP` M6 6.0 (shrink the 9-part pilot slice); `PRD §5.4`                                                                                                             | This is the change I least want you to make, because M6 is where I want your year to go. Your own numbers say it is 0.6% of revenue before 5,000 schools. Test the behaviour for free first.                                                 |
| **9**  | **Lead every owner demo with the cover-teacher engine and the audit trail, not with AI.** Rebuild the 15-minute demo script around 8:05am ("a teacher is absent — here is who covers period 3") and "here is who changed that mark."                                                                                                                         | `GTM §3.3`; `COMPETITORS §8.1` Option B                                                                                                                                  | These are the two things I cannot copy this year and cannot retrofit ever. AI I can _claim_ tomorrow at no premium, and my claim will be believed for about eighteen months.                                                                 |
| **10** | **Fix the reference-protection story before you have references.** Signed annual contracts rather than monthly for the first ten schools, price locked in writing, and a stated migration-support commitment. And reconcile the bundle: one number for English-medium schools, one answer on fees, one free-tier cap, `FUTURE.md` brought in line with D-27. | `GTM §3.4` sweeteners; `PRD §4`; `FUTURE.md`; all four docs in §1.15                                                                                                     | Attack §2.4 costs me ৳40,000 per stolen pilot against a monthly, unsigned, non-contractual pilot. Against a signed annual with a price lock and a migrated data set, it costs me three times that and I probably do not bother.              |

**One thing I would not change:** the school-as-merchant-of-record rule, and "no mock data, ever." Both are load-bearing. Do not let anyone talk you out of either in exchange for a faster demo.

---

_Critic #3, adversarial review of Acadigma Campus market research. All competitor facts re-verified against vendor pages and primary sources on 2026-09-17 except where marked; no logins used._
