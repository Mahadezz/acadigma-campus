# Acadigma Campus — Data Processing Agreement (DRAFT)

> ⚠️ **FOR LAWYER REVIEW — NOT LEGAL ADVICE.**
> A plain-language working draft prepared by the engineering team. It was written from public commentary on Bangladesh's Personal Data Protection Act, 2026 — **we have not read the gazetted statutory text**. It contains no reviewed liability, indemnity or warranty position. **Do not present it to a school, and do not accept it in the product, until a qualified lawyer has settled it.** Verification status of every legal claim behind it: `../COMPLIANCE-PDPA.md`, especially §1 (what is verified), §2.4 (required clauses), §5.5 (the transfer problem) and §11 (questions for counsel).

Draft version 0.1 · 2026-09-17 · Owner: Mahadi (Acadigma) · Status: **draft**
Accepted by a school in the **school creation wizard** as a blocking step (`COMPLIANCE-PDPA.md` §2.5), recorded in `legal_acceptances` with the document version and a hash of the exact text, and available as a PDF from _Settings → Legal_.

---

## Notes for counsel (delete before use)

1. **Deliberately plain.** Our customers are school proprietors and principals, many reading in Bengali, signing on a phone. A DPA they cannot read is a DPA they will not honour. Please keep it readable when you make it correct.
2. **Deliberately silent** on liability caps, indemnities, warranties, insurance and termination for convenience — those belong with the main subscription terms and are yours to set.
3. **Clause 9 (transfers)** is the one that needs the hardest look. All data sits in Mumbai; `COMPLIANCE-PDPA.md` §5.5 explains why that may not survive the localisation rules and what our fallback plan is.
4. **Clause 12 (audit records)** carves our security and consent records out of the school's deletion instruction. We think this is right — they are our evidence of lawful processing and a school should not be able to order the destruction of the log showing what it did. Please confirm it is enforceable.
5. **"The Authority"** is used throughout instead of a name, because our sources disagree on whether it is the National Data Governance Authority or the National Data Management Authority (`COMPLIANCE-PDPA.md` §1.9). Insert the correct name once confirmed.
6. **Annex A** must be regenerated from `DATA-MODEL.md` before signature — the version below mirrors `COMPLIANCE-PDPA.md` §4 as at the draft date.
7. `{{...}}` are placeholders. **[VERIFY]** marks a factual claim not yet confirmed.
8. A **Bengali version** is required and must be authoritative for Bengali-signing schools.

---

# Data Processing Agreement

**Between:** {{Acadigma legal entity}}, {{registration number}}, {{registered address, Bangladesh}} ("**Acadigma**", "we", "us")
**And:** the school named in the Acadigma Campus workspace created by the person accepting this agreement ("**the School**", "you")

**Version {{n}} · effective from the date you accept it in Acadigma Campus.**

This agreement sits alongside the Acadigma Terms of Service. It covers how we handle personal information belonging to your students, their families and your staff. Where the two documents disagree about personal information, this one wins.

---

## 1. Plain-language summary (not a substitute for the clauses below)

- **You are in charge of your school's data.** The law calls you the _data fiduciary_. We are the _data processor_ — we run the software and do what you ask.
- **We only use your data to provide the service to you.** Never to sell, never to advertise, never to train AI models.
- **We tell you where your data is** (Mumbai, India) and who else touches it (clause 9 and Annex C).
- **We help you meet your obligations:** exports, corrections, deletions, records of parental consent, and a full account if anything goes wrong.
- **If there is a breach we tell you within 72 hours** of confirming it, with real numbers.
- **When you leave, you get your data** and we delete the rest.

## 2. Who does what

2.1 For all personal information you or your staff put into your Acadigma Campus workspace — students, guardians, staff, attendance, marks, files, messages, hiring — **you are the data fiduciary (controller) and Acadigma is the data processor**.

2.2 You are responsible for: deciding what to collect, having a lawful basis for it, obtaining and recording parental consent where a student is under 18, telling students' families what you do with their information, deciding who at your school may see what, and responding to requests from families.

2.3 We are responsible for: processing only on your instructions, keeping the information secure, telling you about breaches, helping you answer requests, and only using the other companies listed in Annex C.

