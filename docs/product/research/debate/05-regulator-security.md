# Adversarial review 05 — the regulator's chair

**Reviewer persona:** Bangladeshi data-protection lawyer; child-safeguarding adviser; former security engineer.
**Date:** 2026-09-17 · **Documents reviewed:** `COMPLIANCE-PDPA.md`, `legal/PRIVACY-POLICY-DRAFT.md`, `legal/DPA-DRAFT.md`, `engineering/SECURITY.md`, `research/COMPETITORS.md` §6, `research/GO-TO-MARKET.md`, `research/TEACHER-SIDE.md`, `research/VOICE-OF-CUSTOMER.md`, `PRODUCT-DECISIONS.md`, `F-AC-02`, `F-AC-03`, `F-AC-09`, `F-ID-01`, `F-ID-04`, `F-CM-02`, `F-CM-04`, `F-CM-08`, `F-OP-01`, `plan/ROADMAP.md`.

**My order of priority is fixed and I will not trade it:** children first, then the law, then the business. Where this document is harsh it is because the plan is good enough to deserve a hard read — `COMPLIANCE-PDPA.md` is better than most vendor compliance work I have seen in this market, which is exactly why its remaining soft spots will be believed.

**Method note.** I re-checked every legal claim I dispute against the sources the plan itself cites, plus Bangladeshi press. Like the authors, I have not read the gazetted Act. Nothing here is legal advice; it is the argument counsel should be asked to settle.

---

## 1. Claims I reject or doubt

### R1 — "Verifiable" parental consent is not unverified. Your own source says it.

> "The word '**verifiable**' parental consent (the GDPR/COPPA term of art) appears in the statute — **[UNVERIFIED]** — The brief asserts it. No source we reached uses that exact word for Bangladesh."
> — `COMPLIANCE-PDPA.md` §1.5

**Reject.** Securiti — source #1 in your own §1.15 bibliography — states that "verifiable parental consent" is mandated from a parent, legal guardian or authorised decision-maker, and adds that the consent **remains valid until the child reaches 18 or attains legal capacity**. Your own sibling document says the same: `COMPETITORS.md` §6.3, "Processing requires **verifiable parental consent** from a guardian or legally empowered representative **until the child turns 18**." So the compliance document downgraded to `[UNVERIFIED]` a claim that its own cited source and its own companion research both make.

Two consequences, and the second is worse than the first:

1. The reassurance that follows — "We design to a verifiable standard anyway: it is the defensible position and costs us little" — is doing work it has not earned. See R2.
2. The "valid until 18" limb is **completely absent from the plan**. See R24. This is the sharpest datable gap in the whole design.

### R2 — Guardian invitation is channel-control evidence, not verifiable parental consent

> "Redeeming it proves control of that mailbox or phone. Combined with the school's independent knowledge of who the guardian is, this is the strongest verification available to us without demanding an NID scan from every parent."
> — `COMPLIANCE-PDPA.md` §3.2

**Doubt, strongly.** What the flow actually proves is that _somebody holding a phone or mailbox that a school typed into a form tapped a button_. It does not prove that person is a parent, that they are _this child's_ parent, or that they hold legal authority to consent. In Bangladeshi school practice the number on the admission form is regularly the school's own office line, an elder sibling's phone, a landlord's, a shopkeeper's, a driver's, or a single handset shared by an extended household. `F-AC-02` §3 defines `guardians.phone` as free-typed data entered by staff; `F-ID-04` §4.5 sends the link to it.

The chain is therefore: **school asserts a number → school sends a link to that number → whoever holds the phone taps Accept → we write an append-only `consent_records` row with an `ip_hash`, a `document_hash` and a `locale`.** The cryptography is real and proves exactly one thing: _what text was displayed_. It proves nothing about _who read it_. Dressing school-attested consent in evidentiary furniture makes it look stronger than it is — to us, to the school, and eventually to a regulator reading the export.

The offline path makes this worse, not better: §3.2 writes a `consent_records` row with `granted_by_user_id = null` on an admin's say-so, into **the same table, with the same schema and the same weight**, distinguished only by `channel='paper'`. §3.4 does the same for independent tutors with `evidence.asserted_by`.

**What I want:** a first-class `consent_records.assurance_level ∈ {channel_verified, school_attested, paper_scan, tutor_asserted}`, rendered in every subject-access export, in the owner dashboard (P17) and in the DPA, so that nobody — including us — ever mistakes a tick box for verified consent. Keep the guardrail in `F-ID-04` §4.2 step 4 (identity substitution refused for `kind='guardian'`); §9 P5 is right to promote it to a compliance control.

### R3 — The school-as-controller framing does not survive contact with what Acadigma actually decides

> "For all personal information you or your staff put into your Acadigma Campus workspace — students, guardians, staff, attendance, marks, files, messages, hiring — **you are the data fiduciary (controller) and Acadigma is the data processor**."
> — `DPA-DRAFT.md` cl.2.1

**Doubt — over-broad, and a school's lawyer will say so.** A processor processes on documented instructions. Acadigma unilaterally decides: the risk formula and its default weights (`F-AC-09` §5.1); that a nightly assessment job runs at all; which fields exist at all (religion, health, `monthly_income_bdt`); default retention for behaviour logs; that a QR-bearing "powered by Acadigma" footer appears on a child's report card (`GO-TO-MARKET.md` §5.6); what is transmitted to Anthropic; and — most plainly —

> "We may produce statistics that cannot identify any person or any school (for example, average attendance across all schools using Acadigma) **to improve the service and to describe our product publicly**. … If you do not want your school included, tell us and we will exclude it."
> — `DPA-DRAFT.md` cl.3.5

A processor cannot grant itself a **new purpose of its own** by writing a clause into its own standard form and calling it the school's instruction, and an opt-out is not a lawful basis in a consent-centric statute. `COMPLIANCE-PDPA.md` §2.1 concedes the point once — "Platform telemetry … **Joint in practice, Acadigma-led**" — and then the word _joint_ appears nowhere in the DPA.

**What I want:** either a short joint-controller annex covering (a) the risk score, (b) cross-school benchmarking, (c) audit/telemetry, (d) the Anthropic transfer, with an allocation of responsibilities and a public summary — or delete cl.3.5. My advice is delete it: it buys one marketing line and costs the cleanest sentence in the document ("We only use your data to provide the service to you").

### R4 — The risk score is profiling of a child, and "deterministic" is not the defence

> "**Profiling, behavioural tracking and targeted advertising directed at minors are prohibited**; automated decision-making affecting children is restricted. **[SINGLE-SOURCE, high quality]**"
> — `COMPLIANCE-PDPA.md` §1.5
> "It is already a _deterministic, explainable formula with a human override and a human-set flag that is never auto-cleared_, **which is close to the right answer** for a restricted-automated-decision regime."
> — ibid.

**Reject the comfort.** Profiling is defined by purpose and effect, not by whether an LLM was in the loop. What `F-AC-09` builds is: a nightly automated evaluation of every child, producing a persisted numeric score and a **band label** (`low|watch|elevated|high`), which **automatically opens a `student_flags` row** ("the job opens a `student_flags` row with `source = 'system'`", §5.6) and **automatically fires notifications to staff** (`risk.flagged`, `risk.digest`). That is automated evaluation of a child producing a persisted label and an automated intervention trigger. It is profiling in substance and it is the thing the reported prohibition is aimed at. The mitigations are good mitigations — they are not a reason to stop worrying.

Three specific things make it worse than the document thinks:

