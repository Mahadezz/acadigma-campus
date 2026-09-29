# Demo script — an older teacher's whole morning (D-80)

A five-minute investor walkthrough on the live app, on a phone (360×800), plus a one-minute fallback. Everything shown is the **Acadigma Demo School (ডেমো)** on production: fictional names, phones in the unassigned `+88010…` range, no real school.

## Before the demo

| When               | What                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Once               | The owner adds the `DEMO_ACCOUNT_PASSWORD` secret (≥ 12 characters) to the `production` environment in GitHub.                                                                                                                                                                                    |
| **The day before** | Actions → **Demo seed** → Run workflow (on `main`). A run takes about a minute. The attendance history ends the day before the run, so a run a week earlier leaves a week of empty registers; a second run adds nothing (it does not top the history up).                                         |
| Within 30 days     | The demo school is on the 30-day Pro trial like any new school. After it, the school is read-only (D-62) and the roll call cannot be saved — see Known limits.                                                                                                                                    |
| Morning of         | Sign the teacher in on the demo phone (`teacher.demo@example.com`), open Class 6 – ক once **while online** (this caches it for the offline moment), then leave the app on the basic home. Sign the parent in on a second phone or browser tab (`parent.demo@example.com`). Charge both; Wi-Fi on. |

Accounts (all fictional, password = the secret):

| Account                    | Who                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `teacher.demo@example.com` | **Abdur Rashid**, class teacher of Class 6 – ক, teaches Mathematics and Science. Basic mode, large text, Bangla. |
| `owner.demo@example.com`   | **Mahbuba Sultana**, head teacher (owner). Teaches Bangla and English in the data.                               |
| `parent.demo@example.com`  | **Abdul Uddin**, father of roll 1, Rahim Uddin (রহিম উদ্দিন).                                                    |

## The five minutes

| Time | Tap                                                                                                                                                            | Say                                                                                                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | Show the teacher's phone on the basic home: large Bangla text, one block per class.                                                                            | "This is Abdur Rashid, 56, who has taught for thirty years and has never used a school app. This is all he sees: his classes, in Bangla, in big letters. No menus."                                                                          |
| 0:40 | Tap **Class 6 – ক** → attendance.                                                                                                                              | "Forty children. The old way is a paper register and a tally at the end of the month."                                                                                                                                                       |
| 1:00 | **Turn on airplane mode.** Tap **সবাই উপস্থিত** (Mark all present), then mark three children **অনুপস্থিত** (Absent) — include roll 12. Tap **সংরক্ষণ** (Save). | "Classrooms in Bangladesh often have no signal. He takes the roll anyway — one tap for everyone, three taps for who is missing."                                                                                                             |
| 1:40 | Point at **Saved on this phone · waiting to send** and the **১টি অপেক্ষায়** chip.                                                                             | "It is saved on the phone. Nothing is lost if he closes the app or the battery dies."                                                                                                                                                        |
| 2:00 | **Turn airplane mode off.** The chip clears by itself.                                                                                                         | "When the signal comes back, it sends itself. He did nothing. The head teacher now sees today's attendance, before 9:30."                                                                                                                    |
| 2:30 | Open the class's monthly attendance register (Reports → register for Class 6 – ক) and find **roll 12**.                                                        | "Roll 12 has missed one day in three for three weeks. On paper nobody notices until the term ends. Here it is, and nobody had to add anything up."                                                                                           |
| 3:00 | Open the **অর্ধবার্ষিক পরীক্ষা** marks for Mathematics.                                                                                                        | "He entered his Mathematics and Science marks here, forty rows, and submitted them. The head teacher locked them and published the results."                                                                                                 |
| 3:30 | Switch to the **parent's phone**: the family screen shows Rahim's published result.                                                                            | "The father sees his son's result the moment the school publishes it. No trip to school, no lost paper."                                                                                                                                     |
| 4:00 | On the parent's phone, tap **Download report card** under Rahim's result (a PDF).                                                                              | "And the printed report card, in Bangla, with the grade points the national system uses, is one tap. Schools spend days on these every term."                                                                                                |
| 4:30 | Close.                                                                                                                                                         | "Attendance offline, marks, results, the parent and the report card: an ordinary teacher's morning, on the phone he already has. Every write goes through the same rules on the server — a teacher can never see another school's children." |

Say only what is on screen. If a screen differs from this table because a Part has changed since, follow the screen.

## The one-minute fallback

For a bad connection, a dead phone, or a short slot. Online only, the teacher's phone:

1. Basic home (10 s): "His classes, in Bangla, big text."
2. Class 6 – ক → **সবাই উপস্থিত**, mark two absent → **সংরক্ষণ** (25 s): "Forty children in three taps."
3. Parent's view of Rahim's result, or the report card PDF opened earlier (25 s): "The father sees it the moment it is published."

If the live app is unreachable, show the Playwright screenshots in the latest test reports instead, and say so.

## Known limits

- **Trial:** the demo school becomes read-only 30 days after the first seed run (D-62). The seed does not reset it; until a platform-admin path exists, the lead extends it by hand or the demo moves before then.
- **History gap:** the 18 days of attendance end the day before the first run. Run the workflow the day before the demo; re-running later does not add days.
- **Past registers are stamped:** days older than the 2-day edit window were saved by the head teacher and carry `edited_after_window` — true to the rule for an admin entering past registers (D-104).
- **Class hub:** the basic-mode class hub (F-ID-10 Part 3, PR #82) is not merged at the time of writing; until it is, the teacher reaches attendance and marks from the basic home's class block and the app's own links.