2.4 **Where Acadigma is itself the controller.** Some information is ours to decide about, and this agreement does not cover it — it is covered by our Privacy Policy. This includes: user accounts and sign-in security; a teacher's own personal workspace, CV and job applications; marketplace seller accounts, identity checks, payments and payouts; and our own security and service records. Where a member of your staff also uses Acadigma as an individual, that part of their use is between them and us.

2.5 **We are not your lawyer.** This agreement does not make your school compliant with the law. You should take your own legal advice.

## 3. What we process, and why

3.1 The subject matter, nature and purpose of the processing, the types of personal information and the categories of people involved are set out in **Annex A**, which forms part of this agreement.

3.2 The processing lasts for as long as your subscription lasts, plus the periods in clause 12.

3.3 **Our instructions are your instructions.** We process personal information only:
(a) as you instruct through your use of the software and its settings;
(b) as reasonably necessary to provide, secure, support and maintain the service;
(c) where a law we are subject to requires it — in which case we will tell you first unless the law forbids us to.

3.4 **We will not**: sell your data; use it for advertising or profiling; use it to train artificial-intelligence models; use it to build products for anyone else; or access it except as clause 5 allows.

3.5 **Aggregated and anonymised statistics.** We may produce statistics that cannot identify any person or any school (for example, average attendance across all schools using Acadigma) to improve the service and to describe our product publicly. We will only do so where no figure is drawn from fewer than **{{5}} schools** or **{{50}} students**, and the result cannot be traced back to you. If you do not want your school included, tell us and we will exclude it.

3.6 If we think an instruction from you breaks the law, we will tell you and may pause that instruction until it is resolved.

## 4. Children

4.1 A large part of the information in Acadigma Campus is about children under 18. Both of us treat it with the care that deserves.

4.2 **You confirm** that you have the consent of a parent or legal guardian, or another lawful basis, for each student whose information you put into Acadigma Campus, and that you will keep that consent current.

4.3 **We will provide** the means for you to obtain and record that consent: the guardian invitation flow, which records who agreed, when, by which channel (email or SMS), to exactly which words (with a version and a cryptographic hash of the text), in which language, and from which device — plus a way to record a consent given to you on paper.

4.4 **Neither of us** will use students' information for advertising, behavioural profiling or targeted marketing, and we will not make automated decisions about a student that have a significant effect on them without a person reviewing it. The attendance-and-marks indicator in the software is a published, explainable calculation shown to teachers with its reasons, subject to a teacher's override.

4.5 We collect no biometric information (fingerprints, facial or iris data) from students or anyone else. If either of us ever wishes to introduce it, it will require a fresh written agreement and a data-protection impact assessment.

## 5. Confidentiality and who at Acadigma can see your data

5.1 Everyone at Acadigma with access to your information is bound by a written confidentiality obligation that survives their leaving.

5.2 **We do not browse your school's records.** Access is limited to named personnel who need it for a specific task.

5.3 **Support access.** If you ask us for help with something that requires us to see your data, an owner at your school grants a **time-limited access permission** from within the software. It expires automatically, it is recorded in your audit log, and we cannot extend it ourselves. **We never sign in as one of your users.**

5.4 **Emergency access.** If we must access your data to stop or investigate a security incident, we will do so under our own record and tell you within 24 hours what was accessed and why.

5.5 We maintain a record of who has access and review it at least quarterly.

## 6. Security

6.1 We maintain the technical and organisational measures described in **Annex B**, and we will not reduce them below the level described there during this agreement.

6.2 We test those measures automatically before every release and have the service tested by independent security professionals at least annually. We will give you a summary of the most recent test on request.

6.3 **Your responsibilities matter too.** You control who at your school has an account and what role they hold. Please remove people promptly when they leave, do not share accounts, and use the roles rather than giving everyone administrator access. Most real-world exposures start here.

## 7. Helping you with requests from families and staff

7.1 The software includes tools for you to answer requests yourself: view and export a student's, a guardian's or a staff member's full record; correct records; delete what is deletable; and see which records are under a legal hold.

7.2 Where a request needs our help, we will assist you at no charge, and complete our part within **10 working days** of a clear request.

7.3 **If a family contacts us directly**, we will not act on it ourselves. We will acknowledge them within **3 working days**, tell them to contact you, and pass the request to you through the software and by email. We will follow up with you at day 15 if it is still open, because responsibility for your failure to answer can fall on us too.

