# Adversarial review #1 — the school owner

**Reviewer persona.** Proprietor and Principal, a Bangla-medium private school in Sector 11, Uttara, Dhaka. **450 students** (Play–Class 10), **25 teachers**, 6 office and support staff (one accounts clerk, one computer operator, two peons, one security, one ayah). Average monthly tuition **৳1,800**; monthly collection roughly **৳810,000** when everyone pays, which they never do. We pay **ClassTune** — about **৳4,500/month** — plus masking SMS on top. Fees are recorded in a register by hand and taken in cash at the office window, plus a **bKash personal number in my wife's name**. I have been sold school software twice before: once a ৳45,000 "lifetime licence" from a Mirpur shop that stopped answering the phone in eight months, and once an "app" that turned out to be a website with a shortcut icon. I am not hostile. I am tired.

**Documents reviewed.** `COMPETITORS.md`, `PRICING-AND-SALES.md`, `TEACHER-SIDE.md`, `GO-TO-MARKET.md`, `OUTREACH-TEMPLATES.md`, `VOICE-OF-CUSTOMER.md`, `PRD.md`, `PRODUCT-DECISIONS.md` §4–5, `plan/ROADMAP.md`.

**Verdict in one line.** The research is honest about what it does not know, and it is unusually good on teachers. But it was written by someone who has read about my school rather than sat in my office during the last week of November — and on the three things that decide whether I sign (money in, the board, and the forty days my school is shut for Ramadan) it is either wrong, silent, or contradicts itself across documents.

---

## 1. Claims I reject or doubt

### 1.1 "Price is not the barrier in this segment"

> "a 400-student school charging ৳10,000/month collects **~৳4,000,000/month**… Acadigma Starter at ৳2,999 is 0.075%. **Price is not the barrier in this segment. Switching cost and trust are.**" — `COMPETITORS.md` §6.5

> "a BD private school will spend roughly 0.2–0.5% of tuition revenue on administrative software… Acadigma is asking for **0.24%**" — `PRICING-AND-SALES.md` §5

**Why I disagree.** Both figures are built on an English-medium school charging ৳4,000–10,000 a month. That is not the market. `TEACHER-SIDE.md` §4.1 says it plainly: **93.7% of secondary schools are private and overwhelmingly Bangla-medium**, and `COMPETITORS.md` §6.1 says the English-medium segment is "on the order of 150–350 schools… **cannot alone support the business**." So do the arithmetic on my school, not on theirs.

450 students × ৳1,800 = **৳810,000/month**. I have 25 teachers, so Starter's 20-teacher cap (`PRODUCT-DECISIONS.md` §5.1) does not fit me and I am pushed to **Pro at ৳7,999**. That is **0.99% of my tuition line** — four times the band your own research says schools tolerate, and it is on gross collection, not on what actually arrives. My realised collection in a normal month is around 88%; in February and March it is under 70%. Against ৳713,000 actually collected, ৳7,999 is **1.12%**.

And ৳7,999 is not compared against 1% of revenue in my head. It is compared against **one junior teacher's half-month salary** (my newest Class 3 teacher is on ৳11,000), or **five months of the ৳1,500/month I pay the computer operator's overtime**. That is the frame, and `GO-TO-MARKET.md` §8.1 actually gets it right — "compare to one part-time data-entry salary" — which directly contradicts the "0.075% of revenue, price is not the barrier" line in `COMPETITORS.md`. You cannot hold both.

**What would convince me.** Re-run §5 and §6.5 on a **Bangla-medium school at ৳1,500–2,500 monthly tuition with 60–75% on-time collection**, and state the software line as a % of _collected_ revenue and as a fraction of a junior teacher's salary. If the answer is still under 0.4% of collections, I will believe you.

---

### 1.2 The teacher cap, not the student cap, is what breaks your pricing

> "**Starter ৳2,999** — 20 teachers, 600 students… **Pro ৳7,999** — 75 teachers, 2,500 students" — `PRODUCT-DECISIONS.md` §5.1

> "a 900-student school needing Pro (৳7,999) purely for the student cap… If that pattern appears more than 3 times, introduce **Starter+**" — `GO-TO-MARKET.md` §8.3

**Why I disagree.** You watched for the wrong cap. My 450 students sit comfortably inside Starter's 600. My **25 teachers** do not fit inside 20. So I pay ৳5,000 more per month for five teacher logins — and I get hiring, cover teacher and analytics I did not ask for. `PRICING-AND-SALES.md` §3 says per-seat pricing is "culturally unsellable here; a school with 40 teachers will not pay per teacher" — correct — and then `PRODUCT-DECISIONS.md` ships a teacher cap, which is per-seat pricing wearing a hat.

Worse: a teacher cap makes me ration logins. I will give accounts to 20 teachers and tell the other 5 to share, which destroys your own north-star metric (`GO-TO-MARKET.md` §10.1, WATA) and your ≥70% weekly-active-teachers exit criterion (`PRD.md` §3.4). You have built a cap that pays you ৳5,000 to make your product look like it is failing.

**What would convince me.** Kill the teacher cap entirely. Price on students only. Every teacher, every staff member, every parent free — the way EduGradUP and Fedena do, as your own §3 notes.

---

### 1.3 Three documents recommend three different prices

> Option C hybrid: "**Starter ৳1,500** up to 150 students, **+৳6/student**; **Pro ৳3,500** up to 300, **+৳8/student**" — `PRICING-AND-SALES.md` §11

> "Keep the plan names as _feature_ tiers; price each on a student band… 301–600: Starter ৳2,999 / Pro ৳5,999" — `COMPETITORS.md` §8.2

> "**Stay per-school with student/teacher caps.** Per-student pricing is transparently 'a tax on growth'" — `GO-TO-MARKET.md` §8.3

> "Price: Starter ৳2,999 টাকা/মাস, Pro ৭,৯৯৯" — `OUTREACH-TEMPLATES.md` §4b, §4c, §9

**Why I disagree.** Not a disagreement — a defect. At my school size these give **৳3,300** (PRICING Option C), **৳5,999** (COMPETITORS band), and **৳7,999** (the number your salesman is scripted to say to my face). That is a 2.4× spread, and the number in the script is the worst one for me.

