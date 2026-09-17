# Pricing, Sales and Payments — Bangladesh school software

Research note for **Acadigma Campus** · compiled 2026-09-17 · companion to `../PRD.md`

**Scope.** How school software is actually priced, sold and paid for in Bangladesh and comparable South Asian markets; what it costs Acadigma to serve a school; and what pricing model and sales motion a solo founder should run.

**Currency.** BDT (৳). USD converted at **৳120 = $1** throughout (mid-2026 working rate). Every number marked _(est.)_ is my estimate, not a sourced figure — the reasoning is stated inline so you can re-derive it.

---

## 1. Headline findings

1. **The Bangladeshi market has converged on ৳10–20 per student per month, with SMS bundled.** Two independent vendors (Sheba Shikkha, Bidyaan) publish the identical ৳10 / ৳15 / ৳20 ladder. This is the price anchor every principal will compare Acadigma against.
2. **The second live model is hybrid: a monthly base by student band, plus a one-time setup charge.** Edufy publishes a full grid (৳2,000–৳40,000/month by band, ৳2,000–৳5,000 one-time, +5% VAT). This is the model that most closely matches Acadigma's plan structure and is the one I recommend.
3. **Acadigma's placeholder prices are right for a mid-size school and wrong at both ends.** ৳2,999 Starter ≈ a 300-student school at market rate; but it is ~2.5× market for a 120-student kindergarten and ~60% below market for a 1,200-student school. A flat per-school price leaves money on the table at the top and loses the whole bottom of the market.
4. **AI is the biggest silent margin risk.** Unmetered, generous AI could eat 30% of a ৳2,999 plan. Metered with a cheap default model, prompt caching and hard credit caps, it lands at ~9–12% of ARPA. The PRD's credit ledger is not a nice-to-have; it is what makes the unit economics work.
5. **The marketplace is a retention feature, not a revenue line, until roughly 5,000 schools.** At 1,000 schools the 30% commission plausibly yields ~৳22,500/month against ~৳3.8M/month of subscription revenue _(est.)_.

---

## 2. Bangladesh competitor pricing