- `flag_kind` includes **`safeguarding`** (`F-AC-09` §3). A safeguarding concern about a named child, stored in a commercial SaaS, in Mumbai, with a 24-month rolling retention (§4.1) and no defined access review, is the most sensitive row in the product and nothing in `COMPLIANCE-PDPA.md` §4 acknowledges it exists.
- Behaviour contributes 15% of the score from logs retained three years past the academic year (§4.1), with no expungement and no resolution weighting. A Class 3 incident moves a Class 6 child's band.
- **The score is simultaneously withheld from the family and omitted from the subject-access bundle.** `F-AC-09` §2: "Parents never see a risk score." §6.2's per-student export lists `student.json`, `attendance.csv`, `marks.csv`, `behaviour.csv`, `assignments.csv`, `report-cards/`, `documents/`, `messages.csv` — **not** `student_risk_scores`, **not** `student_flags`. A covert assessment of a child that the family can neither see nor obtain on request is, whatever the statute turns out to say, the single most indefensible thing in this plan and the thing a journalist writes about.

The product decision to keep it out of the portal is _right_ — an unmediated "risk" label in a parent app would be harmful. Withholding it from an **access request** is a different act and is not defensible.

### R5 — The 90-day NID purge, and the marketing claim built on it, are both wrong

> "**'We delete national ID scans 90 days after admission — we verify, we don't archive.'** True once P27 ships. A strong, concrete claim; do not make it before then."
> — `COMPLIANCE-PDPA.md` §10.1

**Reject — the claim is false even after P27 ships.** §4.1's 90-day purge and P27 govern the **files**. But `F-AC-02` §3 stores, as ordinary text columns on the student and guardian rows:

> `birth_certificate_no`, `nid_no` (students) · `nid_no` (**sensitive**) (guardians)

retained "with the student record" — active enrolment **plus seven years** (§4.1). The sensitive category under the Act is the **government unique identifier**, which is the number, not the JPEG. So after P27 we will be deleting the photograph of the NID while keeping the NID, for seven years, in the same database, in Mumbai, and telling schools we "don't archive". That is a misrepresentation, and it means P27 buys **nothing** against the localisation exposure in §5.5 or the transfer-approval trigger in §1.7.

**Is 90 days itself right?** It is wrong in both directions at once:

- _Too long for what it buys._ Verification happens at the admission decision, usually within days. Ninety days is a convenience window for a re-check that almost never occurs, on the class of data most likely to be "restricted". The defensible number is **admission decision + 14 days**.
- _Too short for what the school actually needs._ Schools are asked for birth-certificate evidence at board registration and form fill-up, at transfer, and at scholarship applications — sometimes years later. Purge silently at 90 days and the school will re-collect and keep a photocopy in a steel almirah, which is a strictly worse outcome for the child. The answer is not a longer retention; it is (a) a surviving attestation record (`type`, `last4`, `verified_at`, `verified_by`), (b) an explicit "re-request this document" flow, and (c) telling the school at onboarding that we do not archive, so it changes _its_ filing practice.

### R6 — The 5-year retention is a single secondary source doing load-bearing work

> "**[SINGLE-SOURCE]** Controllers must 'maintain a register and properly preserve all records' for **at least 5 years** (Securiti). … Not corroborated elsewhere; treat as probable."
> — `COMPLIANCE-PDPA.md` §1.11

**Doubt the use, not the fact.** §1.11 correctly notes this is a _minimum retention of compliance records_, not a maximum for personal data. The document then uses it to justify keeping, for five years and **beyond the data subject's reach**, records about children:

> "`consent_records` … **5 years after withdrawal or account closure** … **Retain (legal hold)**"
> — §4.5
> "We keep, and you cannot instruct us to delete: … (b) **records of consent** … These are kept for **5 years**"
> — `DPA-DRAFT.md` cl.12.5

If counsel cannot ground the five years, that becomes a five-year, non-erasable record of a family's consent decisions about a child's religion and health, justified by one vendor blog post. The principle (consent evidence must outlive the consent) is right; the number needs a source that is not a single secondary summary, and the carve-out should be scoped to the _fact and date_ of consent, not the whole evidence blob.

### R7 — The CDO designation is a conflict of interest with a logbook, not a control

> "**Designation:** **Mahadi (the owner)** is designated Chief Data Officer … **Conflict of interest:** the owner is also the commercial decision-maker. Mitigation: every CDO decision that _overrides_ a privacy objection is written down with reasons in the register."
> — `COMPLIANCE-PDPA.md` §8.1

**Doubt.** The statutory reading is right (verified only for _significant_ fiduciaries, delayed to ~May 2027) and voluntary designation is sensible. But a mitigation in which the conflicted party records his own overrides for his own review is not a mitigation; it is a diary. This matters more than it usually would because of §1.13's third row: criminal exposure and **personal officer liability "unless they prove due diligence"**. "I wrote down that I overruled myself" is not a due-diligence file.

**What I want:** name an external reviewer — counsel or an adviser — with a standing right to read the register and a quarterly sign-off, or state plainly in the privacy policy that the CDO is the founder so schools price the risk themselves. The current §8.1 wording ("we have designated a Chief Data Officer", never "as required by law") is exactly right and should be kept.

### R8 — NDMA vs NDGA: the evidence is weighted the wrong way, and the real problem is different

> "The Daily Star (twice), Asia News Network and local commentary say **National Data Governance Authority (NDGA)** … **[VERIFIED]**. Securiti calls it the **'National Data Management Authority'** … **[SINGLE-SOURCE]**."
> — `COMPLIANCE-PDPA.md` §1.9; repeated in §1.14 as "reputable BD press says NDGA"

**Reject the weighting.** The Business Standard's gazette report states that the **National Data Governance Ordinance, 2025 creates the National Data Management Authority**, and that the Personal Data Protection Ordinance does not establish a separate authority but designates the NDMA as the oversight body. That is reputable Bangladeshi press corroborating Securiti. Other coverage does use NDGA. The honest status is **genuinely unsettled**, not "Securiti is alone".

The working position ("say 'the Authority'") stands — but for a bigger reason the document misses. There may be **two distinct bodies**: a data-_governance_ authority over national databases and source-code repositories, and whatever supervises the PDPA. `DPA-DRAFT.md` cl.13.4 defines the term as "Bangladesh's data-protection supervisory authority under the Personal Data Protection Act, 2026" — a definition that may resolve to a body that does not exist under that description. A school's lawyer will strike a clause whose central defined term names nobody. Add it to §11 as a question in its own right.

### R9 — The penalty analysis is backwards for a company our size

> "Up to **৳25 lakh** … **[VERIFIED]**. Turnover-based fines: **1–2 %** … **2–5 %** … **[CONFLICTING]**."
> — `COMPLIANCE-PDPA.md` §1.13

**Doubt the framing.** SCL Insights sets out the turnover tiers with a worked example (BDT 50 crore revenue → up to BDT 1 crore at 2%). For a pre-revenue or early-revenue company the **lakh figures are the larger exposure**, not the smaller one — a percentage of near-zero turnover is near zero. So the instinct to treat the percentages as the scary unresolved item is commercially inverted. The figure to plan around is the one the document correctly identifies as the brief's biggest omission and then does not act on:

> "Criminal exposure: imprisonment up to **5–7 years** … **corporate officers personally liable** unless they prove due diligence"

`GO-TO-MARKET.md` §13.4 repeats it and ties it to "misuse of children's data". If that is even half right, R7's governance design is a personal-liability design.

