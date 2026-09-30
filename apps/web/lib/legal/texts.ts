/**
 * The exact words a person agrees to (D-114). Each string is hashed (SHA-256
 * of its UTF-8 bytes) and that hash is stored in `app.legal_documents` by the
 * migration that publishes the version; `legal_acceptances` and
 * `consent_records` copy it, so "which words did they agree to" stays
 * answerable after the text changes.
 *
 * NEVER edit a published string. A change is a new version: a new constant,
 * a new `app.legal_documents` row in a new migration, and a new entry in
 * `documents.ts`. `texts.test.ts` fails if a string and its stored hash drift.
 *
 * Format (rendered by `legal-text.tsx`): `# ` title, `## ` heading, `- ` list
 * item, blank line between paragraphs. Nothing else.
 */

export const TERMS_2026_09_30 = `# Terms of Use (interim)

Version 2026-09-30-interim.

These are interim terms. They have not yet been reviewed by a lawyer. A reviewed version will replace them, and we will ask you to accept that version when it is published.

## Who we are

Acadigma Campus is school software made by Acadigma, Bangladesh. You can contact us at privacy@acadigma.com.

## Your account

- You must be 18 or older to create an account.
- Use your own name and an email address you control. Keep your password to yourself.
- You are responsible for what is done with your account. If you think someone else has used it, change your password and tell us.
- You can delete your account at any time from Account settings. Deletion takes effect after 30 days, and you can cancel it during that time.

## Using Acadigma Campus

- Use it only for school work: keeping records, teaching, and keeping families informed.
- Enter information about students, families and staff only when your school has a proper reason to keep it.
- Do not try to see information you have not been given access to, and do not try to break or overload the service.
- We may suspend an account or a school that breaks these rules or puts other people's information at risk.

## Schools

- The person who creates a school in Acadigma Campus accepts the Data Processing Agreement on the school's behalf. The school decides what information it keeps, and is responsible for it.
- A new school starts with a free trial. Prices and payment terms are agreed with each school separately before any payment is taken.

## Information about people

How we handle personal information is described in the Privacy Notice. We do not sell personal information and we do not show advertisements.

## The service

- We work to keep Acadigma Campus available and correct, but we cannot promise it will never be interrupted or never contain a mistake.
- Keep your own copy of anything you cannot afford to lose. A school owner can export the school's data from Settings.
- We may change the service. If a change takes something important away from a paying school, we will tell the school first.

## Changes to these terms

We will publish any new version on this page with its date. If the change matters, we will ask you to accept the new version.
`

export const PRIVACY_2026_09_30 = `# Privacy Notice (interim)

Version 2026-09-30-interim.

This is an interim notice. It has not yet been reviewed by a lawyer. It describes what Acadigma Campus does today. A reviewed policy will replace it.

## In short

- A school that uses Acadigma Campus decides what it records about its students, families and staff, and is responsible for that information. We run the software for the school.
- For your own account, we are responsible.
- Children do not have accounts. Only adults sign in: school staff and parents.
- We do not sell personal information. We do not show advertisements. There are no advertising or tracking tools in the app.
- We never collect fingerprints, face scans or any other biometric information.

## What we keep

- Your account: your name, your email address, your password (stored only in a form that cannot be read back), and your settings such as language and theme.
- School records that a school enters: students' names, gender, class and date of birth; guardians' names, relationship and phone numbers; attendance, marks and results; staff records.
- A record of changes: who changed which record, and when. Schools use it to answer questions about their records, and we use it to investigate security problems.
- A scrambled (one-way hashed) form of your internet address, used to slow down people who try to guess passwords.

## Parents

A parent sees only their own child's information, after accepting a link from the school. When you accept, we record that you agreed, the date, and the exact words you agreed to.

## Where information is kept

Our database and application servers are in Mumbai, India (Supabase and Vercel, on Amazon Web Services). We do not claim that your information is kept in Bangladesh, because today it is not. Pages may be delivered through Vercel's worldwide network. Account emails, such as verification and password reset, are sent through the email service connected to Supabase. When error reporting is switched on, error reports go to Sentry. If your school sends you a link by WhatsApp, that message is handled by WhatsApp.

## Who can see what

- Staff at a school see only that school. Teachers see the classes they teach.
- Every record is locked to one school by the database itself, not only by the screen.
- Acadigma staff do not browse school records.

## Your choices

- You can delete your account from Account settings. It is removed after 30 days, and you can cancel during that time. Records a school must keep, such as attendance and marks, stay with the school.
- To see, correct or delete other information about you or your child, ask the school first. You can also write to privacy@acadigma.com.

## Changes

We will publish any new version on this page with its date.
`

export const DPA_2026_09_30 = `# Data Processing Agreement (interim)

Version 2026-09-30-interim.

This is an interim summary of what Acadigma commits to when your school uses Acadigma Campus. It has not yet been reviewed by a lawyer. A full agreement will replace it, and the school owner will be asked to accept that version.

## Who does what

- Your school decides what personal information it records about students, families and staff, and why. Your school is responsible for it.
- Acadigma runs the software and handles that information only to provide Acadigma Campus to your school.

## What Acadigma commits to

- We use your school's information only to run the service for you. We never sell it, never use it for advertising, and never use it to train artificial-intelligence models.
- Every record is locked to your school by the database itself. Other schools cannot see it.
- Acadigma staff do not browse your school's records.
- Your information is stored in Mumbai, India (Supabase and Vercel, on Amazon Web Services). We will tell you before we move it or add a new company that stores it.
- If your school's information is exposed, we will tell you within 72 hours of confirming it, with what we know.
- A school owner can export the school's data from Settings at any time.
- When your school is deleted, its records are removed after 30 days. The record of changes and the record of agreements are kept, because they show that information was handled properly.

## What your school commits to

- Record only what the school needs, and tell families what the school keeps.
- Get a parent's or guardian's agreement where the law requires it.
- Give each staff member only the access they need.

## Accepting

The person who creates the school accepts this agreement on the school's behalf and confirms they may do so.
`