| Vendor                                                        | Model                                                   | Published price                                                                                                                  | Setup / one-time                     | SMS                                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                           | Source (accessed 2026-09-17)                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sheba Shikkha** (Sheba Digital Ltd)                         | Per student / month                                     | Basic **৳10**, Standard **৳15**, Premium **৳20** per student per month                                                           | not published                        | "SMS Service" bundled in all three tiers                                        | Claims 200+ schools, 500,000+ active students, 40+ districts. **Flag: this implies ~2,500 students/school on average, which is implausible for the BD private-school segment (§5 puts a typical target school at ~400) — treat the 200+/500,000+ claim as unverified marketing, not a sized market signal (amended per SYNTHESIS).** All three tiers list _identical_ features — the ladder is service level, not functionality | [shebashikkha.com](https://shebashikkha.com/)                                                                                                                                                    |
| **Bidyaan** (DevsZone)                                        | Per student / month                                     | সূচনা **৳10**, বিবর্তন **৳15**, উত্তরণ **৳20** per student per month                                                             | not published                        | **Unlimited** attendance / late / notice / payment SMS in every tier            | Differentiator is hardware: free biometric device at ৳15, free face-recognition device at ৳20. Also bundles domain + free hosting + dynamic website                                                                                                                                                                                                                                                                             | [bidyaan.com/pricing](https://www.bidyaan.com/pricing)                                                                                                                                           |
| **Edufy** (Softifybd)                                         | **Hybrid**: plan tier × student band, monthly or yearly | Basic ৳2,000 (0–300 students) → ৳16,000 (5,001–8,000); Standard ৳2,500 → ৳20,000; Premium ৳4,000 (0–300) → ৳40,000 (5,001–8,000) | **৳2,000 / ৳3,000 / ৳5,000** by tier | SMS + email module included; payment gateway and iOS app are chargeable add-ons | "+5% VAT applicable on all fees"; Enterprise tier includes a **white-label licence** and own-server deployment                                                                                                                                                                                                                                                                                                                  | [edufy.com.bd/pricing](https://edufy.com.bd/pricing)                                                                                                                                             |
| **School360** (Spate Initiative Ltd)                          | Not published (quote / "Request an ID")                 | on request                                                                                                                       | on request                           | Masking + non-masking SMS and voice SMS are named modules                       | 996+ schools, 470,800+ students registered; BASIS National ICT Award champion 2020. Runs an explicit **area-entrepreneur white-label reseller** programme                                                                                                                                                                                                                                                                       | [school360.com.bd](https://school360.com.bd/)                                                                                                                                                    |
| **Generic BD "school management software"** (BDStall listing) | Perpetual licence                                       | **৳30,000** one-time                                                                                                             | included                             | included                                                                        | Listing is ~7 years old and marked sold out — useful only as evidence that the perpetual-licence model still frames expectations                                                                                                                                                                                                                                                                                                | [bdstall.com](https://www.bdstall.com/details/school-college-institute-management-software-system-20495/)                                                                                        |
| Market commentary (aggregators)                               | —                                                       | "৳10,000–৳50,000 annually" typical; some vendors quote from ৳50,000–৳75,000 one-time, server extra                               | —                                    | —                                                                               | Treat as directional; these are SEO blog posts, not price lists                                                                                                                                                                                                                                                                                                                                                                 | [bidyaan blog](https://www.bidyaan.com/blog-details/best-school-management-software-in-bangladesh-2026), [pipilikasoft](https://pipilikasoft.com/best-school-management-software-in-bangladesh/) |

### What the ৳10–20/student anchor means in absolute terms

| School size    | At ৳10/student/mo | At ৳15  | At ৳20  | Acadigma placeholder              |
| -------------- | ----------------- | ------- | ------- | --------------------------------- |
| 100 (small KG) | ৳1,000            | ৳1,500  | ৳2,000  | Starter ৳2,999 — **above market** |
| 300            | ৳3,000            | ৳4,500  | ৳6,000  | Starter ৳2,999 — at market        |
| 500            | ৳5,000            | ৳7,500  | ৳10,000 | Pro ৳7,999 — at market            |
| 800            | ৳8,000            | ৳12,000 | ৳16,000 | Pro ৳7,999 — **below market**     |
| 1,500          | ৳15,000           | ৳22,500 | ৳30,000 | Pro ৳7,999 — **far below market** |

**Prices "on request".** School360 and most custom-dev shops (Pipilika, Zaman IT, Smart Software, Roopokar) publish no prices. Estimated from their positioning and the BDStall/aggregator ranges: **৳30,000–৳80,000 one-time build + ৳500–2,000/month hosting & support**, negotiated per school _(est.)_. These are project shops, not SaaS; they compete on relationship and customisation, not price transparency, and they do not renew reliably.

---

## 3. Regional comparables (India, and how South Asia discounts)

| Product                          | Market                  | Model                                                | Price                                                                                                                                       | Setup                                | Source                                                                                                                                                            |
| -------------------------------- | ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fedena**                       | India / global          | Per school, annual only                              | Standard **$999**, Premium **$1,399**, Ultimate **$1,699** per year (unlimited users); Enterprise custom (adds source code)                 | Onboarding data & config included    | [fedena.com/pricing-and-plans](https://fedena.com/pricing-and-plans)                                                                                              |
| **EduGradUP / School ERP India** | India                   | **Per school, banded by student capacity**, annual   | Nano ≤150 ₹9,000; Starter 150–350 ₹14,000; Standard 350–700 ₹17,000; Pro 700–1,500 ₹23,000; Enterprise custom. All tiers get all 43 modules | **Free** onboarding + data migration | [schoolsoftwareindia.com/pricing](https://schoolsoftwareindia.com/pricing)                                                                                        |
| **Entab**                        | India (premium segment) | Per school, annual, opaque                           | **₹40,000–80,000/year** typical; setup & training extra; long implementations                                                               | Extra                                | [entab.in](https://www.entab.in/school-management-software-price.html), secondary commentary via [decentro](https://decentro.tech/blog/best-school-erp-software/) |
| **MyClassboard**                 | India                   | **Per student** subscription, core + metered add-ons | Not published                                                                                                                               | **No setup fee**, free trial         | [myclassboard.com](https://www.myclassboard.com/channel-partner/), secondary commentary                                                                           |
| **Classter**                     | Global / EU             | Per student per year, modular                        | from **~€3/student/month** (~₹270, ~৳390)                                                                                                   | —                                    | [classter.com/pricing](https://www.classter.com/pricing/), [saasworthy](https://www.saasworthy.com/product/classter/pricing)                                      |
| **Skolera**                      | MENA / emerging         | Per student, **annual licence paid in instalments**  | Not published                                                                                                                               | —                                    | [elearningindustry](https://elearningindustry.com/directory/elearning-software/skolera/pricing)                                                                   |
| India market floor (community)   | India                   | Per student / month                                  | **₹120–250/student/month** quoted for full ERP                                                                                              | —                                    | [Quora](https://www.quora.com/What-is-the-cost-of-a-school-ERP-in-India) — anecdotal, treat as an upper band for premium urban schools                            |

**Teachmint removed from this table** — it exited the school-ERP business in April 2026 and is no longer a live comparable (amended per SYNTHESIS).

**How South Asia discounts.** The pattern is not a percentage discount off a global list price — it is a _different shape_:

- **Unlimited users, banded by students** (EduGradUP, Fedena) instead of per-seat. Per-seat pricing is culturally unsellable here; a school with 40 teachers will not pay per teacher.
- **All features in every tier** (EduGradUP, Sheba Shikkha, Bidyaan). Tiering by feature is a Western SaaS habit; the South Asian ladder tiers by _size, service level, or hardware_.
- **Annual-only billing with a multi-year discount** (EduGradUP: 12% off 2 years). Vendors want cash up front because collection is the hard part.
- **Free onboarding and data migration** as the standard concession (EduGradUP, Fedena, MyClassboard) — but BD vendors reverse this and charge a one-time setup fee (Edufy ৳2,000–5,000). BD schools accept a setup fee; Indian ones increasingly don't.
- **BD sits at roughly one-third of the Indian per-student rate**: ৳10–20/student/month vs ₹120–250 (≈৳170–350). Bangladesh is a genuinely cheaper market, not just a discounted one.

---

## 4. Payments: what it actually costs to collect money

### SSLCommerz

| Item                     | Rate                                                                                            | Source                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Setup fee                | **৳25,500 one-time, non-refundable** (includes basic API integration + merchant dashboard)      | [sslcommerz.com/pricing](https://sslcommerz.com/pricing/)                                                                                 |
| Standard transaction fee | **2.5%** per successful transaction — covers local cards, Visa/Mastercard, bKash, Nagad, Rocket | [sslcommerz.com/pricing](https://sslcommerz.com/pricing/)                                                                                 |
| AMEX                     | **3.5%**                                                                                        | same                                                                                                                                      |
| Settlement               | **T+1 to T+2**; a paid "quick settlement" option exists                                         | [sslcommerz FAQ](https://sslcommerz.com/faq/); corroborated by [bengalcloud](https://bengalcloud.com/best-payment-gateway-in-bangladesh/) |
| Requirements             | Bangladesh-incorporated entity; settles in BDT to a local bank account                          | [rafirit](https://rafirit.com/blog-resources/best-payment-gateways-for-bangladesh-ecommerce-2026-top-5-compared/)                         |

### Underlying MFS rates (relevant if you ever go direct or negotiate)

| Channel                | Merchant rate                                                                                       | Source                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bKash merchant payment | **1.85%** standard; ~1.80% via aggregators, promotional 1.75% seen                                  | [bkash.com](https://www.bkash.com/en/products-services/payment), [moneybag](https://moneybag.com.bd/gateway-fees-breakdown-bkash-vs-cards/)                                                          |
| Nagad                  | **~1.65% + ৳1.50** quoted for gateway checkout; app cash-out ৳11.48–12.50 per thousand (1.15–1.25%) | [moneybag](https://moneybag.com.bd/10-best-payment-gateways-in-bangladesh/), [The Daily Star](https://www.thedailystar.net/business/economy/news/nagad-hikes-cash-out-charges-adds-new-fees-3416651) |

**Implications for Acadigma.**

- The **৳25,500 SSLCommerz setup is a real pre-revenue cost** and must be in the R3 budget. Sandbox is free; live is not.
- At 2.5%, a ৳3,800/month subscription costs **৳95** to collect — 2.5% of ARPA, permanently.
- **Annual prepay saves 11 of 12 collection events** and, more importantly, removes 11 chances for the school to fail to pay. In BD the failure mode is not churn-by-cancellation, it is a school that simply stops paying and keeps using the software. Bill annually.
- **T+1/T+2 settlement** means the payout queue's 7-day hold in the PRD is comfortably safe — money is in the bank long before a seller payout is released.
- **Marketplace math**: on a ৳200 item, gateway takes ৳5, Acadigma's 30% commission is ৳60, net ৳55 before payout cost. Payouts to sellers via bKash disbursement cost ~1.0–1.5% _(est.)_, or ~৳10–50 flat by bank EFT. Budget **1.5% of payout volume** as a COGS line.

### SMS

Masking (branded sender ID) SMS in Bangladesh runs **৳0.25–0.45 each**, volume-dependent — ৳0.25 (Zaman IT), ৳0.30 (BD Bulk SMS), ৳0.45 (UCL SMS). Sources: [uclsms.com](https://uclsms.com/), [bdbulksms.com](https://bdbulksms.com/), [zaman-it.com/sms](https://zaman-it.com/sms/), [sms.net.bd](https://sms.net.bd/Masking_SMS/).

A 400-student school sending daily absence SMS + notices realistically sends **1,500–3,000 SMS/month** _(est.)_, i.e. **৳400–1,300/month** of raw SMS cost. Bidyaan and Sheba Shikkha _bundle this as unlimited_ — which is why their per-student price looks high. **Bundling unlimited SMS at a ৳10/student price is only viable if you have a wholesale SMS rate near ৳0.20 and most schools under-use it.** Acadigma should meter SMS or bundle a capped allowance, not promise unlimited.

---

## 5. Bangladeshi private-school economics

| Metric                                     | Figure                                                                                                                                                              | Source / basis                                                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private (non-government) secondary schools | **19,757 of 21,086 (93.7%)**                                                                                                                                        | BANBEIS, via [Bonik Barta](https://en.bonikbarta.com/bangladesh/JhDMeK0yiyDtEmOZ)                                                                                                                                       |
| Kindergartens (primary level)              | **26,299 (22.2% of primary institutions)**, 2024                                                                                                                    | [APSS 2024, DPE](<https://www.dpe.gov.bd/sites/default/files/files/dpe.portal.gov.bd/publications/a4ec0dbe_7524_4fd8_95cd_9e0970b8fa81/Annual%20Primary%20School%20Statistics%20(APSS)%202024_Main%20Report_Final.pdf>) |
| Registered English-medium schools          | **140 schools, 68,825 students, 6,453 teachers**                                                                                                                    | BANBEIS, via [New Age](https://www.newagebd.net/article/148193/leniency-to-english-medium-school-quality)                                                                                                               |
| English-medium monthly tuition, Dhaka      | **৳6,000 to ৳80,000+**; mid-range ৳7,000–25,000; premium ৳30,000–80,000                                                                                             | [CMIS fee guide 2026](https://cmis.com.bd/english-medium-school-fees-in-dhaka-2026-guide/), [The Daily Star](https://www.thedailystar.net/weekend-read/news/when-money-matters-most-3083141)                            |
| Admission fee                              | ৳20,000 to ৳500,000+                                                                                                                                                | CMIS, as above                                                                                                                                                                                                          |
| Consumer edtech price signal               | 10 Minute School / Shikho charge **75–80% less than coaching centres**; ~৳20,000–25,000/year covers a full SSC/HSC online student; **~5% of users convert to paid** | [TBS News](https://www.tbsnews.net/tech/bangladesh-set-edtech-revolution-360985), [TechCrunch](https://techcrunch.com/2023/10/11/10-minute-school/)                                                                     |

### Derived economics for a target school _(est. — derived, not surveyed)_

Take a 400-student English-medium or good Bangla-medium private school at ৳4,000/month average tuition:

| Line                                  | Estimate                                      | Reasoning                                                                   |
| ------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| Monthly tuition revenue               | **৳1,600,000**                                | 400 × ৳4,000                                                                |
| Teaching + admin staff                | **20–30** (≈15–22 teachers, 4–8 office/admin) | ~1:18 student-teacher ratio typical for private secondary                   |
| Current software spend                | **৳0–5,000/month**                            | Most run Excel + a WhatsApp group; adopters pay ৳3,000–6,000 at ৳10/student |
| Current SMS spend                     | **৳500–1,500/month**                          | 1,500–3,000 SMS at ৳0.25–0.45                                               |
| Total addressable software+SMS budget | **৳4,000–8,000/month**                        | 0.25–0.5% of tuition revenue                                                |

**The rule of thumb that matters: a BD private school will spend roughly 0.2–0.5% of tuition revenue on administrative software.** At ৳3,800/month ARPA against ৳1.6M of tuition, Acadigma is asking for **0.24%** — comfortably inside the band, and defensible in a sales conversation ("less than one student's monthly fee").

**Market sizing.** ~46,000 private institutions (19,757 secondary + 26,299 KG + 140 English-medium). Serviceable today — urban, has a Windows PC in the office, teachers on Android, can pay ৳1,500+/month: **8,000–12,000 institutions** _(est.)_. A realistic 3-year SOM for a solo founder with one reseller channel: **150–400 schools** = ৳7–18M/year.

**Risk flag (not researched to conclusion):** the government periodically pushes free or subsidised EMIS tooling at MPO-listed institutions. I found no evidence of a current free-software programme that would displace a paid product, but this is a gap. **Non-MPO English-medium schools and private kindergartens are the segments least exposed to a government freebie** — and, not coincidentally, the ones with cash and a phone-first staff. Start there.

---

## 6. How competitors actually sell

**Observed, from vendor sites:**

| Motion                                                                    | Evidence                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Request a demo" / "Request an ID" form + phone number above the fold** | Sheba Shikkha ("Setting up Institution? Please request a demo"), Edufy ("Request a demo"), School360 ("আইডি রিকোয়েস্ট করুন" — request an ID). Phone numbers are displayed prominently on all three; the sale is closed on a call, not in a checkout.                                                                                          |
| **Area-based white-label reseller / entrepreneur programme**              | School360 openly recruits: _"নিজস্ব এলাকায় উদ্যোক্তা হয়ে আয় করুন"_ — become an entrepreneur in your own area, with a white-label option for small IT firms. Edufy's Enterprise tier includes "1 Copy White Label License". This is the dominant BD distribution model.                                                                      |
| **Hardware as the differentiator**                                        | Bidyaan gives a free biometric device at ৳15/student and a free face-recognition device at ৳20/student. School360 leads with biometric/RFID attendance. Hardware is how BD vendors escape price comparison.                                                                                                                                    |
| **Principal testimonials with named institutions**                        | Sheba Shikkha, School360 both lead with signed principal endorsements. In BD, a named principal at a peer school is the single highest-converting asset.                                                                                                                                                                                       |
| **Awards as trust proxy**                                                 | School360 leads with BASIS National ICT Award 2020 + Daffodil ICT Carnival 2019.                                                                                                                                                                                                                                                               |
| **Channel commission rates (India benchmarks)**                           | Marg: **up to 25% referral**; ERPCA: **up to 30% recurring**; MyClassboard and SchoolLog run formal channel-partner programmes without published rates. Sources: [margcompusoft](https://margcompusoft.com/partnership.aspx), [partners.erpca.com](https://partners.erpca.com/), [myclassboard](https://www.myclassboard.com/channel-partner/) |
| **Contract terms**                                                        | India: annual-only is the norm (Fedena, EduGradUP), with 12% off a 2-year prepay. BD: monthly available (Edufy) but paired with a non-refundable one-time setup charge.                                                                                                                                                                        |
| **Trials / pilots**                                                       | MyClassboard: free trial, no setup fee. Teachmint: free-forever tier. Edufy: "no upfront fees" but a one-time charge on order. BD norm appears to be a **demo ID** (a sandbox login) rather than a time-boxed production trial. Acadigma's 14-day Pro trial is _more_ generous than the BD norm.                                               |

**Churn drivers** (inferred from vendor messaging and product-review commentary — _(est.)_, not from a churn dataset): implementations that stall because student data was never migrated; office staff never trained and quietly reverting to Excel; SMS credit billing disputes; poor/slow local support (the explicit promise of "24/7 online & physical support" on Sheba Shikkha and "আন্তরিক সাপোর্ট" on School360 tells you this is the market's chief anxiety); and a change of principal or proprietor resetting the buying decision.

---

## 7. Marketplace economics

| Platform                                   | Take rate                                                        | Fees            | Source                                                           |
| ------------------------------------------ | ---------------------------------------------------------------- | --------------- | ---------------------------------------------------------------- |
| **Teachers Pay Teachers** — Basic seller   | **45% take** (seller keeps 55%) + $0.30 per resource             | free account    | [TpT fee schedule](https://www.teacherspayteachers.com.co/fees/) |
| **Teachers Pay Teachers** — Premium seller | **20% take** (seller keeps 80%) + $0.15 per transaction under $3 | **$59.95/year** | same                                                             |
| **Twinkl**                                 | Contributor royalty rates not published                          | —               | No public figure found; [Twinkl](https://www.twinkl.com/)        |
| **Acadigma (planned)**                     | **30% take**                                                     | none            | `../PRD.md` §5.4                                                 |

**Seller earnings are brutally top-heavy.** On TpT: only **0.2% of sellers (431 of 233,358) earned six figures in 2024**; the top ~1% earn more than the bottom 99% combined; most sellers make **$0–100/month**. Sources: [SEOLumina](https://seolumina.com/blog/how-much-do-tpt-sellers-make-in-2026-real-data-income-breakdown), [SEOTpreneur](https://seotpreneur.com/can-tpt-really-replace-your-teaching-income-in-2025/).

**What a BD seller could realistically earn** _(est. — modelled, not observed):_

| Acadigma scale | Teacher buyers | Items sold/yr | Avg price | GMV/yr     | Acadigma take (30%)          | Top-1% seller earnings |
| -------------- | -------------- | ------------- | --------- | ---------- | ---------------------------- | ---------------------- |
| 100 schools    | ~1,500         | ~150          | ৳150      | ৳22,500    | **৳6,750/yr**                | ~৳1,500/mo             |
| 1,000 schools  | ~15,000        | ~4,500        | ৳200      | ৳900,000   | **৳270,000/yr (৳22,500/mo)** | ~৳8,000–15,000/mo      |
| 5,000 schools  | ~75,000        | ~30,000       | ৳250      | ৳7,500,000 | **৳2.25M/yr**                | ~৳30,000+/mo           |

**Correction (amended per SYNTHESIS):** the "Acadigma take (30%)" column above is **gross commission, before costs** — it was presented as if it were the platform's actual margin on the marketplace, which it is not. At 1,000 schools, the ৳22,500/month gross commission has to absorb: SSLCommerz gateway fees (2.5% of GMV), seller payout processing (bKash disbursement ~1–1.5% or flat EFT fees), KYC review labour (2-business-day SLA reviewer time per seller), listing-moderation labour, and malware/content scanning on every upload. Netting these out gives a **net figure of ~৳8,400/month at 1,000 schools** — not ৳22,500. Sellers are also subject to **AIT (Advance Income Tax) withholding** on marketplace payouts under Bangladeshi tax law; Acadigma has a withholding obligation on seller earnings that is separate from, and in addition to, the commission and payout-processing costs above, and must be reflected in the payout statement math (F-CM-05).

Assumptions: 10% of teachers buy, 3 items/year each, at 1,000 schools. Compare to subscription revenue at 1,000 schools (~৳3.8M/**month**): **the marketplace is well under 1% of revenue even before the cost correction above, and less after it.**

**Therefore:** treat the marketplace as a _network and retention asset_ — it makes Acadigma the place teachers keep their professional identity, feeds the hiring module, and is a moat no local ERP shop can copy. Do not model it as revenue before 5,000 schools, do not promise sellers an income, and keep the ৳1,000 minimum payout (most sellers will take months to reach it — that is normal and matches TpT).

---

## 8. Willingness to pay for AI features

Evidence is thin and mostly consumer-side, so read this as directional:

- **Consumers in BD won't pay much for AI.** 10 Minute School and Shikho price academic content **75–80% below** coaching-centre rates and convert **~5%** of users to paid ([TBS](https://www.tbsnews.net/tech/bangladesh-set-edtech-revolution-360985), [TechCrunch](https://techcrunch.com/2023/10/11/10-minute-school/)). Shikho's AI doubt-solver launched as a **free beta feature inside an existing subscription**, not a paid SKU ([The Daily Star](https://www.thedailystar.net/tech-startup/news/shikho-aims-bring-the-ai-hype-ed-tech-heres-how-3822316)).
- **Institutions will pay — but for time saved, not for "AI".** Sheba Shikkha already markets itself as "AI-Powered" with **no AI-specific price premium**: the AI claim is a positioning device on the same ৳10/15/20 ladder. Nobody in BD has yet successfully sold AI as a line item to a school.

**Conclusion for Acadigma:** do **not** create an "AI add-on" SKU. Bundle AI credits into plan tiers as the _reason the higher tier exists_ (this is what the PRD already does), sell the outcome in Bengali ("লেসন প্ল্যান ৩০ সেকেন্ডে" — a lesson plan in 30 seconds, report-card comments written for you), and sell top-up credit packs only to schools that have already exhausted their pool. The top-up pack is a happy signal, not a growth lever.

---

## 9. Unit-economics model for Acadigma

### 9.1 Stated assumptions

| Assumption                              | Value                                                                                                       | Why                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| FX                                      | ৳120 = $1                                                                                                   | working rate                                                                             |
| Average school                          | **400 students, 22 teachers, 6 admin staff, ~400 parent accounts**                                          | mid-size BD private/English-medium school (§5)                                           |
| Monthly active users per school         | **~430** (staff + parents; students have no account in v1)                                                  | PRD §7                                                                                   |
| DB rows/storage per school              | ~0.3 GB DB, ~3 GB files (PDFs, photos, resources)                                                           | attendance + marks are small; PDFs and photos dominate                                   |
| Egress per school                       | ~8 GB/month                                                                                                 | phone-first app shell + PDF downloads + photos                                           |
| Blended ARPA (recommended pricing, §10) | **~৳2,900/month, ramping to ~৳4,300/month as mix moves to Pro** (amended per SYNTHESIS — was a flat ৳3,800) | mix of Starter/Pro at typical band sizes                                                 |
| AI usage                                | 15 active teachers × 20 AI actions/month = **300 actions/school/month**                                     | metered by credit ledger (PRD §5.3)                                                      |
| AI model mix                            | Haiku 4.5 ($1/$5 per MTok) for routine tools, Sonnet 5 ($2/$10) for lesson plans and syllabus extraction    | [Anthropic model pricing, 2026](https://docs.anthropic.com/en/docs/about-claude/pricing) |
| Supabase                                | Pro $25/mo: 8 GB DB, 100 GB file storage, 250 GB egress, 100k MAU included; overages metered                | [supabase.com/pricing](https://supabase.com/pricing)                                     |
| Vercel                                  | Pro $20/mo, includes $20 usage credit, $20/additional seat                                                  | [vercel.com/pricing](https://vercel.com/pricing)                                         |
| SSLCommerz                              | 2.5% of every collection + ৳25,500 one-time                                                                 | [sslcommerz.com/pricing](https://sslcommerz.com/pricing/)                                |
| SMS                                     | passed through at cost + small margin; treated as ৳0 gross profit                                           | conservative                                                                             |

### 9.2 AI cost per action

| Action                                             | Tokens (in/out) | Model                | Raw cost | With caching + batch | In ৳                 |
| -------------------------------------------------- | --------------- | -------------------- | -------- | -------------------- | -------------------- |
| Lesson plan                                        | 3k / 2k         | Sonnet 5             | $0.026   | $0.014               | **৳1.7**             |
| Worksheet / quiz / rubric                          | 2k / 2k         | Haiku 4.5            | $0.012   | $0.007               | **৳0.85**            |
| Parent message / notice                            | 1k / 0.4k       | Haiku 4.5            | $0.003   | $0.002               | **৳0.25**            |
| Report-card comment (bulk, 40 students)            | 6k / 4k         | Haiku 4.5, Batch API | $0.026   | $0.013               | **৳1.6** per section |
| Syllabus PDF extraction (one-off per subject/year) | 30k / 8k        | Sonnet 5             | $0.14    | $0.08                | **৳9.6**             |

_Levers applied: prompt caching on the stable system + curriculum prefix (cache reads are a fraction of input-token price), Batch API at 50% for anything non-interactive (bulk report-card comments, overnight digests), Haiku 4.5 as the default with Sonnet 5 reserved for planning and extraction._

**Correction (amended per SYNTHESIS):** the "With caching + batch" column above stacks best-case prompt-caching discounts and best-case Batch API discounts on every action simultaneously — not achievable in practice, since interactive actions (lesson plan, worksheet, parent message) cannot use the Batch API at all, and caching only pays off once the same prefix has already been paid for once. The **budgeted AI COGS figure is ৳1.45/action** (MARKET-STRATEGY.md §c), not the ৳1.20 blended figure below derived from that column. **Blended AI cost ≈ ৳1.45 per action × 300 actions = ৳435 per school per month.** Without caching, batching and model routing, the same volume on Sonnet 5 at 3k/2k would be ~৳900/school/month, and an unmetered Free tier could exceed the plan price outright. _Model routing and caching remain the single most important cost control in the product — the disagreement is only with the stacked best-case number, not the direction._

### 9.3 Infrastructure at 10 / 100 / 1,000 schools

| Line                          | 10 schools       | 100 schools    | 1,000 schools           |
| ----------------------------- | ---------------- | -------------- | ----------------------- |
| MAU                           | 4,300            | 43,000         | 430,000                 |
| DB size                       | 3 GB             | 30 GB          | 300 GB                  |
| File storage                  | 30 GB            | 300 GB         | 3 TB                    |
| Egress                        | 80 GB            | 800 GB         | 8 TB                    |
| Supabase base                 | $25              | $25            | $25                     |
| Supabase compute              | included (Micro) | ~$100 (Medium) | ~$600 (Large + replica) |
| Supabase DB storage overage   | $0               | $3             | $37                     |
| Supabase file storage overage | $0               | $4             | $61                     |
| Supabase egress overage       | $0               | $50            | **$697**                |
| Supabase MAU overage          | $0               | $0             | **$1,072**              |
| Vercel                        | $20              | ~$80           | ~$600                   |
| Sentry / monitoring / domains | ~$5              | ~$30           | ~$150                   |
| **Total / month**             | **~$50**         | **~$292**      | **~$3,242**             |
| **In ৳**                      | **৳6,000**       | **৳35,000**    | **৳389,000**            |
| **Per school / month**        | **৳600**         | **৳350**       | **৳389**                |

_All figures (est.) derived from published Supabase/Vercel rate cards applied to the per-school assumptions above._

**Two costs dominate at 1,000 schools and both are fixable:**

- **Egress $697/mo** — move PDFs, photos and resource files behind a CDN with cheap or free egress (Cloudflare R2 has zero egress fees) instead of serving them from Supabase Storage. Saves ~$600/month at scale.
- **MAU $1,072/mo** — 430k MAU is driven almost entirely by _parents_. If parents access the portal via a signed magic link / limited-session mechanism rather than a full monthly-active auth session, or if the parent app is a read-only view authenticated less frequently, this drops sharply. Worth an architecture decision before R1 launch.

With both mitigations: **~$1,500/month at 1,000 schools = ৳180/school/month.**

### 9.4 Gross margin

**Correction (amended per SYNTHESIS):** the table below was built on the superseded ৳3,800 flat ARPA and the superseded ৳1.20/action AI cost (§9.2) and is kept only for the shape of the reasoning. The canonical figure is **gross margin 67.8% at Pro/300 students** (MARKET-STRATEGY.md §c, at AI COGS ৳1.45/action) — use that number, not the 72–77% below, in any external-facing material.

Per school per month, at the old blended ARPA **৳3,800** _(stale inputs — see correction above)_:

|                    | 10 schools   | 100 schools | 1,000 schools | 1,000 (mitigated) |
| ------------------ | ------------ | ----------- | ------------- | ----------------- |
| Revenue            | ৳3,800       | ৳3,800      | ৳3,800        | ৳3,800            |
| Infra              | (৳600)       | (৳350)      | (৳389)        | (৳180)            |
| AI                 | (৳360)       | (৳360)      | (৳360)        | (৳360)            |
| SSLCommerz 2.5%    | (৳95)        | (৳95)       | (৳95)         | (৳95)             |
| SMS (pass-through) | ৳0           | ৳0          | ৳0            | ৳0                |
| Support staff      | ৳0 (founder) | (৳120)      | (৳233)        | (৳233)            |
| **Gross profit**   | **৳2,745**   | **৳2,875**  | **৳2,723**    | **৳2,932**        |
| **Gross margin**   | **72%**      | **76%**     | **72%**       | **77%**           |

_Support assumption: 1 support person at ৳35,000/month per 150 schools; founder-only below ~40 schools._

**Read:** this table's 72–77% is superseded — the canonical gross margin is **67.8% at Pro/300** (see correction above). The gap to the 85% SaaS benchmark is AI plus BD's high-touch support requirement. Both are the price of winning this market — do not try to engineer them away by shipping worse support.

### 9.5 CAC by channel _(all est.)_

| Channel                                                     | Cash CAC                                                                 | Fully loaded CAC                                             | Close rate          | Notes                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Founder-led school visits**                               | ~৳2,000 (transport, printing, demo device data)                          | **~৳10,500** (3 founder-days at ৳3,000/day opportunity cost) | ~1 in 12 visits     | Slow but the only way to learn the product-market fit. Non-negotiable for schools 1–20.                                                                                                                              |
| **Referral from an existing principal**                     | **~৳3,000** (one month's credit as thank-you)                            | ~৳5,000                                                      | ~1 in 3 warm intros | Highest close rate of any channel. Engineer for it: ask at day 60, not day 7.                                                                                                                                        |
| **School association / BEMSTA-style network talk**          | ~৳5,000 per event                                                        | ~৳15,000 per event → 5–15 leads = **৳1,000–3,000/school**    | ~1 in 8 leads       | Slow to arrange, compounding.                                                                                                                                                                                        |
| **Facebook / Meta ads to school owners**                    | Lead (form fill) ৳80–250; at 15% demo-to-close → **৳1,000–2,500/school** | +founder demo time ~৳1,500                                   | ~15% demo→close     | _No BD school-software benchmark found_ — extrapolated from BD SME lead-gen CPL ranges. Test with ৳10,000 before believing it.                                                                                       |
| **Area reseller / white-label agent** (the School360 model) | ৳0 upfront                                                               | **20–25% of recurring revenue forever** = ৳760–950/month     | highest volume      | Not a CAC — a permanent margin haircut that would take gross margin from 72% to ~52%. **Restructure as 100% of months 1–3 (৳11,400 one-time) + 10% recurring.** India benchmarks: 25% (Marg), 30% recurring (ERPCA). |

**Correction (amended per SYNTHESIS):** the ৳10,500 fully-loaded founder CAC above understated the real cost of a sold (not self-serve) school — it excluded the pilot period, the on-site data migration day, and the higher-than-modelled visit-to-close ratio in a cold market. The conservative planning figure is **CAC ৳36,000**, per-channel numbers in the table above should be read as directional, not planning-grade.

**Payback.** At the corrected ARPA (§9.1) and gross margin (§9.4), a **৳36,000 conservative CAC pays back in 10.8 months** — a materially slower, still-viable payback, not the 3.8-month figure previously stated.

**LTV.** School ERP churn is low once fees, SMS and results run through the system (data lock-in + parents trained + staff retrained cost). At a **15–30% annual logo churn** range _(est.)_, **LTV/CAC lands between 1.3× and 6.8×** depending on churn and CAC channel mix — a real range, not the single 21× figure previously stated, and the low end of that range is close enough to the 3× rule-of-thumb threshold that channel mix and churn discipline matter to the business case (amended per SYNTHESIS — the "the model is not the risk" line is deleted, as it is not supported at the low end of this range).

---

## 10. Three pricing models

### Option A — Per-school tiers (as currently planned)

Free / Starter ৳2,999 / Pro ৳7,999 / Enterprise, flat per school per month.

| Pros                                                            | Cons                                                                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Simplest possible message: one number, no calculator            | Loses the entire bottom of the market — ৳2,999 is 2–3× market for a 120-student kindergarten, and KGs are 26,299 institutions |
| Trivial to bill, trivial to forecast, no student-count disputes | Leaves 50–70% of revenue on the table at 800+ students, where incumbents charge ৳8,000–30,000                                 |
| Predictable for the school — no bill shock as enrolment grows   | Revenue doesn't grow with the customer; you get no expansion revenue at all                                                   |
| Easiest to implement (the plans table already exists)           | Invites the objection "why am I paying the same as the school twice my size?"                                                 |

### Option B — Pure per-student

৳9 / ৳13 / ৳18 per student per month, matching the market anchor but undercutting it ~10%.

| Pros                                                                        | Cons                                                                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Speaks the market's native language — every principal can compare instantly | Punishes the very small school: a 60-student KG pays ৳540/month, which is below your cost to support it                                  |
| Revenue scales automatically with the customer; free expansion revenue      | Creates an incentive to under-report enrolment; you must reconcile student counts monthly, which is a support burden and a trust problem |
| Directly undercuts Sheba Shikkha and Bidyaan on a like-for-like comparison  | Revenue swings with admission season and dropouts — harder to forecast                                                                   |
| No "why the same as a bigger school" objection                              | Competes purely on price, on the axis where incumbents bundle _free biometric hardware_ — a fight you cannot win                         |

### Option C — Hybrid: base by band + per-student above the band ✅ **recommended**

A monthly base covering an included student band, plus a modest per-student rate above it.

| Pros                                                                                           | Cons                                                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Proven in this exact market — it is Edufy's published model, and EduGradUP's in India          | More complex to explain than one number (mitigated: publish a grid, not a formula)                       |
| Floor protects you on tiny schools; slope captures value on large ones                         | Requires the plans table to support banding + overage (small build; the PRD's plans editor can carry it) |
| Compares favourably at _every_ school size against the ৳10–20/student anchor                   | Two variables to negotiate instead of one                                                                |
| Expansion revenue without monthly enrolment reconciliation — only when a school crosses a band |                                                                                                          |
| Setup fee is a BD norm (Edufy charges ৳2,000–5,000) and funds onboarding labour                |                                                                                                          |

---

## 11. Recommendation, with numbers

**Adopt Option C — hybrid base-by-band + per-student overage.**

**Pricing correction (amended per SYNTHESIS):** the plan table, supporting-terms table and "where this lands" table that previously stood here quoted a different price list (Free/৳1,500 Starter/৳3,500 Pro) than the one the product actually shipped with. **`MARKET-STRATEGY.md` §c is now the single price list; do not restate numbers here that could drift from it.** For reference, the current numbers (must match §c exactly):

| Plan           | Base / month     | Included students | Above included         | AI actions/month (pooled) | Storage |
| -------------- | ---------------- | ----------------- | ---------------------- | ------------------------- | ------- |
| **Starter**    | **৳2,200**       | up to **150**     | **+৳9/student/month**  | 200                       | 10GB    |
| **Pro**        | **৳4,900**       | up to **300**     | **+৳11/student/month** | 600 (+ 300 SMS segments)  | 50GB    |
| **Enterprise** | **from ৳18,000** | custom            | custom                 | contractual               | custom  |

Supporting terms, matching §c exactly: **SMS ৳0.75/segment**; **AI top-up ৳1,200 per 500 actions**; **annual prepay = 1 month free** (not the 2 months previously stated); **reseller = 50% of months 1–3 at signing + 50% at month 6 + 10% recurring, with clawback before month 4** (not the "100% of months 1–3 + 10% recurring" previously stated); **marketplace commission 30%, unchanged**. No teacher caps on any plan. Yearly = 11× monthly.

Acadigma is priced at or below the cheapest incumbent (৳10/student/month) at most school sizes, and it is the only product in this market bundling AI credits into the plan — that is what the sales conversation should be about, not price.

**Do not** advertise a per-student rate. Quote the monthly number from the grid and let the principal do the division themselves if they want to.

---

## 12. Sales motion for a solo founder

**The constraint is your hours, not your CAC.** Every decision below optimises founder-hours per closed school.

### Phase 1 — Schools 1–10 (months 0–6): earn the right to sell

- **Sell to people who already know you.** Three to five schools where you or a family member has a relationship. Do not cold-call yet; you need schools that will forgive bugs.
- **Charge from day one, but discount visibly.** "Founding school" price: 50% off for 12 months, in writing, with the list price stated. Free pilots do not get used, and a school that pays ৳750/month will still take your calls. A school on a free pilot will not.
- **Pilot length: one full exam cycle, not 14 days.** The PRD's 14-day trial is right for self-serve signups but wrong for a sold school — the value (report cards, a month of attendance) only appears after a term. Sell an **8–12 week paid pilot** that auto-converts to an annual contract.
- **Do the data migration yourself, on site, in one day.** This is the #1 reason implementations stall in this market. Show up with a laptop, take their Excel files, and leave with students loaded. Charge the ৳5,000 for it so it is valued.
- **Train the office manager, not the principal.** The principal buys; the office manager decides whether it survives. Two sessions, in Bengali, with a printed one-page cheat sheet.

### Phase 2 — Schools 10–50 (months 6–18): manufacture referrals

- **The referral ask at day 60.** Once a school has run one exam cycle to report cards, ask the principal for **two** introductions to peer principals — by name, and ask them to make the call in front of you. Pay ৳3,000 in account credit per closed referral.
- **Build the testimonial asset.** Named principal + named school + a photograph + one specific number ("report cards for 340 students in 40 minutes"). This is the highest-leverage marketing artefact in BD; every competitor leads with it because it works.
- **Get in front of an association.** English-medium school associations, kindergarten owners' associations, upazila-level private-school groups. One 20-minute talk → 5–15 qualified leads. Lead with a live demo on a phone, not slides.
- **Run one ৳10,000 Facebook ads test, then decide.** Target school owners/principals in Dhaka, Chattogram, Sylhet. Optimise for a form fill with a phone number. If cost-per-qualified-demo lands under ৳2,000, scale it; if not, kill it and go back to referrals. Do not run ads before you have three named testimonials.
- **Publish the price.** Every BD competitor that publishes a price (Sheba Shikkha, Bidyaan, Edufy) gets compared on a level field; every one that hides it (School360, the dev shops) forces a phone call the buyer may not make. A published grid is a solo founder's best filter — it disqualifies the wrong schools before they consume your hours.

### Phase 3 — Schools 50+ (months 18+): build the channel

- **Recruit area agents, not employees.** This is the proven BD structure (School360's "become an entrepreneur in your own area"). Target: small local IT/computer-training shops and ex-teachers who already sell something to schools in their district.
- **Structure the deal as 100% of months 1–3 + 10% recurring**, not the 20–30% recurring that Indian vendors pay. At ৳3,800 ARPA that is a ৳11,400 one-time payment — a meaningful sum in a district town — while your gross margin drops only ~8 points instead of ~25.
- **Give agents a white-label demo instance and a Bengali pitch deck**, and require they complete an onboarding certification before they can quote. Uncertified agents mis-sell and you eat the churn.
- **Hire support before you hire sales.** The first employee is a Bengali-speaking support person who does onboarding and training. Support quality is the stated anxiety of this entire market ("২৪/৭ অনলাইন ও ফিজিক্যাল সাপোর্ট", "আন্তরিক সাপোর্ট") and the main churn driver.

### Things not to do

- **Don't bundle hardware.** Bidyaan and School360 compete on free biometric and face-recognition devices. That is a working-capital game a solo founder cannot fund, and it drags you into a price war on a commodity. Instead, **support their existing devices** (the PRD's R4 gate-scan input) and let the school keep the hardware vendor it already has.
- **Don't sell AI as a feature.** Sell "report cards in an afternoon" and "lesson plans in 30 seconds". Nobody in BD has sold AI as a line item to a school (§8).
- **Don't chase MPO/government schools first.** They are 93.7% of secondary institutions by count but carry procurement friction and exposure to a free government alternative. Non-MPO English-medium and private kindergartens pay faster and decide in one meeting.
- **Don't offer a perpetual licence**, however hard a principal pushes. The ৳30,000 one-time expectation exists in this market and it is the death of a SaaS business.

---

## 13. Open gaps

| Gap                                                                          | Why it matters                                      | How to close it                                                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| No published School360 / Classtune / Teachmint / MyClassboard price          | The two largest BD players' real pricing is unknown | Have someone request a quote as a 400-student school                       |
| No BD school-software CAC or churn benchmark                                 | Every CAC and churn figure in §9.5 is modelled      | Track your own from school #1; revisit this doc at 20 schools              |
| Government / NGO free-software exposure                                      | Could invalidate the MPO segment entirely           | Check DSHE/BANBEIS EMIS circulars and talk to two MPO principals           |
| Supabase/Vercel overage rates applied from summaries, not the live rate card | The 1,000-school infra figure could be off ±30%     | Re-derive from supabase.com/pricing directly before any fundraise          |
| bKash/Nagad _disbursement_ (payout) pricing                                  | Affects marketplace payout COGS                     | Ask SSLCommerz for their disbursement rate card during merchant onboarding |

---

## Sources

All accessed **2026-09-17** unless noted.

**Bangladesh vendors**

- Sheba Shikkha pricing — https://shebashikkha.com/
- Bidyaan pricing — https://www.bidyaan.com/pricing
- Bidyaan blog, "Best School Management Software in Bangladesh 2026" — https://www.bidyaan.com/blog-details/best-school-management-software-in-bangladesh-2026
- Edufy pricing — https://edufy.com.bd/pricing
- School360 (Spate Initiative Ltd) — https://school360.com.bd/
- BDStall, school/college management software listing — https://www.bdstall.com/details/school-college-institute-management-software-system-20495/
- Pipilika Soft — https://pipilikasoft.com/best-school-management-software-in-bangladesh/
- Zaman IT — https://zaman-it.com/school-management-system/

**Regional comparables**

- Fedena pricing & plans — https://fedena.com/pricing-and-plans
- EduGradUP / School ERP India pricing — https://schoolsoftwareindia.com/pricing
- Entab pricing factors — https://www.entab.in/school-management-software-price.html
- MyClassboard channel partner — https://www.myclassboard.com/channel-partner/
- Classter pricing — https://www.classter.com/pricing/ · https://www.saasworthy.com/product/classter/pricing
- Skolera pricing — https://elearningindustry.com/directory/elearning-software/skolera/pricing
- Teachmint pricing — https://www.saasworthy.com/product/teachmint/pricing
- Decentro, "19 Best School ERP Software in India" — https://decentro.tech/blog/best-school-erp-software/
- India school ERP cost discussion (₹120–250/student/month, anecdotal) — https://www.quora.com/What-is-the-cost-of-a-school-ERP-in-India

**Channel / reseller benchmarks**

- Marg Compusoft partnership (up to 25% referral) — https://margcompusoft.com/partnership.aspx
- ERPCA partner program (up to 30% recurring) — https://partners.erpca.com/

**Payments**

- SSLCommerz pricing (৳25,500 setup, 2.5%, 3.5% AMEX) — https://sslcommerz.com/pricing/
- SSLCommerz FAQ — https://sslcommerz.com/faq/
- bKash payment / merchant — https://www.bkash.com/en/products-services/payment
- Moneybag, gateway fee breakdown bKash vs cards — https://moneybag.com.bd/gateway-fees-breakdown-bkash-vs-cards/
- Moneybag, 10 best payment gateways in Bangladesh — https://moneybag.com.bd/10-best-payment-gateways-in-bangladesh/
- The Daily Star, Nagad charge increases — https://www.thedailystar.net/business/economy/news/nagad-hikes-cash-out-charges-adds-new-fees-3416651
- Bengal Cloud, best payment gateway in Bangladesh — https://bengalcloud.com/best-payment-gateway-in-bangladesh/
- Rafirit, BD ecommerce gateways 2026 — https://rafirit.com/blog-resources/best-payment-gateways-for-bangladesh-ecommerce-2026-top-5-compared/

**SMS**

- UCL SMS (from ৳0.45) — https://uclsms.com/
- BD Bulk SMS (৳0.30) — https://bdbulksms.com/
- Zaman IT SMS (from ৳0.25) — https://zaman-it.com/sms/
- SMS.NET.BD masking — https://sms.net.bd/Masking_SMS/

**Bangladesh school-sector data**

- Bonik Barta / BANBEIS, "Private schools dominate 93% of secondary education" — https://en.bonikbarta.com/bangladesh/JhDMeK0yiyDtEmOZ
- Annual Primary School Statistics (APSS) 2024, DPE — https://www.dpe.gov.bd/sites/default/files/files/dpe.portal.gov.bd/publications/a4ec0dbe_7524_4fd8_95cd_9e0970b8fa81/Annual%20Primary%20School%20Statistics%20(APSS)%202024_Main%20Report_Final.pdf
- New Age, English-medium school data (BANBEIS: 140 schools, 68,825 students) — https://www.newagebd.net/article/148193/leniency-to-english-medium-school-quality
- CMIS, English medium school fees in Dhaka 2026 — https://cmis.com.bd/english-medium-school-fees-in-dhaka-2026-guide/
- The Daily Star, "When money matters most" (English-medium fees) — https://www.thedailystar.net/weekend-read/news/when-money-matters-most-3083141

**Marketplace**

- Teachers Pay Teachers seller fees (55%/80% payout tiers, $59.95 premium) — https://www.teacherspayteachers.com.co/fees/
- SEOLumina, "How much do TPT sellers make in 2026" — https://seolumina.com/blog/how-much-do-tpt-sellers-make-in-2026-real-data-income-breakdown
- SEOTpreneur, TPT income reality (0.2% six-figure) — https://seotpreneur.com/can-tpt-really-replace-your-teaching-income-in-2025/

**AI willingness to pay**

- TBS News, "Bangladesh set for an EdTech revolution" (75–80% cheaper, ~5% paid conversion) — https://www.tbsnews.net/tech/bangladesh-set-edtech-revolution-360985
- TechCrunch, 10 Minute School — https://techcrunch.com/2023/10/11/10-minute-school/
- The Daily Star, Shikho AI — https://www.thedailystar.net/tech-startup/news/shikho-aims-bring-the-ai-hype-ed-tech-heres-how-3822316

**Infrastructure cost**

- Supabase pricing — https://supabase.com/pricing
- Vercel pricing — https://vercel.com/pricing
- Anthropic model pricing (Haiku 4.5 $1/$5, Sonnet 5 $2/$10, Opus 5 $5/$25 per MTok) — https://docs.anthropic.com/en/docs/about-claude/pricing