### R10 — The parent-invite growth loop ships children's marks to an unauthenticated URL

> "When a school publishes results or a notice, guardians without accounts receive an **SMS/Messenger link to a single-child, read-only view**; the page ends with 'See attendance and marks any time — set a password'."
> — `GO-TO-MARKET.md` §5.1, **Release: R1**

**Reject outright.** This transmits a named child's attendance and marks to an **unauthenticated URL**, delivered over SMS and Messenger, **before any consent record exists**, to a phone number a staff member typed into a form (R2). Messenger and WhatsApp fetch link previews server-side, so Meta's crawler retrieves the page. A forwarded SMS is a permanent capability with no expiry mechanism described. Shared household handsets are the norm.

It is scheduled for **R1** — `ROADMAP.md` M3 3.12, "parent invite loop instrumentation" — and it appears **nowhere in `COMPLIANCE-PDPA.md`**, which means the DPIA screening in §8.4 ("public-facing exposure of data previously private") never ran on it. If this loop ships as written, the first serious incident in this product will be a growth feature working exactly as designed.

**Replacement:** the loop sends an _invitation_, not a view. Same funnel, one extra tap, and the consent architecture survives.

### R11 — "Always a permissioned link" and "with an OG preview card" cannot both be true

> "Every notice, প্রগতিপত্র and নম্বরপত্র has a 'শেয়ার করুন' action producing a **link with an OG preview card** carrying the _school's_ logo and name … **Never share a PDF with marks into a chat — always a permissioned link** (safeguarding + PDPO 2025). **Metric:** shares per school per week."
> — `GO-TO-MARKET.md` §5.5, **Release: R1/R2**

**Doubt the mitigation; the rule is right and the implementation contradicts it.** An Open Graph preview card is by construction an **unauthenticated, server-rendered image fetched and cached by WhatsApp, Meta and Facebook crawlers**. If the OG image for a report-card link carries the child's name, class or GPA, we have published a child's result into third-party caches to make a link look nice — and the permission check on the destination page is irrelevant, because the image is the payload.

Separately: "shares per school per week" as a KPI means we are measuring and optimising the onward transmission of children's academic records. `TEACHER-SIDE.md` §10 item 6 pushes the same instinct further — "Server-rendered 1080×1080 Bangla-capable share cards" — and §8 lists an "earnings screenshot" card, correctly specified as "no PII". Apply the same rule upward.

**Required:** OG and share images for any student-scoped link carry the **school's** mark only — never a child's name, photo, marks or attendance. Rename the metric. Run the DPIA §8.4 already mandates.

### R12 — No QR codes on children's documents

> "Free-plan PDFs (প্রগতিপত্র, নম্বরপত্র, registers, **ID cards**) carry a small, tasteful footer: `Acadigma Campus দিয়ে তৈরি · acadigma.com` **with a QR**."
> — `GO-TO-MARKET.md` §5.6, **Release: R1**

**Reject the QR on student-facing artefacts.** A student ID card already carries one QR — the signed attendance token (`F-AC-02` §5.15). Adding a second, marketing QR millimetres away puts two machine-readable codes on an object a child carries in public, one of which invites strangers to scan a child's ID card, and creates a confusion surface for gate staff. There is no upside proportionate to that.

The footer _text_ is fine and is a legitimate free-plan lever. But note what it is: a processor placing its advertisement on the fiduciary's statutory record about a child. At minimum the DPA must record that the school agrees to it, and the school must be able to turn it off. And observe who cannot buy their way out — `GO-TO-MARKET.md` §8.5 makes madrasa and NGO schools free forever, so the branding lands permanently on the documents of the poorest children in the book.

### R13 — Visible buyer-name watermarks put a teacher's name in forty households

> "Buyer name/email **watermarked into PDFs** at download time (server-side)."
> — `PRODUCT-DECISIONS.md` §4.7
> "she downloads a PDF whose footer reads _'Licensed to Rahima Khatun · Shaheen Model School …'_"
> — `F-CM-04` §1

**Doubt — this is simultaneously a real anti-piracy mechanism and a real personal-data disclosure.** A teacher buys a worksheet and prints forty copies for children who take them home. Her name — and per `PRODUCT-DECISIONS.md` §4.7, potentially her **email** — is now in forty households. `TEACHER-SIDE.md` §3.3 already records "safety concerns on solo demo classes; gendered pay disparity" in this workforce. A visible footer naming the buyer on a classroom handout is a personal-safety question, not a DRM detail.

And it is unnecessary, because `F-CM-04` §5.6 already specifies the mechanism that does the job invisibly:

> "**Invisible marker:** `watermark_token` (a uuid) written into the PDF's `Keywords` metadata **and** as a 1×1 white-on-white text run … Two markers because metadata is trivially stripped and a stripped copy is itself a signal."

Two further problems in the same section: the failure mode —

> "watermarking fails (fall back to the **unwatermarked original**, log a warning, still record the download — never deny a paying buyer their file because of a rendering bug)"

silently removes the only trace, which is the wrong default for the one control the seller is relying on; and the buyer is **never told** that their identity is embedded in the file — `PRIVACY-POLICY-DRAFT.md` §4.5 does not mention it.

**Required:** keep the invisible token; remove the name and email from the visible footer (order number alone if a visible mark is wanted); disclose the embedded token in the policy; on watermarking failure, retry and queue — do not serve untraced.

### R14 — Seller NID retention: three documents, two numbers, and the wrong one is the customer-facing one

> "approved submissions' images are deleted **180 days** after approval … rejected submissions' images are deleted **90 days** after the decision."
> — `F-CM-02` §3
> "**Approved: 2 years after the last payout, then purge. Rejected: 90 days.**"
> — `COMPLIANCE-PDPA.md` §4.4; repeated at §9 P30

**Reject the compliance document's number.** These differ by a factor of four to eight on the single most dangerous file we hold — a government ID scan plus a selfie. `DPA-DRAFT.md` Annex A's retention line does not mention KYC at all, so the contract is silent while the compliance document (the one that will be quoted to schools and to counsel) is wrong. The feature spec wins. Fix §4.4 and P30 to 180 days and add the line to Annex A.

While correcting it, claim the control the compliance document fails to notice:

> "We store the document **images** and the **last 4 digits** of its number; **we never store the full NID/passport number**, and the form does not ask for it. The reviewer reads the number off the image."
> — `F-CM-02` §5

That is better minimisation than anything in §4.1 for _students_, it belongs in §10.1's defensible-claims table, and — see R5 — it is exactly the pattern `F-AC-02` should copy.

### R15 — "Verified" is a representation we are not in a position to make

> `profile_verifications (kind ∈ identity|degree|certificate …)` · "Identity verified — an approved `profile_verifications` — **10** points … Teacher verified (composite) — **5**"
> — `F-OP-01` §3.6, §5 profile score
> "A forged credential can survive **a decade** inside a Bangladeshi school … 793 fake NTRCA certificates" (Prothom Alo)
> — `TEACHER-SIDE.md` §4.3

**Reject the word.** What workflow W10 actually does is: a teacher uploads a JPEG, a platform staff member looks at it, a badge appears within a 2-business-day SLA. Eyeballing a scan does not detect the class of forgery that `TEACHER-SIDE.md` documents surviving a decade and an NTRCA audit. NTRCA does publish an online certificate check (`ntrca.teletalk.com.bd`), so a genuine verification path exists for the registration certificate — and no path exists for a private B.Ed or a foreign degree.

Three exposures:

1. A school that hires on our badge and gets a forger has a claim against us; `DPA-DRAFT.md` cl.13.6 takes no position on liability.
2. A **rejected** verification is a stored allegation about a named person (`status='rejected'` plus a free-text `note`). It is within that person's access right and defamatory if wrong. Nothing in the plan says a rejection is invisible to schools — `profile_score` merely fails to rise, which is itself a signal.
3. `kyc_review_events.reason_code = 'suspected_fraud'` (`F-CM-02` §3) is a fraud allegation about a named teacher, retained after the images are purged, with no stated appeal route.

**Required:** rename to "Documents checked by Acadigma on {date}", state the method, check NTRCA numbers against the NTRCA service where one exists, never surface a rejection to a school, and give both rejection types a written appeal.

### R16 — Anonymous school reviews: not in this jurisdiction, not by this company, not without counsel

> "Anonymous, **verified-employment-gated** school reviews (the BEMSTA behaviour, made safe) — needs careful legal review."
> — `TEACHER-SIDE.md` §10 item 19; listed in §8 as an evangelism driver

**Reject for now.** Defamation in Bangladesh is **criminal** — Penal Code ss.499/500, up to two years' imprisonment — as well as civil, and the online layer is unstable: the Cyber Security Act 2023 was repealed in May 2025 and replaced by the Cyber Security Ordinance 2025, an instrument `COMPLIANCE-PDPA.md` has never examined (§1.15's stale-source warning about DLA Piper is right, and the gap it leaves is this one).

The design flaw is that **"verified-employment-gated" makes it worse for the reviewer, not better**. Gating means we hold a resolvable mapping from an anonymous review to a named, currently-employed teacher. A school that sues, or a school owner who goes to the police, is demanding a mapping we will have and may be compelled to produce. The teacher who trusted the word "anonymous" loses her job. And the schools being reviewed are our paying customers, so the first takedown demand arrives from a customer.

**Required:** off the roadmap until counsel delivers a written opinion; remove "Anonymous employer review" from `TEACHER-SIDE.md` §8's evangelism table in the meantime; if it is ever built, it needs a design in which no resolvable mapping is retained (which defeats the gate) and a published response-to-legal-process policy.

### R17 — "Open to work, private by default" is a default-off switch, not selective disclosure

> "**Private-by-default 'open to work' with selective disclosure**; candidate can view school info without the school knowing." — `TEACHER-SIDE.md` §10 item 8
> "**`open_to_work = true AND visibility = 'active'` is the only combination a school can see.**" — `F-OP-01` §3.5
> "_Demo:_ a teacher fills their profile to 85, flips `open_to_work`, and **appears in another school's browse within one refresh**." — `F-OP-01` Part 8

**Doubt the sufficiency.** `browseCandidates` returns matching profiles to **any Pro school**. Her current employer is very often a Pro school on our platform. The research asked for _selective disclosure_; what is specified is a default-off boolean. Without an employer-exclusion list, flipping the switch is precisely what `TEACHER-SIDE.md` §4.5 warns against — "a resignation announcement" — delivered to her own principal, by us.

This is not a PDPA point. It is a "our product gets a teacher fired" point, and it costs one array column.

### R18 — Teacher surveillance is the least-governed profiling in the product

The DPA's protections are written for children only:

> "**Neither of us** will use **students'** information for advertising, behavioural profiling or targeted marketing, and we will not make automated decisions about **a student** that have a significant effect on them without a person reviewing it."
> — `DPA-DRAFT.md` cl.4.4

Meanwhile the product computes, per named teacher: workload variance and "balance suggestions" (`F-TE-06`), attendance and **missed punches** (`F-AC-04`), cover-eligibility rankings (`domain/eligibility.ts`, `F-OP-02`), payroll impact, and dashboard rollups (`F-TE-07`). These are inputs to pay and to dismissal. `COMPLIANCE-PDPA.md` §3.1 names the consent artefact as a "**Staff privacy notice at invitation**" — and no such notice exists anywhere: §9.1's nine identity/consent items do not include one, and `F-ID-04` §4.1's invitation carries a role, a message and a link, with no privacy information at all.

So: profiling of children is prohibited and heavily documented; profiling of staff is unmentioned, undisclosed and ungoverned — in a product whose own research (`TEACHER-SIDE.md` §1.1) says teacher communities are "dominated by _pay, MPO status, and transfer_ grievances".

**Required:** a staff privacy notice at invitation, recorded as a `legal_acceptances` document type; staff visibility of their own derived metrics; and an explicit DPA/ToS statement that workload, punctuality and eligibility metrics are advisory and never an automated employment decision.

### R19 — "Signed-token QR is not biometric" is true, and the card is still a year-long tracking token

> "It holds **no biometrics** — our QR ID cards carry a _signed token_, not a fingerprint or face template. That is a genuine, defensible marketing claim."
> — `COMPLIANCE-PDPA.md` §1.6

**Endorse the claim; doubt its durability.** The payload is `{v, w: workspace_id, s: student_id, n: card_serial, exp}` HMAC'd, with "**Default validity: the academic year's `ends_on` + 60 days**" (`F-AC-02` §5.15). No PII — correct. But it is a **stable, linkable identifier for one child, printed on an object the child carries in public, valid for over a year**, readable by any third-party scanner. Anyone who photographs a card holds that token for the year.

Then `ROADMAP.md` M7 adds "gate-scan attendance" and an Android camera, and `attendance_scan_events` becomes a per-child time-and-place log at school entrances. §4.6 defers geofenced staff check-in because "real-time geolocation" is a sensitive category — while shipping the mechanism that produces comparable data about children by another route. §8.4 lists gate-scan as DPIA-required, which is right and is the only thing currently standing between the two positions.

**Required:** shorten validity to the term; actually use `id_cards.revoked_at` on loss; DPIA and a stated retention for `attendance_scan_events` before M7; and a written rule that the QR payload never gains a name, photo URL or date of birth.

### R20 — Localisation is not a roadmap item, and it is not on the roadmap

> "**Prepare a Bangladesh-resident option** … **This is a roadmap item, not a launch blocker**, but it must be on the roadmap with a name against it."
> — `COMPLIANCE-PDPA.md` §5.5 mitigation 5

**Reject the priority — and note that it is not even on the roadmap.** I searched `ROADMAP.md`: there is no localisation item in any milestone, no owner, no gate. The only trace is §8.2's compliance calendar, "By Q2 2027 · Localisation decision · Owner".