7.4 We will also help you with: telling families what you do with their data, carrying out data-protection impact assessments for features you use, and consulting the Authority if you ever need to.

## 8. If something goes wrong

8.1 **What counts.** A breach is any accidental or unlawful destruction, loss, alteration, or unauthorised disclosure of or access to personal information we process for you.

8.2 **First notice — within 24 hours** of us confirming a breach affecting your data, we will tell you what we know, even if the picture is incomplete, and give you a named contact.

8.3 **Full notice — within 72 hours** of us confirming it, in writing, with:
(a) what happened and when, and for how long;
(b) the categories of personal information involved, and the approximate number of people and records;
(c) whether the information was **actually accessed**, or only accessible — we keep access logs precisely so we can answer this;
(d) the likely consequences for the people affected;
(e) what we have done and what we will do;
(f) a list of the affected individuals, supplied securely.

8.4 **Who notifies whom.** You are the data fiduciary, so **you** decide on and make any notification to the Authority and to affected families. We will give you a technical report you can file, and a draft notice in Bengali and English. Where the breach concerns information for which we are the controller (clause 2.4), we notify directly.

8.5 We will not make any public statement identifying your school without your agreement, unless a law requires it.

8.6 Within **30 days** we will give you a written account of the cause, the control that failed, and what we have changed.

## 9. Where your data goes

9.1 **You instruct us** to store and process your personal information as follows, and you confirm you have a lawful basis for it:

| Where                                         | What                                                                                              | Who            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| **Mumbai, India** (AWS region `ap-south-1`)   | Your database, files, and user authentication                                                     | Supabase       |
| **Mumbai, India** + a global delivery network | Application servers; pages delivered from the nearest location, which does not store your records | Vercel         |
| **United States**                             | Text of AI requests and their results only, with the removals in clause 9.3                       | Anthropic      |
| **United States / Europe**                    | Transactional emails; error reports containing identifiers only                                   | Resend; Sentry |
| **Bangladesh**                                | Payment processing                                                                                | SSLCommerz     |

9.2 **We do not store your data in Bangladesh today.** We tell you this plainly rather than letting you assume otherwise. The rules on which categories of personal information must stay in Bangladesh are still being settled by the government. We are planning for a Bangladesh-resident option and will tell you before any change. If the law requires your data to be held in Bangladesh, we will either provide that or let you leave without penalty. **[VERIFY: counsel must confirm whether health records, ID scans and similar fall within the "confidential" or "restricted" classes that must be stored in Bangladesh — `COMPLIANCE-PDPA.md` §5.5 and §11 Q2.]**

9.3 **What is removed before anything reaches the AI service**: students' full and family names (at most a first name), dates of birth and ages (class level is sent instead), all identity numbers, phone numbers, email addresses and postal addresses, **all health information**, **religion**, individual marks tied to a named student, and guardians' names and contacts. **No document of any kind is sent** other than a syllabus, which contains no personal information. These removals are performed automatically by our software and tested on every release.

9.4 **No bulk transfers of sensitive identifiers.** We will not export national identity numbers, identity documents or comparable identifiers in bulk out of the platform to any destination.

9.5 We have written terms with each provider in Annex C requiring protection no weaker than this agreement.

## 10. Other companies we use

10.1 You agree we may use the providers in **Annex C**, and any we add under clause 10.2.

10.2 **We will give you 30 days' written notice** before adding or replacing one. If you object on reasonable data-protection grounds, tell us within those 30 days and we will try to resolve it. If we cannot, you may terminate the affected part of the service and receive a pro-rata refund for the unused period.

10.3 Each provider is bound by written terms requiring protection no weaker than this agreement, and **we remain responsible to you for what they do**.

10.4 The current list is published at {{/legal/subprocessors}} and you can subscribe to be notified of changes.

## 11. Audit

11.1 On request, once a year, we will give you: a summary of our security measures, a summary of our most recent independent security test, and written answers to a reasonable security questionnaire.

11.2 You may see your own audit log at any time inside the software — every change to every record in your school, who made it and when.

11.3 If that is not enough for a specific, documented concern, you may audit us on **30 days' written notice**, no more than once a year (unless a breach or the Authority requires otherwise), at your cost, during business hours, by someone who is not our competitor and who signs a confidentiality undertaking, and without disrupting our other customers or seeing their data.

## 12. Deletion and return of data

12.1 **While you are a customer**, you can export your school's data at any time from within the software.