I will find out. Every principal in the Uttara KG-and-school owners' group compares quotes within a week. The day one of us gets ৳3,300 and I have signed at ৳7,999, you lose both of us and the fourteen others in that WhatsApp group. `GO-TO-MARKET.md` §8.4 says regional pricing "leaks instantly in a market this connected" — that is exactly right, and it applies to your own internal contradiction too.

**What would convince me.** One pricing grid, in one document, that `OUTREACH-TEMPLATES.md` quotes verbatim. Until then the whole pricing section is unreviewable.

---

### 1.4 "The onboarding fee is a BD norm, charge ৳5,000 / ৳10,000–15,000" — while the sales script gives setup away free

> "**Onboarding fee** — **৳5,000 one-time**, waived on annual prepay" — `PRICING-AND-SALES.md` §11

> "**Add a one-time onboarding fee of ৳10,000–15,000.**" — `COMPETITORS.md` §8.2

> "Free setup + data import (**always included** — it costs you an evening…)" — `GO-TO-MARKET.md` §3.4

> "আমি যা করব (সব আমার দায়িত্বে)… ছাত্রছাত্রীদের তালিকা Excel থেকে তুলে দেওয়া" — `OUTREACH-TEMPLATES.md` §5 (pilot proposal, free)

**Why I disagree.** Pick one, and understand what you are actually charging for. I do not mind paying a setup fee — I paid ৳10,000 to the Mirpur shop. What I mind is being told it is free in the pilot proposal and then invoiced for it at conversion. That is the exact move that made me distrust vendor #2.

Also: my student data is **not** in Excel. It is in a ভর্তি রেজিস্টার — a bound admission register, handwritten, with 450 entries, plus guardian names and NIDs on photocopied admission forms in a steel almirah. `GO-TO-MARKET.md` §9.1 says "take their Excel, map it live, import, show the count. _Do this yourself, on the call_." There is no Excel. Data entry for 450 students with guardian names, two phone numbers each, dates of birth and birth-registration numbers is **three to four days of one person's work**, not "an evening." You have mispriced your single largest onboarding cost by roughly 10×, and it is the cost that decides whether the project ever starts.

**What would convince me.** A stated, honest data-migration price (I would pay ৳8,000–12,000 for someone to come and type 450 admission-register rows, and so would every school on my road), plus an offer to do it from **photographs of the register pages** rather than demanding a spreadsheet I do not have.

---

### 1.5 "Fee collection is R1.5" — no, it is the only reason I would move

> "Anti-ICP — say no, politely… **Schools that want fee collection / accounting as the first module.**" — `GO-TO-MARKET.md` §1.2

> "**Fees collection and accounting is the anchor module.** It appears first or second on every vendor's list… **This is the single most important structural fact in this document.**" — `COMPETITORS.md` §1.1

**Why I disagree.** Your own competitor research identifies the anchor module, and your own go-to-market plan then instructs the founder to **refuse the schools that want it**. That is not segmentation, it is deleting the market.

I do not have an attendance problem. My teachers have taken হাজিরা on paper for nineteen years and it takes them ninety seconds, not sixty. I have a **money problem**: at any moment roughly ৳180,000–220,000 of tuition is outstanding across 60–80 students, I cannot tell you today which 60, and my accounts clerk reconciles the bKash personal statement against the cash register with a calculator on the 5th of every month and is always ৳2,000–4,000 out. _That_ is what I would pay ৳8,000 a month to fix. Attendance in 60 seconds is a nice thing you do for my teachers. It is not a purchase order.

`ROADMAP.md` puts fees in **M4**, after M0–M3 (149 parts). By your own milestone ordering I am being asked to buy, run for a year, and wait — while ClassTune's ClassPay, broken as it is, at least _exists_.

**What would convince me.** Move `F-CM-08` fee heads / invoice runs / cashier / defaulter list (M4 items 4.2) **before** the R1 launch gate, even without online payment. A printed money receipt with a serial number and a defaulter list I can hand to the class teachers is worth more to me than the entire exams module, because I already have a way to make report cards and I do not have a way to find my money.

---

### 1.6 "School as merchant of record" — most of us cannot be merchants

> "Route to bKash/Nagad **as the school's merchant, not Acadigma's**, to avoid becoming a payment aggregator." — `COMPETITORS.md` §6.4

> "a parent pays by student ID through **the school's own merchant account**" — `ROADMAP.md` M4 exit criterion

**Why I disagree.** I checked what that requires. A bKash merchant account needs a **valid trade licence in the institution's name, a TIN, and an institutional bank account** ([bKash merchant](https://www.bkash.com/en/business/merchant)); schools without one are pushed to a **Personal Retail Account with transaction limits**. My school is run by a managing committee. Our bank account is a joint account in the names of the chairman and me. Our "trade licence" is a City Corporation licence issued to _me_, not the institution, and our EIIN paperwork is separate again. Getting a merchant account in the school's name means a committee resolution, a bank visit, and probably a new licence — **weeks**, and a conversation with a committee chairman who does not want school money moving through a system he cannot see.

Your research never once asks whether the buyer is _able_ to be the merchant of record. It assumes it. For the ~19,000 Bangla-medium non-government schools that are your actual volume, this assumption fails more often than it holds — and when it fails, your R1.5 exit criterion cannot be demonstrated at that school at all.

**What would convince me.** Ship the offline half of the fee module first (heads, invoices, cash receipts, dues, reconciliation against a bKash personal statement _imported as CSV_), and treat the online-merchant path as an upgrade for the schools that can clear it. Also: document a **Personal Retail Account** path, because that is what half your customers will actually be using.

---

### 1.7 ৳25,500 SSLCommerz is presented as the only door

> "The **৳25,500 SSLCommerz setup is a real pre-revenue cost**… Sandbox is free; live is not." — `PRICING-AND-SALES.md` §4