Against that, the verified facts: data classified "confidential" or "restricted" must be stored within Bangladesh (SCL Insights; corroborated by DataGuidance's account of the four-tier classification), and at least one synchronised real-time copy must be held domestically for cloud-stored restricted data (security.land). And:

> "Acadigma Campus stores **100 % of its data in Mumbai**. If children's health records, NID scans or KYC documents fall into those classes — which is the natural reading — **our current architecture does not comply**, and no contract clause fixes it."
> — §5.5

§5.5 states the problem with exemplary honesty and then files it behind four cheaper mitigations. The honest framing is that this is **the one open question that could void the product**, and the right pre-launch response is the mitigation §5.5 itself ranks first and the plan then under-prioritises: _stop holding the class of data most likely to be restricted_. Drop student and guardian NID and birth-certificate numbers and images entirely (R5); reduce health to what a first-aider needs. Done now, with zero rows in the table, that is a schema decision. Done after fifty schools, it is a migration across live children's records.

### R21 — "No filing appears due today" rests on an argument I would not make to a regulator

> "**Net — No filing appears due today.** Counsel must confirm."
> — `COMPLIANCE-PDPA.md` §5.5

**Doubt.** Securiti's account of the Act says government approval is required for transferring sensitive personal data — NID, passport, TIN, biometric, genetic, criminal records — outside Bangladesh, and that notification is mandatory for large-scale transfers. §5.5 reads the trigger as attaching only to _bulk_ transfers and leans on mitigation 4: "our exports are per-school and per-subject, which keeps us away from the 'bulk transfer needs advance approval' trigger."

But the relevant transfer is not an export. It is the **continuous storage of every student's, every guardian's and every seller's identifier data outside Bangladesh**. Arguing that this is not "bulk" because no single HTTP request is large is an argument I would not want to be making, and the whole architecture currently rests on it. Remove the reliance by removing the identifiers (R20).

### R22 — A P0 control scheduled for Release 2, warranted in a contract signed at Release 1

> "**P18** — **`redactForAI()`** … with a **Semgrep rule** failing any Anthropic call not routed through it — **Priority: P0**"
> — `COMPLIANCE-PDPA.md` §9.4
> "These removals are performed automatically by our software and **tested on every release**."
> — `DPA-DRAFT.md` cl.9.3
> "5.3 | **F-TE-04 P1** prompt catalogue, output schemas, **PII redaction**, CI rule" — `ROADMAP.md` **M5, Release 2**

**Reject the sequencing.** P0 means "before the first real school holds real children's data". The roadmap places the redactor two milestones _after_ the R1 launch gate, and after `F-TE-01`'s AI generation at 5.5. Meanwhile the DPA a school signs at onboarding already warrants that it works. That is a misrepresentation in a signed contract, and `DPA-DRAFT.md`'s own pre-signature checklist anticipates it: "**remove anything not yet built**; an unbuilt control in a signed contract is a misrepresentation."

Second problem, independent of timing: the redactor is regex and keyword matching over **Bengali free text** ("health keyword list in bn + en"). Bengali health vocabulary, transliteration (`epilepsy` / `মৃগী` / `mrigi`), and a teacher typing a child's full name in Bangla script will defeat it routinely. A redactor that **fails open** is worse than none, because the contract says it works.

**Required:** fail closed — refuse the call and tell the teacher which phrase to remove; log `ai.prompt_redacted` recording _that_ a rule fired without storing the matched text; and sample-review a staging prompt corpus before the claim is made to anyone.

### R23 — The erasure promise is not true at the storage layer

> "Religion, optional profile fields, photo — **Yes, immediately**"
> — `COMPLIANCE-PDPA.md` §6.4; mirrored in `PRIVACY-POLICY-DRAFT.md` §8.1
> "`audit_events` rows … before/after diff … The table is append-only: **no UPDATE or DELETE grant for any role**"
> — `SECURITY.md` Finding 5

**Doubt — these two cannot both hold.** The audit trigger writes before/after values for every mutation on every tenant table. That means `audit_events` contains children's religion, health values and NID numbers in its `before` payloads, retained seven years once P16 lands, explicitly non-erasable, and by design untouched by `app.erase_subject()`. Delete a child's religion and it remains in the audit row for seven years. Withdraw health consent and the values persist in the trail.

The carve-out is right in principle — an accountability log a school can order destroyed is not a log. But the privacy policy's erasure table is currently a statement about the `students` table, not about the system.

**Required, in the design not the contract:** audit payloads for columns classified sensitive store a change-marker or hash rather than the value; or the erasure path redacts the payload and keeps the envelope, actor, timestamp and correlation id. Decide before P16 fixes a seven-year retention on the current shape.

### R24 — Nobody has handled the child who turns 18

Securiti: parental consent "remains valid until the child reaches 18 or attains legal capacity". `COMPETITORS.md` §6.3: "verifiable parental consent from a guardian … **until the child turns 18**."

A Class 11–12 student in a Bangladeshi college is routinely 17 to 19. On the day a student turns 18:

- the parental consent that supports processing their health data, religion and portal disclosure **lapses**;
- the parent's continued access to their attendance, marks, behaviour notes and health data is no longer supported by anything;
- the now-adult student acquires their own access, correction, erasure and objection rights — and has **no account** to exercise them through (`PRODUCT-DECISIONS.md` §1.22: "Students … are records").

`COMPLIANCE-PDPA.md` §9.5 "Age handling" contains exactly three items: sellers must be 18+, candidates under 18 need a guardian step, personal-workspace students are field-limited. **None of them is "students who turn 18."** `PRIVACY-POLICY-DRAFT.md` §13 says "Children under 18 do not have accounts" and stops.

This is the most concrete, most datable, most easily-fixed legal defect in the plan: `students.date_of_birth` is a **required** field (`F-AC-02` §5.1), so the job is a nightly query. It is also the one a regulator could find in five minutes.

---

## 2. Safeguarding gaps nobody raised

**S1 — Every `staff` member can see a child's photograph, home address and guardian's phone.** `F-AC-02` §3: `students` SELECT is granted to active members with role owner/admin/teacher/**staff**. `staff` is a base role held by the accountant, office assistant, librarian, anyone an admin invites. §5.14's sensitivity classification protects `health`, `nid_no`, `birth_certificate_no`, `monthly_income_bdt` behind `students.read_sensitive` — it does **not** protect `present_address`, `permanent_address` or `photo_file_id`. Photograph + home address + primary guardian's phone is the dataset for approaching a child, and it is the default read for the broadest role in the school. Add address and photograph to the sensitive projection, and give `staff` a roster that shows name, class and roll only.

**S2 — Photo consent is a naked boolean that nothing reads.** `students.photo_consent bool` sits under "_Optional other_" in `F-AC-02` §3, next to `interests` and `heard_from`. `consent_records.consent_type` includes `student_photo_use` (§3.2) but **no item in §9's 38-point checklist captures photo consent**, and no spec references the boolean. Meanwhile photographs appear on the roster, on printed ID cards the child carries in public, on report cards and in the parent portal — and `GO-TO-MARKET.md` §5.6 puts a marketing QR on the same card. Nothing distinguishes "the school may keep a photo in its records" from "the photo may be printed on an object my child carries on a bus". Split the consent, honour it at render time, and default ID-card photos to off.

**S3 — There is no concept of a child who must not be found.** Nowhere in the plan is there a _restricted student_: a child in a custody dispute, a child with a protective order against a named adult, a child whose address must not be displayed. `F-AC-09` gives us `student_flags.kind = 'safeguarding'` — a **label**, which changes no visibility anywhere. Meanwhile a `guardian_users` link grants attendance, timetable and pick-up-adjacent data, which is a **locating capability**. Required: per-guardian-link suppression, an address-suppression flag that survives export and PDF rendering, and a distinct audit event when a suppressed record is opened.

**S4 — Custody change has no workflow.** `guardian_users.status ∈ invited|active|revoked` exists, and §4.1 says "Hard delete on unlink". But no spec — not `F-AC-02`, not `F-AC-10`, not `F-ID-04` — describes _removing_ a guardian: who may do it, what evidence is recorded, whether the other guardian is told, whether the removed parent is notified (sometimes they must not be). In practice a school will be handed a court order on paper and an admin will act on it at 4pm on a Thursday. And revocation is forward-only: push notifications already delivered stay on the phone, the cached PWA data stays, downloaded report-card PDFs stay, and a signed URL issued in the last five minutes keeps working. Required: a first-class flow with a reason, an audit event, a "do not notify" option, and a check against `is_emergency_contact` / `can_pick_up`.

**S5 — `can_pick_up` is a field with no product behind it.** `guardians.can_pick_up bool` (`F-AC-02` §3) appears in no UI, no rule, no workflow, no audit event anywhere in the corpus. A field encoding who may physically collect a child, with nothing behind it, is worse than no field — office staff will believe it and act on it, and nobody owns keeping it current.

**S6 — Removed staff keep a roster of children on their phone.** `SECURITY.md` Finding 6 solves _server_ access correctly and completely ("Access is evaluated per request … the next request after removal is denied"). It says nothing about what is already on the device: the PWA shell, the TanStack Query cache, the **IndexedDB offline attendance queue** — which `F-AC-03` §4.6 fills with children's names and attendance statuses and keeps for up to **seven days** — and browser-cached signed-URL images. `F-ID-01` §4.10 clears all of this **on sign-out**. A dismissed teacher does not sign out. Required: on `status='removed'` or session revocation, the next app open must purge the offline queue and query cache _before_ rendering, and the service worker must drop student-scoped caches.

**S7 — Shared phones, no MFA, a 30-day session, and a child's medical record one tap away.** `VOICE-OF-CUSTOMER.md` §4.1 is a wall of evidence that BD school users share devices and fight with logins ("whenever i use my password on another laptop it says account not found"). `SECURITY.md` §5.7.3 responds correctly by refusing to impose MFA on "teachers, staff or parents, who sign in from shared school phones", and `F-ID-01` §5 sets a 30-day sliding refresh token. Both product calls are right. Neither is paired with the compensating control: there is **no step-up re-authentication** before opening a health record, a medical file or the Documents tab, and no idle timeout on those screens. That is free for the 99% of sessions that never open them.

**S8 — Behaviour logs are a permanent record with no expungement.** Retained "Academic year + 3 years" (§4.1), guardian-visible where flagged, and weighted 0.15 into the risk score (`F-AC-09` §5.1) with no decay and no resolution weighting. `F-AC-08` has follow-ups; nothing closes the loop, nothing reviews, nothing expunges. A Class 3 incident still moves a Class 6 child's band. Required: a documented annual review-and-clear, and an explicit rule that resolved entries stop contributing.

**S9 — The risk score is missing from the subject-access bundle.** See R4. `student_risk_scores` and `student_flags` do not appear in §6.2's per-student export.

**S10 — Rejected verifications and fraud allegations have no appeal.** §3.5 item 6 gets interview scorecards right ("opinions about an identifiable person and … within the candidate's access right. Write them accordingly"). The identical logic is not applied to `profile_verifications.status='rejected'` with its free-text `note`, nor to `kyc_review_events.reason_code='suspected_fraud'` — a stored fraud allegation about a named teacher that outlives the images it was based on.

**S11 — `guardians.monthly_income_bdt` should not exist.** Family income, collected at admission, retained with the student record for seven years. It is correctly behind `read_sensitive` — but nothing in the product uses it, nothing justifies it, and its presence invites schools to price-discriminate and to treat children differently by household income. §4.6's "what we deliberately do not hold" list should gain it. Deleting a column is the cheapest privacy work available.

---

## 3. Security gaps — a pentester's read

**G1 — Session persistence has no compensating control.** 30-day sliding refresh, 1-hour access token, no MFA for the majority of roles, revocation landing "within one refresh cycle (≤ 1 h)" (`F-ID-01` §4.8). The product call is right; the whole residual risk lands on device compromise and nothing addresses it: no step-up auth for sensitive reads, no idle timeout, no forced sign-out prompt on the new-device notification, no server push of revocation. A stolen phone is an hour of full access, minimum.

**G2 — `/pay/[schoolSlug]` is a per-child confirmation oracle.** Second factor is `guardianPhoneLast4` — 10⁴ values — against **sequential** student codes (`STU-2026-00001`, `PRODUCT-DECISIONS.md` §2.6), so the identifier space is fully enumerable and only four digits stand between an attacker and a confirmed answer to "does this child attend this school, and is the family behind on fees". The spec's defences are good and insufficient: rate limits, CAPTCHA, a starved response, a school disable switch (§5.12). What is missing: a **global** lockout per student code across all IPs, identical response shape _and timing_ for "not found" versus "wrong phone", logging of every attempted code, a spike alert to the school, and `public_pay_enabled` defaulting to **off**. Arrears data is precisely what social-engineers a school office.

**G3 — `/jobs/[slug]/apply` mints auth accounts from an unauthenticated form.** `F-OP-01` W2/Part 3: submission creates a Supabase Auth user, a personal workspace and a `teacher_profiles` row, with email verification that "**does not block** the application", at 5/h/IP and 3/day/email behind Turnstile. That is account pre-registration against other people's email addresses (the victim later cannot register), a mail-bombing primitive, and unauthenticated private-bucket writes (the CV). Turnstile is friction, not a control. Prefer: store the application plus a claim token; mint the account only on email confirmation.

**G4 — Join codes live in a global namespace, so every guess tests every school.** `workspace_join_codes.code` is `citext not null **unique**` table-wide. 2⁴⁰ is plenty of entropy against a _targeted_ guess, but the attacker's goal is harvesting _any_ valid code, and a global namespace means one request tests the whole customer base at once. Throttles are per user (10/h) and per IP (30/h) — a distributed budget. And a hit returns `{workspace_id, name, logo_url}` from `app.find_workspace_by_join_code`, disclosing a school's identity and internal id. Required: a **global** failure budget per hour across the function with an alert, and a per-workspace prefix so a guess tests one school.

**G5 — Invitation tokens travel in the URL path.** `F-ID-04` §4.2: `/invite/{raw_token}`. Consequences: the raw token lands in Vercel edge access logs, in the `Referer` of any third-party asset on the accept page, in browser history on a shared phone, and in **SMS/Messenger link previews** — Meta fetches the URL, so the invitation is redeemed-adjacent before the parent sees it. Guardian invitations are valid **30 days** (§5), and resend "does **not** mint a new token" while extending expiry, so a token disclosed once stays live for the extended window. Required: `Referrer-Policy: no-referrer` on the invite route specifically, a POST-from-landing-page or fragment pattern, and a "new link" option on resend.

**G6 — `file_access_log` records intent, not access, and the DPA promises access.** `SECURITY.md` §5.3: the log row is written when the URL is **issued**; the URL then works for five minutes from any IP with no further check. A leaked or forwarded URL produces no second row. Against that:

> "whether the information was **actually accessed**, or only accessible — **we keep access logs precisely so we can answer this**"
> — `DPA-DRAFT.md` cl.8.3(c)

That is a contractual promise the mechanism cannot keep. Either proxy the bytes through `/api/files/[id]` for sensitive kinds (medical, NID, KYC) so every read is logged, or soften the clause. Related: `F-CM-04` §4 writes the per-download watermarked copy to `tmp/downloads/<watermark_token>.pdf` with deletion "**at +15 minutes**" — a fifteen-minute window holding an object keyed on a value that is also stored in a database row; if that path is ever in the public bucket it is a straight bypass.

**G7 — SSLCommerz IPN: cross-tenant validation confusion and an under-specified idempotency key.** The marketplace path is right (server-to-server validation, `inbound_events` unique on provider event id). The **fee** path is different: `F-CM-08` uses each school's **own** merchant credentials and `tran_id` of the form `FEE-<base32(id)>`, so validation must be performed against the _correct school's_ store credentials. Nothing in `SECURITY.md` §2.5 or the listed tests covers "a callback for school A validated with school B's store id" — a cross-tenant money bug that the "scoped provider factory (D-31)" is assumed to prevent and no test asserts. Separately, replay protection must key on the **(store_id, tran_id, val_id)** triple, not on a single provider event id, because IPN retries and the validation API are distinct calls; §5.6's "replay/retry counted per provider event id" suggests it currently does not.

**G8 — The risk job's authorisation is described as RLS on a role that bypasses RLS.** `F-AC-09` §3: writes are "by the nightly job (**service role**) or an admin-triggered recompute", and the crucial protection is stated as "the job's role may only insert or update rows where `source='system'`" — described as an RLS predicate. **Service role bypasses RLS.** If the job genuinely runs as service role, the guarantee that no automated process can ever touch a human `safeguarding` flag is a check constraint plus application code, and the pgTAP test in §4.3 is asserting a path production does not take. This is the single most important line in the security model to get right, because of what `student_flags` contains. Required: a dedicated non-bypassing database role (`SET LOCAL ROLE`) for the job, and a test that runs against the production code path.

**G9 — Realtime revocation happens on reconnect, which on a phone can be hours.** `SECURITY.md` Finding 6: "Realtime channels **re-authorise on reconnect** and RLS applies to the publication, so an open subscription stops delivering." Supabase Realtime authorises at subscribe time. A teacher removed mid-session keeps receiving new messages, attendance changes and notifications on an already-open socket until it drops — which on stable wifi is a long time. The e2e test named (`removed-member-loses-access`) exercises _navigation_, not an open socket. Required: a server-initiated disconnect broadcast on membership change, and a test that flips `status` and asserts the open socket stops delivering within N seconds.

**G10 — Two documents put incompatible things in edge middleware.** `COMPLIANCE-PDPA.md` §5.3 sets the rule: "**middleware must never touch personal data** beyond the session cookie and the workspace id — no student rows, no profile reads, no logging of request bodies." `SECURITY.md` §5.6 then enforces rate limits "in middleware for routes … backed by a **Postgres counter table** (no Redis in the stack)", and §5.9 puts origin checks there too. A Postgres round trip from an unpinnable PoP is both a latency problem and a transfer question, and `DPA-DRAFT.md` cl.9.1 asserts that the delivery network "**does not store your records**" on the strength of the weaker document. Decide: rate limiting moves into the `bom1` functions, or the claim is reworded.

**G11 — One checkbox exports every child's sensitive data to a school PC.** `F-AC-02` §5.14: sensitive fields are excluded from CSV export "unless the exporter explicitly ticks 'include sensitive' (which writes an audit event `students.sensitive_exported`)". The audit event is the _only_ control on a whole-school export of health data, NID numbers and family income to a file that will then be emailed. Required: a row cap, two-person approval for whole-school sensitive exports, a per-export watermark, and a school-level switch to disable it entirely.

**G12 — The public bucket has a convention and only a review comment guarding it.** `F-CM-03` §3 places generated previews at `listing-previews/<listing_id>/p<1..3>.webp`, "**public** — anyone". That is correct for watermarked marketing previews. But it establishes a predictable public-bucket path convention that a future feature will copy, and the only guard is a process rule: "a review comment is required on any PR that puts something new in it" (`SECURITY.md` §5.3). Make it a CI assertion on bucket writes, the same way `coverage.sql` makes RLS a build failure rather than a habit.

---

## 4. What I endorse

**E1 — The confidence markers, and the stale-source warning.** §0's `[VERIFIED] / [SINGLE-SOURCE] / [CONFLICTING] / [UNVERIFIED]` scheme, applied consistently, with §1.14 grading the brief that commissioned the work and §1.15 naming a source it _refuses_ to cite ("DLA Piper … has not been updated for the PDPO/PDPA. **Do not cite it.**"). I have read a lot of vendor compliance material in this market and none of it does this. It is the reason the rest of the document is worth arguing with.

**E2 — §10.2, the forbidden-claims table.** Identifying "**All your data stays in Bangladesh**" as "the single most dangerous claim on the list **because it is exactly what a school wants to hear**" is the most clear-sighted sentence in the corpus. So is refusing "PDPA compliant", "SOC 2 ready", "bank-grade security", and fear-selling with fine amounts — "fear-selling a law we have not read will be the first thing a school's lawyer checks". Keep this table in front of whoever writes the deck, permanently.

**E3 — The six deliberate negatives in §4.6.** No biometric templates. No student accounts. No ad SDKs or third-party trackers. No card numbers. No raw IP addresses. No caste, political affiliation, trade-union or sexual-orientation fields. Each one deletes an entire class of risk rather than mitigating it. The QR-instead-of-fingerprint decision (`PRODUCT-DECISIONS.md` §3.10) is the best single product decision in the plan, and `COMPETITORS.md` §6.3 is right that every BD competitor sells the opposite — "a reason never to add fingerprint support. **Do not treat it as a missing feature.**"

**E4 — Trigger-written, append-only audit, and `coverage.sql` as a build gate.** `SECURITY.md` Finding 5: audit rows written by a database trigger inside the mutation's transaction, "no application or client code writes audit rows — so there is **no call site to get wrong**", with no UPDATE/DELETE grant for any role including service role; and Finding 1/3: `coverage.sql` failing the build if any tenant table lacks RLS or tests, with non-tenant sensitive tables on an explicit allowlist. This is the difference between a system that can answer "who opened this child's medical file" and one that cannot. It is the first thing I would ask for in a procurement review and it is already built into the definition of done.

**E5 — Refusing to promise deletion of attendance and marks.** §6.4 and `PRIVACY-POLICY-DRAFT.md` §8.1 put the legal holds in a table, in plain words, addressed to a parent: "**We would rather tell you this plainly than promise something we cannot do.**" Every competitor promises "delete anything, any time" and none of them can honour it. Schools and families will trust the honest table more than the promise, and §10.2's entry banning the promise is the right pairing.

**E6 — Not storing the full NID number for sellers, and stripping EXIF from selfies.** `F-CM-02` §5 and §3. Both are genuine minimisation, both cost nothing, and **neither is claimed in §10.1**. Claim them — and copy the pattern into `F-AC-02` (R5).

**E7 — `auto_clear_allowed = false` on human flags.** `F-AC-09` §5.6: a human safeguarding concern that no job, no recompute and no admin bulk action can silently close — enforced by a check constraint, a policy predicate and a named test, and called out as "the single most important behavioural rule" in the feature. That is the correct instinct about the relationship between automation and child protection, and it is rarer than it should be. (Make the enforcement real — see G8.)

**E8 — The insistence on Bengali of equal standing, drafted by a person.** `PRIVACY-POLICY-DRAFT.md`'s drafter notes ("written for a parent in Cumilla reading on a ৳8,000 Android phone"), the `document_hash` covering the language actually displayed, and §3.2's "**A consent text a parent could not read is not consent.**" That sentence is the correct legal test and most vendors in this market do not meet it.

---

## 5. Ten changes to the plan, ranked

**MUST** = before any real child's record enters the system. **BY-2027** = before enforcement switches on (~13 May 2027).

| #      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Maps to                                                                                                                                                                                         | When                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **1**  | **Stop collecting student and guardian NID / birth-certificate _numbers_; purge the scans at admission decision + 14 days, not 90.** Drop `students.nid_no`, `students.birth_certificate_no`, `guardians.nid_no` and `guardians.monthly_income_bdt`; replace with an attestation record `{type, last4, verified_at, verified_by}`, copying `F-CM-02`'s seller pattern. Add an explicit "re-request document" flow so schools are not driven back to paper.                                                                                                                                                                                                                                                       | `F-AC-02` §3, §5.14 · `COMPLIANCE-PDPA` §4.1, §9 P27, §10.1 · `DPA` Annex A · policy §4.1 · `ROADMAP` M2 2.3 (**before the `students` migration ships**)                                        | **MUST**                                                           |
| **2**  | **Kill the three growth mechanics that move children's data to unauthenticated or third-party surfaces.** GTM §5.1's unauthenticated single-child view becomes an _invitation_; GTM §5.5's OG/share images carry the school's mark only, never a child's name, photo, marks or attendance; GTM §5.6's QR comes off ID cards and report cards (text footer stays, school-disableable). Run the DPIA §8.4 already requires.                                                                                                                                                                                                                                                                                        | `GO-TO-MARKET` §5.1, §5.5, §5.6 · `ROADMAP` M3 3.12 (all three currently R1) · `COMPLIANCE-PDPA` §8.4 (no DPIA exists)                                                                          | **MUST**                                                           |
| **3**  | **Make the risk score disclosable, and make the job's authorisation real.** Add `student_risk_scores` and `student_flags` to the per-student export bundle with a plain-language explanation; keep them out of the portal but never out of an access request. Run the nightly job under a dedicated **non-RLS-bypassing** role so "never touches human flags" is enforced where it is claimed. Write the DPIA before the first score is computed.                                                                                                                                                                                                                                                                | `F-AC-09` §2, §3, §4.1, §5.6 · `COMPLIANCE-PDPA` §6.2, §9 P32, §8.4 · `ROADMAP` M5 5.12                                                                                                         | **MUST**                                                           |
| **4**  | **Consent assurance levels, and the 18th-birthday transition.** Add `consent_records.assurance_level ∈ {channel_verified, school_attested, paper_scan, tutor_asserted}`, surfaced in every export and on the owner dashboard. Add a nightly job on `students.date_of_birth` that at 18 marks parental consent `expired`, notifies the school, and suspends guardian portal access pending the now-adult student's own decision.                                                                                                                                                                                                                                                                                  | `COMPLIANCE-PDPA` §3.2, §3.4, §9 P1/P3, **new §9.5 item** · `F-ID-04` §4.5 · `F-AC-10`                                                                                                          | **MUST**                                                           |
| **5**  | **Close the device-side gaps.** Server-driven purge of the IndexedDB offline queue, query cache and student-scoped service-worker caches on membership removal or session revocation — not only on sign-out. Step-up re-authentication before any `students.read_sensitive` view or the Documents tab. Add `present_address`, `permanent_address` and `photo_file_id` to the sensitive projection so `staff` cannot read them by default.                                                                                                                                                                                                                                                                        | `SECURITY.md` §5.7, Finding 6 · `F-ID-01` §4.9, §4.10 · `F-AC-03` §4.6 · `F-AC-02` §5.14 · `ROADMAP` M2 2.4                                                                                     | **MUST**                                                           |
| **6**  | **Fix the `/pay/[slug]` oracle before it ships.** Default `public_pay_enabled` to off; global per-student-code lockout across all IPs; identical response shape _and_ timing for both failure modes; log every attempted code; spike alert to the school.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `F-CM-08` §5.12, §6, Part 10 · `ROADMAP` M4 4.3                                                                                                                                                 | **MUST**                                                           |
| **7**  | **Reconcile the retentions and de-identify the watermark.** KYC images = **180 days** (`F-CM-02` wins; fix `COMPLIANCE-PDPA` §4.4 and P30, add the line to `DPA` Annex A). Marketplace: keep the invisible `watermark_token`; remove the buyer's **name and email** from the visible footer; disclose the embedded token in policy §4.5; on watermarking failure, retry and queue — never serve untraced. Claim the "we never store the full NID number" control in §10.1.                                                                                                                                                                                                                                       | `F-CM-02` §3, §5 · `F-CM-04` §5.6 · `PRODUCT-DECISIONS` §4.7 · `COMPLIANCE-PDPA` §4.4, §9 P30, §10.1 · policy §4.5                                                                              | **MUST**                                                           |
| **8**  | **Reframe the controller/processor allocation honestly.** Either add a joint-controller annex covering the risk score, cross-school benchmarking, audit/telemetry and the Anthropic transfer — or **delete `DPA` cl.3.5** (my advice: delete). Resolve the audit-payload problem (sensitive values in `audit_events.before`) _before_ P16 sets a seven-year retention on the current shape: store change-markers for sensitive columns, or redact payloads on erasure while keeping the envelope.                                                                                                                                                                                                                | `DPA` cl.2, cl.3.5 · `COMPLIANCE-PDPA` §2.1, §6.4, §9 P16, §11 (new questions) · `ARCHITECTURE` §4                                                                                              | **BY-2027** (audit-payload fix: **before P16**)                    |
| **9**  | **Put localisation on the roadmap with a name, a date and a gate.** There is currently no item in `ROADMAP.md` at all. Cost options (a)/(b)/(c) from §5.5 mitigation 5 by the end of the R1 pilot and make the decision a gate on M6, so the answer is known before there are dozens of schools rather than after. Move `redactForAI()` from M5 5.3 to M0/M1 to match its stated P0 priority and the DPA's cl.9.3 warranty, and make it **fail closed**.                                                                                                                                                                                                                                                         | `ROADMAP` (no item exists) · `COMPLIANCE-PDPA` §5.5, §8.2, §9 P18 · `DPA` cl.9.3 · `ROADMAP` M5 5.3                                                                                             | **BY-2027** (redactor: **MUST**)                                   |
| **10** | **Staff and candidate fairness.** Staff privacy notice at invitation recorded in `legal_acceptances`; staff can see their own workload/attendance/cover metrics; DPA/ToS clause that those metrics are advisory and never an automated employment decision. Rename the hiring "Verified" badge to "Documents checked by Acadigma on {date}" with the method stated; check NTRCA numbers against the NTRCA service where one exists; never surface a rejection to a school; give rejections and `suspected_fraud` an appeal. Add an employer-exclusion list to `open_to_work`. Take anonymous school reviews off the roadmap until counsel opines on Penal Code ss.499/500 and the Cyber Security Ordinance 2025. | `F-TE-06`, `F-AC-04`, `F-OP-02`, `F-TE-07` · `F-OP-01` §3.5, §3.6, W10 · `F-CM-02` §3 · `TEACHER-SIDE` §8, §10 items 8 and 19 · `DPA` cl.4 (students-only today) · `COMPLIANCE-PDPA` §3.1, §9.1 | **BY-2027** (open-to-work exclusion list: **before hiring ships**) |

### Two additions to §11, questions for counsel

- **Q13.** Is there one supervisory body or two? `DPA` cl.13.4 defines "the Authority" as the PDPA supervisory authority; the National Data Governance Ordinance creates the National Data Management Authority over national databases. Confirm which body supervises the PDPA, and whether registration of fiduciaries is live.
- **Q14.** Does parental consent lapse at 18, and what must a school do about a student who turns 18 mid-enrolment — specifically, does the parent's portal access require the now-adult student's own consent from that date? (R24.)

---

_Reviewed 2026-09-17. Legal claims re-checked against Securiti, SCL Insights, security.land, DataGuidance, The Business Standard and Bangladeshi press; the gazetted text of the Act was not available to me either. Not legal advice._