12.2 **When this agreement ends**, we keep your data available for **30 days** so you can export it. On request within that window we will provide a complete export in a machine-readable format (JSON and CSV), once, at no charge.

12.3 **After that**, we delete your school's personal information within **90 days**, including from backups as those backups expire on their normal cycle (no longer than **{{30}} days** after deletion from the live system).

12.4 On request we will give you a **written confirmation of deletion** signed by our Chief Data Officer.

12.5 **What we keep, and why.** We keep, and you cannot instruct us to delete:
(a) **security and audit records** showing who did what in your workspace — these are how either of us can prove what happened, and destroying them would defeat the purpose of keeping them;
(b) **records of consent** and of acceptances of this agreement — our evidence that processing was lawful;
(c) **records of data-subject requests** and their outcomes;
(d) **financial records** — invoices and payments — for the period tax law requires;
(e) anything a law requires us to keep, for as long as it requires.
These are kept for **5 years** (or longer where law requires), secured as in Annex B, and used only to demonstrate compliance, to defend legal claims, and to investigate security incidents. We will not use them for any other purpose.

12.6 If a law prevents us deleting something on time, we will tell you, keep it secure, and delete it as soon as we may.

## 13. General

13.1 **Changes.** We may update this agreement to reflect changes in law or in the service. We give school owners at least **30 days' notice** of a material change by email, and ask them to accept the new version in the software. Your acceptance is recorded with the date, the version and a hash of the exact text you accepted, and you can download a PDF of it at any time.

13.2 **Records of acceptance.** You can see and download every version you have accepted from _Settings → Legal_.

13.3 **Our Chief Data Officer** is {{name}}, reachable at **privacy@acadigma.com**. For security matters, **security@acadigma.com**.

13.4 **The Authority.** "The Authority" means Bangladesh's data-protection supervisory authority under the Personal Data Protection Act, 2026. {{Insert the confirmed name.}}

13.5 **Governing law and courts.** {{Bangladesh; courts of Dhaka — for counsel.}}

13.6 **Liability, indemnities and limits** are dealt with in the Terms of Service. {{For counsel — this draft takes no position.}}

13.7 **Order of precedence.** For personal information: this agreement, then the Terms of Service, then anything else.

13.8 If any clause is unenforceable, the rest stands.

---

## Annex A — What we process for you

_To be regenerated from the live data model before signature. This version mirrors `COMPLIANCE-PDPA.md` §4 as at {{date}}._

**Subject matter:** providing the Acadigma Campus school-management service.
**Nature and purpose:** storing, organising, displaying, exporting, printing and transmitting school records; sending notifications and messages; producing PDF reports; assisting teachers with AI-generated teaching materials; processing payments.
**Duration:** the term of the subscription, plus the periods in clause 12.

**Categories of people:** students (including children under 18) · parents and legal guardians · teachers and school staff · job applicants · people your staff contact through the platform.

**Types of personal information:**

| Type                                                                                | Sensitive?                                     |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| Student identity: name, date of birth, gender, photograph, student and admission ID |                                                |
| Class, section, enrolment and promotion history                                     |                                                |
| Attendance records                                                                  |                                                |
| Marks, grades, GPA, rank, report cards and teacher comments                         |                                                |
| Homework, submissions and scores                                                    |                                                |
| Behaviour notes and points                                                          |                                                |
| An attendance-and-marks indicator flagging students who may need attention          |                                                |
| **Health conditions, allergies, medications, blood group, medical documents**       | **Yes**                                        |
| **Religion**                                                                        | **Yes**                                        |
| **National ID or birth-certificate scans (held briefly at admission)**              | **Yes**                                        |
| Guardian name, relationship, phone, email, occupation, address                      |                                                |
| Staff name, contact, role, qualifications, attendance, leave                        |                                                |
| **Staff pay rates and cover-teaching payroll impact**                               | Restricted                                     |
| Messages, announcements, contact logs                                               | May contain sensitive information in free text |
| Job applications, interview notes and scorecards; documents an applicant shares     | May contain sensitive information              |
| Files uploaded by your staff                                                        | May contain sensitive information              |
| Payment and invoice records for your subscription and purchases                     |                                                |

**Retention:** as set in the software by you, subject to the defaults in our Privacy Policy — student records {{7}} years after leaving; health information and medical documents until {{1}} year after leaving; identity scans {{90}} days after admission; messages {{2}} years (configurable); financial records {{6}} years.