**Why I doubt it.** aamarPay publishes tiered setup fees including an explicit **Education tier at ৳4,999** and B2B at ৳6,999; ShurjoPay is quoted at ৳10,000–15,000; several 2026 comparisons still quote SSLCommerz setup at ৳15,000 ([Moneybag](https://moneybag.com.bd/10-best-payment-gateways-in-bangladesh/), [Bengal Cloud](https://bengalcloud.com/best-payment-gateway-in-bangladesh/)). MFS rates at aamarPay/ShurjoPay run 1.8–2.1% on wallets versus SSLCommerz's 2.5% blended. On my fee volume — if 40% of ৳810,000 ever goes online, that is ৳324,000/month — the difference between 2.5% and 1.9% is **৳1,944 every month, forever**, paid by me. `PRODUCT-DECISIONS.md` §4.1 correctly puts a `PaymentProvider` interface behind it, so this is a commercial choice, not an architectural one, and it was never evaluated.

**What would convince me.** A one-page gateway comparison with **setup, MDR by channel, settlement days and education-sector terms** for SSLCommerz, aamarPay, ShurjoPay and bKash direct, and a statement of which one the _school_ is put on. It is my money, not yours.

---

### 1.8 "SMS: move a provider into R1" — but nobody costed the paperwork or the ownership

> "Masking is ৳0.25–0.52/message and requires a signed institutional authorisation letter — **lead time, not just cost**." — `COMPETITORS.md` §7(a)

> "**SMS** — **৳0.35/SMS**, 500 included/month on Pro" — `PRICING-AND-SALES.md` §11

**Why I disagree.** 500 SMS a month on Pro is a rounding error for me. Absence SMS alone, at 8% daily absence across 450 students on ~24 school days, is **864 messages a month**. Add fee reminders (my 70 defaulters × 2 = 140), exam notices, holiday notices, result notices — I send **2,000–2,600 SMS a month** and I already pay about ৳700 for it. Your bundle covers a fifth of my usage and then meters the rest at ৳0.35, so my real bill is ৳7,999 + ~৳700 = **৳8,700**, not ৳7,999. That is not what your script quoted me.

Second, ownership. Masking sender-ID registration needs an authorisation letter on institution letterhead with the head's signature and seal, plus NID and trade licence, and takes **6–7 working days for approval plus 1–3 days for operator activation** ([sender-ID requirements](https://ummahhostbd.com/blog/sender-id-in-sms-marketing)). Whose sender ID is it — mine or yours? If parents receive fee reminders from a mask that says ACADIGMA instead of my school's name, I will be asked in the গার্ডিয়ান meeting why a private company is texting parents about my school's money. That is a fight I do not want.

**What would convince me.** Quote SMS **outside** the plan price in every script, size the bundle at 2,000/month or drop the bundle entirely, and state in writing that the sender ID is registered **in the school's name** with a documented 10-working-day lead time started at contract signature, not at go-live.

---

### 1.9 "Sep–Oct is the prime pilot window"

> "**Sep–Oct** … **Prime pilot window.** 'Run your annual exam on Acadigma for free'… **Nov–mid Dec** — Annual exams, results, admissions, chaos — **Prove value, do not sell.**" — `GO-TO-MARKET.md` §1.4

**Why I disagree, strongly.** September to December is the single period of the year when I will not touch new software. Annual exams, tabulation, প্রগতিপত্র, promotion lists, admission circular, admission tests, next year's section allocation, and the BANBEIS/board data work all land in that window. If your system produces one wrong GPA in the বার্ষিক পরীক্ষা, I have 450 angry guardians and a managing committee meeting. The downside is catastrophic and the upside is "faster report cards."

You even acknowledge the risk yourself — `VOICE-OF-CUSTOMER.md` §4.2 collects 1★ reviews from exam week — and then schedule the pilot into exam week anyway.

The window a principal will actually say yes to is **mid-April to June**: the year has settled, the first term exam is the low-stakes one, and if it goes wrong nobody's career is damaged. Second-best is **January**, on new admissions only.

**What would convince me.** Restructure the calendar: **set up in Jan, prove on the 1st terminal exam in April/May, close for the full school before the annual exam.** And never, ever run a first exam cycle on a new system in November.

---

### 1.10 Nobody planned for the forty days my school is shut

**Why this is a hole.** Bangladesh closes primary and secondary schools for a combined Ramadan + Eid-ul-Fitr holiday that has recently run **36 to 40 days** ([TBS](https://www.tbsnews.net/bangladesh/education/schools-remain-closed-throughout-ramadan-until-26-march-1365576), [Dhaka Tribune](https://www.dhakatribune.com/bangladesh/education/374641/educational-institutions-to-close-for-40-days)). In 2027 that falls roughly **February into mid-March**. `GO-TO-MARKET.md` §1.4 disposes of this in six words: "Ramadan/Eid disrupt (also: ad CPMs spike)."

What actually happens in your product during those 40 days:

- Attendance completeness goes to **zero** at every school simultaneously.
- `GO-TO-MARKET.md` §9.5 fires "attendance completeness < 60% for 5 school days → **WhatsApp the champion that day**" — for every customer at once, wrongly.
- The health score (§9.4) collapses across the whole base; §12.3's "never onboard more schools than support can keep above health-score 75" becomes unusable.
- WATA, your north star, goes to zero for six weeks and your weekly scorecard shows a company in freefall.
- Meanwhile I am still billed ৳7,999 for a month in which nobody logs in — and **fees are still due**, because Bangladeshi schools collect Ramadan-month tuition and pay **উৎসব ভাতা (Eid bonus, typically one month's salary to every employee)** in that same window. My single biggest cash-out event of the year is invisible to your product and to your plan.

**What would convince me.** A school-calendar-aware health score that uses `app.is_school_day` (which `ROADMAP.md` M2 2.2 already builds!) as the denominator everywhere, a documented long-holiday mode, and a billing answer for the closure month. Also a festival-bonus line in whatever payroll you eventually ship.

---

### 1.11 "No incumbent with a defensible reputation" — I am _paying_ the incumbent

> "**The Bangladeshi school-OS market has no incumbent with a defensible reputation.** The category leader by review volume, ClassTune, sits at **3.18★ across 2,743 ratings and has not shipped an update since 14 June 2024**." — `VOICE-OF-CUSTOMER.md` §7.1

> "No published School360 / **Classtune** / Teachmint / MyClassboard price" — `PRICING-AND-SALES.md` §13 (open gap)

**Why I disagree.** A bad app rating is not the same thing as a weak incumbent, and you have confused the two. ClassTune has my **student data**, my **three years of result history**, my **parents trained on one login**, and — crucially — a **field person named Rasel who picks up the phone on a Friday**. `COMPETITORS.md` never profiles ClassTune at all, and `PRICING-AND-SALES.md` admits it does not know its price. You have written 92 KB about competitors and omitted the one my school actually pays.

The switching cost you must overcome is not 3.18 stars. It is: re-entering 450 students, re-training 25 teachers and ~700 guardians, losing three years of history, and explaining to a managing committee why I am changing systems again after the ৳45,000 licence fiasco. That is worth far more than the ৳1,500/month you might save me.

**What would convince me.** A proper ClassTune profile — price, contract length, what ClassPay does and does not do, and above all **a documented migration path that imports my ClassTune export**. "Export everything to Excel any time" (`OUTREACH-TEMPLATES.md` §5) is a promise about _your_ data; say something about _theirs_.

---

### 1.12 The marketplace is the weakest idea and it is priced into my plan

> "the marketplace is ~0.6% of revenue… treat the marketplace as a _network and retention asset_" — `PRICING-AND-SALES.md` §7

> "**Pro includes ৳1,000/month of marketplace credit.** This makes Pro's price feel smaller" — `GO-TO-MARKET.md` §6.5

> "the absence of any commercial Bangla teacher-material marketplace… is at least as consistent with **'teachers here share for free and will not pay'**" — `COMPETITORS.md` §3.4

**Why I disagree.** Your own research calls this "the **single highest-risk assumption in the product**" and then embeds ৳1,000 of it into the price of the plan you want me to buy. I am not funding your marketplace experiment out of my tuition. If the credits are real money, give me a ৳1,000 discount instead; if they are not real money, do not present them as value.

Second, and more sharply: my teachers making worksheets **on my time, on my syllabus, using my school's AI credits, and selling them for personal profit** is not a benefit you have sold me — it is a staff-discipline problem you have created. `TEACHER-SIDE.md` §2.3 says there is "effectively no attribution norm" and material is re-shared freely. So my Class 9 question bank ends up on a public storefront with a teacher's name on it, and next year another school in Uttara is running my প্রশ্ন. Nobody asked me.

**What would convince me.** (a) An explicit, default-**off**, school-level switch: _my staff may not list materials created in this workspace_. (b) A written policy on who owns material authored inside a school workspace. (c) Take the ৳1,000 credit out of the plan price and out of the pitch until the pilot gate in `ROADMAP.md` M6 clears.

---

### 1.13 "Free ৳0 for madrasa/NGO, 25 schools" and "Free plan, 150 students" as a wedge

> "**Free** ৳0 up to **60** [students]… Unbeatable — nobody serves this segment" — `PRICING-AND-SALES.md` §11
> "**Free ৳0** — 5 teachers, 150 students" — `PRODUCT-DECISIONS.md` §5.1

**Why I disagree.** Another cross-document contradiction (60 vs 150), but the substantive point is different: **a free tier teaches my market that this software is free.** The two schools nearest me are 110 and 140 students. They will run on Free forever, and when I sit in the KG-owners' association meeting and say I pay ৳7,999, I look like the man who got taken. `GO-TO-MARKET.md` §5.6 answers this with a "Powered by Acadigma" footer on free PDFs — which only tells every guardian that the small school next door uses the same system I pay for.

**What would convince me.** Either make Free genuinely crippled (no PDF report cards at all — that is the thing schools actually pay for), or make it time-boxed. A permanently free tier with report cards, in a market where a ৳30,000 perpetual licence is still the mental anchor (`COMPETITORS.md` §1.2), is a price-anchoring own goal.

---

### 1.14 "14-day trial" vs "8–12 week paid pilot" vs "2-week free pilot"

> "**14 days of Pro** on school creation, no card." — `PRODUCT-DECISIONS.md` §5.2
> "**Pilot length: one full exam cycle, not 14 days**… Sell an **8–12 week paid pilot**… Free pilots do not get used" — `PRICING-AND-SALES.md` §12
> "**'এক শাখা, দুই সপ্তাহ' — One section, two weeks, free**… **Price:** ৳0." — `GO-TO-MARKET.md` §3.4

**Why I disagree.** Three incompatible offers. And the one your scripts actually use — two weeks, free, one section — is the weakest of the three _and_ it is the one the research itself argues against. Fourteen days tells me nothing. It does not contain an exam. It does not contain a fee cycle. It does not contain a month-end. I cannot take a two-week trial to my managing committee as evidence of anything.

`PRICING-AND-SALES.md` §12 is right and the GTM doc overrode it without saying why: **a paid pilot through one terminal exam**. A school that has paid ৳3,000 will train its staff. A school on a free pilot puts it on the "we'll see" pile — I have done exactly that to two vendors.

**What would convince me.** One offer: **8–10 weeks, ৳2,000/month founding price, covering one terminal exam, written success criteria, auto-converts unless I say stop.** Charge me. I will respect it more.

---

### 1.15 "Compliance with the Personal Data Protection Ordinance 2025" — in a document you want me to sign

> "শিশুদের তথ্য সংক্রান্ত **২০২৫ সালের অধ্যাদেশ** আমরা মেনে চলি।" — `OUTREACH-TEMPLATES.md` §5 (the pilot proposal PDF), repeated in §9 and `GO-TO-MARKET.md` §1.5 objection 5 and §13.4

**Why I disagree.** `COMPETITORS.md` §6.3 states correctly that the Ordinance 2025 was amended in February 2026 and then **repealed and replaced by the Personal Data Protection Act, 2026 (Act 63 of 2026)**, and that is confirmed independently ([Securiti overview](https://securiti.ai/bangladesh-personal-data-protection-act-overview/), [Bangladesh enacts data protection law](https://www.security.land/bangladesh-data-protection-law-localization/)). Your customer-facing pilot proposal, your objection scripts and your GTM legal checklist all still cite the **repealed** instrument. I am being handed a compliance claim that names a law that no longer exists.

I would not necessarily catch it. My committee chairman is a retired joint secretary and **he would**.

Two further gaps nobody covered:

- **Data localisation.** The amended framework requires at least one synchronised real-time in-country copy for _restricted_ data classes ([Daily Star, on the easing of localisation rules](https://www.thedailystar.net/news/bangladesh/news/govt-eases-data-localisation-rules-drops-jail-terms-tech-firms-4076391)). Nothing in the research classifies student records against those categories, and Supabase/Vercel are both outside Bangladesh (`COMPETITORS.md` §6.3 item 4 raises cross-border transfer but not the local-copy rule at all).
- **Penalties.** The research quotes ৳25 lakh / ৳50 lakh; commentary on the 2026 amendment also reports a turnover-based penalty of up to **5% of annual turnover**. Get the number right before you print it on a security one-pager.

**What would convince me.** Every customer-facing artefact cites **PDPA 2026 (Act 63 of 2026)** by name; a one-page data-residency statement saying where my students' rows physically sit and why that is lawful; and a signed **Data Processing Agreement** in the pack, not "offered to every school" as §13.6 puts it — in the pack, before I sign.

---

### 1.16 "Teachers aren't tech-literate → hand your phone to the oldest teacher"

> "'They already use Facebook and bKash. If a teacher can send a Messenger voice note, she can take হাজিরা. Watch —' [do the 60-second demo… then **hand your phone to the oldest teacher present and let _her_ do it**]. This single move closes more schools than any slide." — `GO-TO-MARKET.md` §1.5, objection 3

**Why I disagree.** This is a stunt that can only go two ways, and one of them ends the meeting. If my senior-most teacher — a woman of 54 who has taught বাংলা here for sixteen years and is respected by everyone in the room — fumbles a stranger's phone in front of her principal and her colleagues, you have humiliated her, and I will not buy from you. You have also created an enemy who will make sure your software fails at my school, which is exactly the "specific teacher is blocking" failure your own §9.5 lists.

**What would convince me.** Reframe it: hand the phone to the **youngest** class teacher, or better, let a teacher try it **privately after the meeting** and report back. Never demo a teacher's competence to her employer.

---

### 1.17 "Facebook-first, Messenger cold outreach to school Pages"

> "**400 contacts → 100 replies → 50 demos → 20 pilots → 10 paid**… Contacts → reply **25%** (Messenger to a school page, Bengali, one question)" — `GO-TO-MARKET.md` §3.2, §3.6

**Why I doubt it.** My school's Facebook page is run by a Class 8 student's elder brother whom we pay ৳2,000 a month to post exam notices and sports-day photos. He does not read the inbox. When he does, he does not tell me. A 25% reply rate from cold Messenger to school pages is an assumption presented as a funnel input, and the entire 90-day plan is built on it — `GO-TO-MARKET.md` §12.1 even says the ৳0 plan "is entirely achievable."

The channel that actually reaches me is: someone I know, or a **guide-book / khata seller who already walks into my office**. `GO-TO-MARKET.md` §4.10 buries this at the bottom as "print and offline." It should be at the top. The man who sells me হাজিরা খাতা and প্রগতিপত্র booklets sees forty principals a month and is trusted by all of them.

**What would convince me.** Test the Messenger reply rate on 60 schools before building a 13-week plan on 25%, and promote the stationery/guide-book channel from §4.10 to a primary channel with a proper commission structure.

---

### 1.18 Reseller terms contradict each other by a factor of two

> "**Commission**: **25% of collected subscription revenue for the first 12 months**, then 10% recurring" — `GO-TO-MARKET.md` §4.7
> "**Restructure as 100% of months 1–3 (৳11,400 one-time) + 10% recurring.**" — `PRICING-AND-SALES.md` §9.5, repeated in §11 and §12

**Why this matters to me, the customer.** Because the agent who calls on me will quote whichever is better for him and then discover the other, and a disgruntled agent badmouths a product in a district for years. More practically: the agent decides what I am promised. `GO-TO-MARKET.md` §4.7 says agents "may not… promise unshipped features" — good — but nothing in the plan makes them _able_ to answer "does it do fees?" honestly when their income depends on yes.

**What would convince me.** One reseller schedule, written once, with the clawback attached; and an agent certification that includes a signed list of the things the product does **not** do.

---

### 1.19 "Hiring pulled into R1 as the acquisition engine"

> "**Pull a minimal hiring surface forward from R3 into R1**… **Highest-leverage change in this document.**" — `TEACHER-SIDE.md` §10 P0-1

**Why I doubt it, from my chair.** You are proposing to put a **job board inside the software I run my school on**, and then tell my teachers it is private-by-default with an `open_to_work` flag they can hide from me (`TEACHER-SIDE.md` §10 P1-8). Understand what you are asking me to buy: a tool that makes it easier for my teachers to leave, installed at my expense, on my subscription.

I am not against it in principle — I hire 3–5 teachers a year and I hire them badly, through Facebook groups and the ex-teacher network, and I have twice hired someone whose B.Ed turned out to be worthless. The verified-credential argument in `TEACHER-SIDE.md` §4.3 is genuinely strong. But the plan as written serves the teacher and bills the school, and no document addresses the owner's obvious objection.

**What would convince me.** Sell me the **hiring** side (post a job, verified candidates, scorecards) in R1.5 as `ROADMAP.md` M4 4.6 already contemplates, and keep the **teacher's portable open-to-work profile** on the personal workspace, off my subscription, so I am not paying for it. Say this out loud in the sales script instead of hoping I do not notice.

---

### 1.20 "Attendance in ≤60 seconds" as the headline promise

> "A teacher marks a 40-student section's attendance in **≤ 60 seconds**" — `PRD.md` §3.1; "This is the demo. Everything else is support." — `GO-TO-MARKET.md` §3.3

**Why I doubt it is the right headline.** My teacher already does this in about ninety seconds on paper with a pen, and the paper never fails to load. Your own `VOICE-OF-CUSTOMER.md` §3 makes the point better than I can: "the low percentages for attendance, results and timetable do **not** mean those features work well… users never get past login and loading." The measurable thing I care about is not the 60 seconds of marking; it is **whether 25 teachers across 14 sections all completed it by 9:30 every day for a month**, which is a discipline-and-reliability problem, not a UI-speed problem.

**What would convince me.** Change the demo promise from "60 seconds" to "**by 9:30, every section, every day — and here is the screen that shows me who didn't**." That is the owner's metric. `GO-TO-MARKET.md` §2.2 already has it ("which teachers haven't marked হাজিরা") and then buries it behind the stopwatch.

---

## 2. Claims I strongly endorse

1. **"Reliability beats breadth."** — `VOICE-OF-CUSTOMER.md` §7.1. Correct, and it is the single most valuable page in the whole research folder. My complaint about ClassTune is not features. It is that my accounts clerk is logged out twice a week and three guardians a month call the office because they cannot reset a password. The P1 requirement — sessions that survive cold start, **three visible recovery paths**, and an **admin "reset credentials" button on any row** — would save my office maybe six hours a month. Nobody has ever pitched me that, and I would buy it.

2. **"No biometrics on children."** — `COMPETITORS.md` §6.3 item 3 and §7(c). Every vendor who walks into my office leads with a fingerprint machine. I have watched two of them fail: 450 small, damp fingers in June, a ten-minute queue at the gate, and a device that has to be replaced every two years. QR ID cards with a signed token is the right answer on cost, on the gate queue, and now on the law. **Market this loudly** — "we do not take your children's fingerprints" is a sentence a guardian meeting will applaud.

3. **The 24-hour their-logo report card.** — `OUTREACH-TEMPLATES.md` §2b. This is the only thing in the whole outreach pack that would actually get my attention. Our প্রগতিপত্র has a specific header, a Bengali subject order, a co-curricular block and a principal's remark line, and every vendor has told me "we'll adjust it later." Send me mine, correct, in 24 hours, and you have my meeting. Deliver it wrong and you are finished — so only make this offer if you can keep it.

4. **Honesty on fees ("না, এই ভার্সনে নেই — সত্যি কথাটাই বলি").** — `GO-TO-MARKET.md` §1.5 objection 12 and `OUTREACH-TEMPLATES.md` §9. I disagree with the _roadmap_ decision (§1.5 above) but the _script_ is exactly right. The vendor who told me the truth about what his software could not do is the only one I ever recommended to another principal. Keep this line word for word.

5. **The BD GPA engine, including the 4th-subject rule.** — `COMPETITORS.md` §6.2. That optional-subject formula is where every Excel sheet in Bangladesh goes wrong, and the rollback to NC-2012 means it matters again. Having it computed in SQL, with a **versioned, per-school grade-scale editor** (`ROADMAP.md` M2 2.7), is real work that nobody else has done properly. If it is correct, say so with the formula printed on the sales sheet — principals will check it, and being checkable is the point.

6. **"Never put student names or marks in a WhatsApp message — send a link."** — `GO-TO-MARKET.md` §4.9 and `OUTREACH-TEMPLATES.md` §7. Correct, and it is a live problem: right now my Class 7 class teacher photographs a mark sheet and posts it in the class WhatsApp group, and I have had two guardian complaints about other children's marks being visible. A permissioned per-child link solves a safeguarding problem I actually have.

7. **Append-only audit visible to the owner.** — `PRD.md` §5.1, `PRODUCT-DECISIONS.md` §6.8. Everyone else sells me "reports." Nobody sells me "you can see who changed a mark after publication, and when." In a school where a teacher once quietly corrected a Class 9 boy's Physics mark after the tabulation, that is worth money.

---

## 3. What the researchers missed — what a principal raises in minute one

Ranked by how early I would bring it up.

1. **The board. Completely absent.** There is not one line in the PRD, the roadmap or any research file about **SSC/JSC registration, form fill-up (ফরম ফিলআপ), the Teletalk payment flow, admit cards, or the board tabulation/result download by EIIN** ([eboardresults institutional result by EIIN](https://educationboard.com.bd/)). For a Bangla-medium secondary school, registration and form fill-up week is the most stressful software week of the year — names, dates of birth and subject codes must match the board exactly or a child does not sit the exam. Any system that holds my student data and _cannot_ produce the board's required format is a system that creates double work. `COMPETITORS.md` §9 lists "Cambridge / Edexcel integration" as a gap and never mentions the eleven national boards that cover 93% of the market.

2. **Government reporting: BANBEIS annual survey, IEIMS/EMIS data entry, and the stipend (উপবৃত্তি) lists.** The stipend programme requires per-student **attendance-percentage certification** to release money to guardians' mobile accounts. A system that already holds attendance and could print that list is holding a feature worth more to a Bangla-medium school than the entire marketplace — and it is the single strongest answer to `PRICING-AND-SALES.md` §5's unresolved "government freebie" risk. Nobody noticed.

3. **Exam operations: seat plan and invigilation duty.** আসন বিন্যাস for 450 students across 8 rooms, with mixed sections so nobody sits beside a classmate, plus a পরিদর্শক duty roster across 25 teachers with fair distribution — that is two evenings of my vice-principal's life, three times a year. You already have sections, rooms (`F-AC-01`), and the timetable. This is a small build with an enormous demo effect, and it appears nowhere.

4. **Admit card printing (প্রবেশপত্র).** 450 per terminal exam, with photo, roll, seat number and subject list. `PRODUCT-DECISIONS.md` §6.6 lists six report types and admit cards are not one of them.

5. **Fee-defaulter mechanics as they actually work.** Our levers are: withhold the admit card, withhold the প্রগতিপত্র, withhold the টিসি (transfer certificate) and testimonial, and finally নাম কাটা (strike the name off the roll). The fee module must model **"block admit card / withhold result if dues > X"**, a per-student waiver with an approver, and sibling discounts. Nothing in `F-CM-08` as summarised suggests any of this. Also: a "defaulter list" is useless to me unless it prints as a **call sheet with guardian name and phone, sorted by amount**, which is what my clerk actually works from.

6. **Staff salary advance and festival bonus.** Half my staff take an advance (অগ্রিম) against salary at some point — Eid, a wedding, a medical emergency. My clerk tracks it on a page in a register. And উৎসব ভাতা at Eid is a one-month payroll spike. `PRODUCT-DECISIONS.md` §6.3 models hourly rates and cover-teacher payroll impact; it does not model the two payroll events that actually keep me awake.

7. **Guardian phone churn.** Numbers change constantly — a father switches operator, a mother's SIM is in the elder brother's name, a family moves. The entire parent-portal loop (`GO-TO-MARKET.md` §5.1, target 60% activation by month 3) assumes a stable phone number per guardian. It needs: **two numbers per guardian, a bounce/undelivered report that flags dead numbers back to the class teacher, and an annual "verify your number" sweep at admission**. Otherwise I am paying ৳0.35 a message to text disconnected SIMs, and the activation metric will never reach 60%.

8. **Load-shedding and the office PC.** `TEACHER-SIDE.md` §7 concludes "**Stop optimising for data cost**" — fine for the phone. But my office runs on a desktop and a router on a ৳9,000 IPS that gives me about 40 minutes. During a two-hour afternoon cut, my clerk cannot take a fee payment, cannot print a receipt, cannot look up a student. Paper never had this problem, and it is the first thing she will say to me. There is no offline story for the **office** anywhere in the PRD — only for teacher attendance.

9. **Printing costs and the print queue.** `PRODUCT-DECISIONS.md` §6.4: "users print from browser or download," real printer support in the Tauri phase (R4). I have **one** HP LaserJet, shared, operated by a peon, and a term's printing is roughly 450 report cards + 450 admit cards + 450 ID cards + registers ≈ **2,000+ pages**, at maybe ৳1.20/page in toner and paper — ৳2,400 a term, plus jams. "Print from the browser" for 450 report cards means somebody sits at that machine for two hours pressing Ctrl+P. A **single merged PDF per section with correct page breaks**, page counts shown before printing, and a reprint-one-student action is not a nicety; it is the difference between the feature working and not.

10. **Who the champion actually is, and that she leaves.** `GO-TO-MARKET.md` §1.3 gets the champion right and §9.5 correctly names champion departure as the #1 silent-churn cause — but nothing in the product handles it. My computer operator is 23, earns ৳9,000, and will leave within 18 months. **Every workflow must be re-learnable from a printed Bengali sheet by her replacement in one afternoon,** and I must be able to reassign everything she owned without calling support.

11. **The managing committee.** For non-government Bangla-medium schools the committee approves spend, and it meets quarterly. `GO-TO-MARKET.md` §1.4 says a committee cycle is "slower than 10 weeks — deprioritise," i.e. deprioritise the majority of the market. What the committee needs is a **one-page Bengali proposal with a cost-per-student figure and a three-year total**, and a page they can see with their own eyes. That artefact does not exist in `OUTREACH-TEMPLATES.md`.

12. **Two schools, one owner.** I also run a small coaching centre in the evening in the same building, with some of the same teachers. `PRD.md` §7 says "One workspace = one campus (multi-campus grouping is future)" — so I need two subscriptions and two logins, and my teachers need to switch. Common enough in Uttara to be worth a line.

---

## 4. My purchase decision

**Would I buy at the proposed pricing?** Not at **৳7,999**, and not for what R1 contains.

**What I would buy, and when.**

|                                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**                         | Campus core **plus the offline half of the fee module** — fee heads, monthly invoice run, cash + bKash receipt with a serial number, per-student dues ledger, and a printable defaulter call sheet.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Price I would sign**           | **৳4,500–5,000/month**, all 25 teachers included, SMS billed separately at cost + 10%, **paid quarterly in advance** (not annually — I do not prepay a vendor I have known for four months).                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Setup**                        | ৳10,000 one-time, explicitly for data entry from my admission register, invoiced up front and delivered before go-live. I will pay it. Do not pretend it is free.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **When**                         | I would sign in **January** for a **February start**… except February is Ramadan. So realistically: **sign in January, set up during the closure, go live in mid-March with the new term, prove it on the first terminal exam in late April.**                                                                                                                                                                                                                                                                                                                                                  |
| **Proof required before I sign** | (1) My প্রগতিপত্র, my logo, my subject order, correct Bengali, in my hand, generated from ten of my real students' marks. (2) A phone call with **two named principals** in Dhaka who have run a full terminal exam on it — not a testimonial card, a phone number. (3) A written answer on the board formats: SSC registration/form fill-up export, or a dated roadmap line. (4) The security sheet, citing **PDPA 2026**, with a DPA I can hand to my chairman. (5) Your trade licence, BIN and a VAT invoice sample — my committee will not approve a payment without a proper মূসক challan. |
| **Who signs**                    | Me, after a committee meeting. Which means your sales cycle to my school is **10–14 weeks**, not the 6 your funnel assumes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**What makes me churn in month 3.**

1. **A wrong number on a প্রগতিপত্র that reaches a guardian.** One wrong GPA and I am out that week, and I will say so in the owners' group. This is the only true single-point-of-failure in your product.
2. **Anything that stops working during exam week or the last three days of the month** (fee collection days). `VOICE-OF-CUSTOMER.md` §4.2 is full of schools that died exactly here.
3. **The login tax.** If my accounts clerk is logged out twice a week, or a guardian cannot reset a password without calling my office, she will go back to the register within a month and I will not find out until the term ends.
4. **A price change, a cap I did not know about, or a feature moving behind a higher plan.** The moment I hit a wall I was not warned about, trust is gone — `VOICE-OF-CUSTOMER.md` §4.8 documents exactly this rage and it is deserved.
5. **Support going quiet.** Both my previous vendors churned me by simply not picking up. If I WhatsApp at 9pm during result week and get nothing by morning, I am already looking elsewhere. Your published Sat–Thu 08:00–22:00 (`GO-TO-MARKET.md` §9.2) is the right promise; breaking it once during result week ends the relationship.
6. **Finding out my teachers are selling my question papers on your marketplace.**

---

## 5. Ten changes I demand, ranked

| #      | Demand                                                                                                                                                                                                                                                                                                                          | Maps to                                                                                                                                                          | What changes                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Ship the offline fee module inside the R1 launch gate, not R1.5.** Fee heads, structures, monthly invoice run, cash/bKash receipt with serial, per-student arrears ledger, defaulter call sheet with guardian phone, waiver with approver, "block admit card if dues > X". Online payment and merchant-of-record can follow.  | `ROADMAP.md` M4 4.2 (F-CM-08 P1–6) → move ahead of the **M3 R1 launch gate**; `PRD.md` §4 R1 exit criterion; deletes the anti-ICP rule in `GO-TO-MARKET.md` §1.2 | The anchor module your own `COMPETITORS.md` §1.1 identifies stops being a year away. This is the difference between a product I evaluate and a product I buy. |
| **2**  | **One pricing grid, student-banded, no teacher cap, published once.** Reconcile `PRICING-AND-SALES.md` §11, `COMPETITORS.md` §8.2, `GO-TO-MARKET.md` §8.3 into a single table; unlimited staff and parent accounts on every tier; SMS always quoted separately.                                                                 | `PRODUCT-DECISIONS.md` §5.1; `ROADMAP.md` M0 0.5 (`plan_prices` bands + overage, D-28); every price line in `OUTREACH-TEMPLATES.md`                              | Removes the 2.4× quote spread, removes the ৳5,000 penalty for my 25th teacher, and stops my product from suppressing its own activation metric.               |
| **3**  | **Board and government outputs on the roadmap with a date.** SSC/JSC registration and form fill-up export in the board's field order; admit card (প্রবেশপত্র) as a first-class report; EIIN-keyed tabulation import; BANBEIS annual-survey export; stipend attendance-certification list.                                       | New parts under `F-OP-03` (reports) and `F-AC-02`/`F-AC-06`; `ROADMAP.md` M3 3.2; closes `COMPETITORS.md` §9 gap 8 (which only names Cambridge/Edexcel)          | This is the Bangla-medium segment's actual job-to-be-done and it is the strongest available defence against a future free government EMIS.                    |
| **4**  | **Calendar-aware everything, and a long-holiday mode.** Health score, churn thresholds, WATA, attendance %, and billing all use `app.is_school_day`. A declared Ramadan/Eid closure suppresses churn alerts, freezes health-score decay, and triggers a documented billing decision.                                            | `ROADMAP.md` M2 2.2 (`app.is_school_day`) consumed by `GO-TO-MARKET.md` §9.4/§9.5 and `PRD.md` §3 metrics                                                        | Stops your entire customer base showing red for six weeks every year, and stops you WhatsApping 100 principals to ask why nobody took attendance during Eid.  |
| **5**  | **Fix the login tax before anything else, and make it an exit criterion.** Sessions survive cold start and 30 days idle; three visible recovery paths on the sign-in screen; a one-tap admin **Reset credentials** on any staff/parent/guardian row; zero forced re-auth in a 30-day soak test; no infinite spinners anywhere.  | `VOICE-OF-CUSTOMER.md` §7 P1/P1b; `ROADMAP.md` M0 0.2 (F-ID-01 P1–4) + M4 4.5; add to `PRD.md` §3 success metrics                                                | The highest-frequency BD-specific complaint in 26,000 reviews, and the thing that quietly killed my last vendor's adoption inside my office.                  |
| **6**  | **A real migration path in and out — including from ClassTune.** A documented importer that accepts the competitor's export _and_ photographs/scans of a handwritten admission register; a stated, priced data-entry service; one-click full export to Excel + PDF, self-serve.                                                 | `ROADMAP.md` M2 2.3 (F-AC-02 P8 CSV import) extended; `PRD.md` §6 Privacy (export/deletion); `COMPETITORS.md` needs a ClassTune profile added                    | Switching cost is the actual barrier, not price. Right now the research has neither measured it nor built for it.                                             |
| **7**  | **Print that a peon can operate.** One merged, correctly paginated PDF per section for report cards / admit cards / ID cards; page count and estimated sheets shown before printing; reprint-one-student; A4 default with margins that survive a LaserJet.                                                                      | `PRODUCT-DECISIONS.md` §6.4 (F-OP-04 P1–3); `ROADMAP.md` M3 3.3                                                                                                  | 2,000 pages a term through one shared printer. "Print from the browser" as specified is a two-hour manual job three times a year.                             |
| **8**  | **Exam operations: seat plan + invigilation duty roster.** Generate আসন বিন্যাস across rooms with section mixing, and a fair পরিদর্শক duty roster from the staff list, both printable.                                                                                                                                          | New parts under `F-AC-06` (exams) using `F-AC-01` rooms and `F-AC-05` timetable; `ROADMAP.md` M3 3.1                                                             | Two evenings of my vice-principal's time, three times a year, that no competitor automates. Cheapest high-impact differentiator available to you.             |
| **9**  | **Marketplace: school-level opt-out, default off, and take it out of my price.** A workspace switch — _staff may not list materials created here_ — plus a written IP policy on workspace-authored material. Remove the ৳1,000/month marketplace credit from the Pro price and from every pitch until the M6 pilot gate clears. | `PRODUCT-DECISIONS.md` §4.6 (school-funded purchases); `ROADMAP.md` M6 gate; `GO-TO-MARKET.md` §6.5                                                              | Your own research calls this the highest-risk assumption in the product. Do not fund it from my subscription or from my question bank.                        |
| **10** | **Fix the compliance and legal artefacts before the first pilot proposal is printed.** Cite **PDPA 2026 (Act 63 of 2026)** everywhere; a data-residency page saying where my students' rows sit; a signed DPA in the pack; correct penalty figures; a VAT/মূসক-compliant invoice sample and BIN on the quote.                   | `GO-TO-MARKET.md` §13.3/§13.4, `OUTREACH-TEMPLATES.md` §5 and §9, `PRD.md` §6 Privacy; `ROADMAP.md` M1 1.10 and M3 3.13                                          | You are currently proposing to hand a school owner a signed document citing a repealed law. My chairman reads these.                                          |

---

## Top 5 objections

1. **You have told your own salesman to refuse me.** Fee collection is the anchor module in your own competitor research and simultaneously sits on your anti-ICP "say no politely" list, one release away in `ROADMAP.md` M4. Attendance speed is not a purchase order; ৳200,000 of untracked arrears is.

2. **The pricing is three different numbers and the worst one is in the script.** ৳3,300 (`PRICING-AND-SALES.md` §11), ৳5,999 (`COMPETITORS.md` §8.2), ৳7,999 (`OUTREACH-TEMPLATES.md`) for the same 450-student school — and the teacher cap, not the student cap, is what forces me to the top tier for five extra logins. At my real Bangla-medium tuition that is ~1% of collections, four times the band your research says schools tolerate.

3. **The calendar is wrong at both ends.** September–December is exam, result and admission season — the worst possible pilot window, not the "prime" one — and nobody planned for the **36–40 day Ramadan/Eid closure** that zeroes attendance, health scores and your north-star metric across every customer at once while I am still being billed.

4. **The board does not exist in this product.** SSC/JSC registration, form fill-up, admit cards, EIIN tabulation, BANBEIS returns and stipend attendance certification are the software jobs that actually hurt a Bangla-medium school, and they appear in none of the six research documents, the PRD or the roadmap.

5. **You are asking me to sign a compliance claim citing a repealed law, from a vendor with no references.** The pilot proposal and the objection scripts still name the 2025 Ordinance, which was replaced by the Personal Data Protection Act 2026; and the switching cost you must beat — 450 re-entered students, 25 re-trained teachers, 700 re-trained guardians, three years of history — is nowhere measured. Fix the paper, then bring me two principals' phone numbers.