## Annex B — Security measures

1. **Access control in the database itself.** Every record is locked to one school by row-level security in PostgreSQL, checked again independently by our servers. A user's school is determined from their membership record on the server; it can never be set by the browser.
2. **Automated proof.** Isolation and privilege-escalation tests run against every table on every code change, and a coverage check fails the build if any table lacks a policy. A release cannot ship without them passing.
3. **Roles.** Owner, administrator, teacher, staff and parent, each with a defined permission set. Parents see only the students they are linked to. Unknown role means no access.
4. **Private files.** Medical documents, identity documents and other private files are stored in a private bucket, never publicly addressable. Each download is a single-use link valid for **5 minutes**, issued only after a permission check, and every issue is logged with who, what and when.
5. **Encryption.** TLS in transit; encryption at rest; payout account details encrypted at the column level with a separate key.
6. **Permanent audit trail.** Every insert, update and delete is written to an append-only log by a database trigger inside the same transaction, recording who, what changed from and to, and a correlation identifier. No role, including our own service account, can update or delete these records.
7. **Authentication.** Verified email; strong-password rules with common-password rejection; phone one-time codes; rate limiting on sign-in, code requests and password resets; a device list users control; sign-out-everywhere; sessions revoked on password change.
8. **Input validation** on every server entry point; a strict content-security policy; no raw HTML rendering; file uploads checked by extension, declared type and actual file signature, with dangerous types rejected outright.
9. **No personal information in logs.** Identifiers only; an automatic redaction layer at the logger; error reporting configured to strip personal information; session replay disabled on pages showing student data.
10. **AI protections.** A single redaction function every AI request must pass through, enforced by an automated code rule, with unit tests per rule (clause 9.3).
11. **Separation of environments.** Development and preview environments never contain your production data.
12. **Supply chain.** Dependency and secret scanning, static security analysis, and pinned build actions on every change.
13. **Backups.** Daily automated backups with a documented restore procedure and a tested rollback playbook.
14. **People.** Named personnel only; written confidentiality obligations; quarterly access reviews; annual security and data-protection training; annual breach rehearsal.
15. **Independent testing.** Authorised penetration testing before launch and at least annually thereafter.

## Annex C — Other companies we use

| Company                            | What they do                                             | Where                                              |
| ---------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Supabase                           | Database, authentication, file storage, realtime updates | India (AWS `ap-south-1`, Mumbai)                   |
| Vercel Inc.                        | Application hosting and delivery; server functions       | Server functions in India; global delivery network |
| Anthropic PBC                      | AI features, subject to clause 9.3                       | United States                                      |
| Resend                             | Transactional email                                      | United States / Europe                             |
| Functional Software, Inc. (Sentry) | Error monitoring — identifiers only, no personal details | United States / Europe                             |
| SSLCommerz                         | Payment processing                                       | **Bangladesh**                                     |
| {{SMS provider}}                   | One-time codes and SMS invitations                       | {{Bangladesh — preferred}}                         |

Current list: {{/legal/subprocessors}}. Changes: 30 days' notice (clause 10.2).

---

## Pre-signature checklist

- [ ] Lawyer has read the gazetted Act and settled clauses 9, 12.5 and 13.5–13.6.
- [ ] Liability, indemnity and warranty position agreed in the Terms of Service and cross-referenced.
- [ ] Legal entity details and CDO name inserted.
- [ ] Authority name confirmed (clause 13.4).
- [ ] Annex A regenerated from `DATA-MODEL.md`.
- [ ] Annex B verified line by line against `SECURITY.md` — **remove anything not yet built**; an unbuilt control in a signed contract is a misrepresentation.
- [ ] Annex C confirmed, including each provider's own terms and locations.
- [ ] Anthropic's training and retention position confirmed in writing (clause 9.3).
- [ ] Vercel functions actually pinned to Mumbai (clause 9.1).
- [ ] Backup deletion window (clause 12.3) confirmed against the hosting provider's actual retention.
- [ ] **Bengali version prepared by a person** and confirmed authoritative for Bengali-signing schools.
- [ ] Acceptance flow built: blocking step in the school creation wizard, `legal_acceptances` row with version and hash, downloadable PDF, re-acceptance on version change.
