# Voice of Customer — what teachers, parents and admins actually say about school apps

Research input for **Acadigma Campus** · Fetcher #3 lens: app-store reviews, public pages and forums for Bangladeshi and South Asian school apps
Compiled 2026-09-17 · Companion to `../PRD.md`

---

## 1. How this was gathered (method and honesty notes)

**Primary source: Google Play review corpus, harvested directly.** Reviews were pulled from the Play Store's own reviews endpoint (`batchexecute` / `UsvDTd`), paginated, across three sort orders (most-relevant, newest, rating) and two locales, then de-duplicated. This returns far more than the three reviews a listing page shows.

| Metric                                    | Value                           |
| ----------------------------------------- | ------------------------------- |
| Apps queried                              | 41                              |
| Apps returning reviews                    | 41                              |
| Raw reviews harvested                     | ~26,900                         |
| Reviews with usable text (>12 chars)      | **26,193**                      |
| Of which in the school-OS competitive set | **18,575** (7,449 of them 1–3★) |
| Of which from Bangladeshi publishers      | **8,571** (2,581 of them 1–3★)  |
| Reviews containing Bengali script         | 862                             |
| Date range of quoted reviews              | 2016-08 → 2026-09               |
| Access date for all Play data             | **2026-09-17**                  |

**Confidence flags used throughout:**

- `[EVIDENCE]` — a direct quote or a count from the harvested corpus.
- `[INFERENCE]` — my reading of the evidence, not something a reviewer said.
- `[LOW CONFIDENCE]` — thin or indirect evidence; treat as a hypothesis to test.

**Known limitations, stated plainly:**

1. **Bangladesh has almost no large school-OS review base.** Only one genuinely Bangladeshi school-management app has a statistically meaningful review count: **ClassTune (2,743 ratings)**. Every other BD school-OS app is under 120 ratings. This is itself the single most important finding in this document — see §6. Depth therefore comes from Indian and global comparables with 6k–1.3M reviews, whose pains are structurally similar (low-end Android, parents on data packs, school-mandated adoption).
2. **Install bands are low-confidence.** Rating values and review counts are read from the listing's structured data and are reliable. Install bands were regex-extracted from page markup and some are clearly wrong (MCB Parent App showing "100,000,000+" is implausible). Treat the install column as indicative only.
3. **Facebook and YouTube mining was largely unproductive.** The ClassTune public Facebook page (11K followers) carries marketing posts and football-World-Cup engagement bait, not support complaints; comment threads on public BD school-software pages are thin and require login to read in depth. No login was used. Web search for BD teacher-forum threads on school software returned vendor marketing pages, not user discussion. `[EVIDENCE: absence]` — the complaint conversation for BD school software happens in the Play Store and in private/closed groups, not on indexable public pages.
4. **Some five-star BD reviews are plainly solicited.** School360 (4.56★, 64 ratings) has a cluster of long, marketing-toned five-star reviews all posted within three weeks of each other in March–April 2025, several in near-identical Bengali phrasing with a call-to-action to download. Sk Mobile School sits at 4.96★ across 280 ratings with essentially zero criticism. `[INFERENCE]` Small-N BD ratings are not trustworthy as quality signals; the _text_ of the rare negative review is worth more than the star average.
5. **A meaningful share of BD negative reviews are obscene rather than diagnostic.** In the ClassTune corpus, dozens of 1★ reviews are pure Bengali profanity aimed at the developer. These are excluded from the quote bank but counted in the frequencies. `[INFERENCE]` The intensity signal matters: when a school app fails during an exam, Bangladeshi users do not file a support ticket, they rage in the store. Reputational damage is immediate and public.

---

## 2. Per-app table

Ratings and review counts are as displayed on 2026-09-17. "Harvested" = reviews I actually pulled and read. "BN" = reviews containing Bengali script. "Neg" = harvested textful reviews at 1–3★.

### 2a. Bangladeshi school-management / school-community apps

| App                                          | Package                       | Rating   | Ratings   | Installs* | Last update      | Harvested | Textful | BN  | Neg |
| -------------------------------------------- | ----------------------------- | -------- | --------- | --------- | ---------------- | --------- | ------- | --- | --- |
| **ClassTune**                                | com.classtune.app             | **3.18** | **2,743** | 100K+     | **Jun 14, 2024** | 1,121     | 812     | 30  | 553 |
| Classpay (ClassTune fees)                    | com.classtune.classpayapp     | 3.79     | 81        | 10K+      | Dec 5, 2022      | 17        | 11      | 1   | 6   |
| Noubahini College Dhaka (Onnorokom Software) | ac.osl.ncd                    | **3.32** | 197       | 10K+      | Aug 6, 2026      | 74        | 57      | 1   | 34  |
| Amar School                                  | com.amarschool.app            | 4.28     | 111       | 10,000+   | Sep 3, 2026      | 26        | 13      | 3   | 0   |
| EduTune (AITL)                               | com.aitl.edutune              | 4.45     | 97        | 1,000+    | Sep 5, 2026      | 37        | 24      | 2   | 6   |
| School360                                    | com.myapp.school360.com.bd    | 4.56     | 64        | 10+       | Aug 16, 2026     | 30        | 20      | 7   | 2   |
| Teachers BD (tutor marketplace)              | com.techsoft24.teachers_bd    | 4.26     | 46        | 10K+      | Jan 20, 2026     | 31        | 27      | 2   | 4   |
| Edufy (SoftifyBD)                            | com.softifybd.edufy           | 4.94     | 22        | 10,000+   | Jun 10, 2026     | 12        | 8       | 0   | 2   |
| School Management Software                   | com.schoolmanagement.software | 3.28     | 19        | 1,000+    | Aug 28, 2026     | 12        | 11      | 8   | 6   |
| Eduman – Staff                               | com.ixs.staff                 | n/a      | n/a       | 50+       | May 4, 2026      | 21        | 12      | 0   | 10  |
| Eduman – Admin                               | com.ixs.admin                 | n/a      | n/a       | 50+       | Aug 17, 2026     | 8         | 6       | 0   | 4   |

*Install band low-confidence — see §1.2.

**Adjacent BD apps used for UX/pricing/OTP signal (edtech, not school OS):** 10 Minute School (4.43★, 294,959 ratings), Shikho (4.11★, 37,587), Priyo Shikkhaloy (4.65★, 1,765), Shikkha Sohay (4.68★, 45), Bangla School (4.00★, 287).

### 2b. South Asian and global comparables (the deep evidence base)

| App                              | Package                             | Rating   | Ratings   | Installs*   | Last update  | Harvested | Textful | Neg       |
| -------------------------------- | ----------------------------------- | -------- | --------- | ----------- | ------------ | --------- | ------- | --------- |
| ClassDojo (parent/teacher)       | com.classdojo.android               | 4.82     | 1,329,460 | 10,000,000+ | Sep 15, 2026 | 3,675     | 3,329   | 1,197     |
| Teachmint                        | com.teachmint.teachmint             | 4.47     | 186,361   | 1,000,000+  | Sep 12, 2026 | 3,693     | 2,968   | 712       |
| MCB Parent App (MyClassboard)    | com.mcb.myclassboard.activity       | **3.75** | 60,424    | (suspect)   | Sep 11, 2026 | 3,834     | 3,388   | **1,635** |
| Uolo Learn                       | com.uolo.notes                      | 4.20     | 37,872    | (suspect)   | Sep 2, 2026  | 3,450     | 2,888   | 930       |
| Seesaw                           | seesaw.shadowpuppet.co.classroom    | **3.95** | 25,863    | 100,000+    | Sep 16, 2026 | 3,400     | 3,208   | 1,295     |
| SMART MCB (teacher app)          | com.mcb.teacherapp                  | 3.81     | 6,882     | 1,000,000+  | Sep 1, 2026  | 1,965     | 1,070   | 709       |
| NeverSkip Teacher App            | com.nskteacher                      | n/a      | n/a       | 50,000+     | Jul 1, 2025  | 240       | 159     | 111       |
| NeverSkip Admin                  | com.nskadmin                        | n/a      | n/a       | 1,000+      | Jul 10, 2025 | 51        | 33      | 25        |
| Uolo Teach                       | com.uolo.teach                      | 4.01     | 412       | 10,000+     | Sep 2, 2026  | 130       | 81      | 27        |
| Smart School (CodeLogic)         | com.codelogictechnologies.schoolapp | n/a      | n/a       | 1,000+      | Sep 16, 2026 | 152       | 103     | 59        |
| Fedena Connect                   | com.fedena.fconnect                 | 3.64     | 78        | 100+        | Sep 10, 2025 | 26        | 21      | 13        |
| InClass – Student Attendance     | com.rtsschool.app                   | n/a      | n/a       | 1,000,000+  | Sep 16, 2026 | 60        | 40      | 13        |
| School Plus                      | com.m2hinfotech.eschool             | n/a      | n/a       | 10,000+     | Oct 31, 2025 | 45        | 27      | 11        |
| Coaching/Tuition Manager (tuFee) | com.syst.tuitionapp2                | 4.20     | 975       | 10,000+     | Jul 7, 2026  | 498       | 335     | 64        |
| SchoolOS                         | com.schoolos                        | n/a      | n/a       | 1,000+      | Sep 12, 2026 | 10        | 7       | 2         |

**Entab CampusCare was not reachable** as a single reviewed listing — Entab ships per-school white-label builds (e.g. `com.carmel.campuscare`, 500+ installs, 1 review), so there is no aggregate review base to mine. `[INFERENCE]` The per-school-build model _hides_ bad reviews by fragmenting them — a distribution strategy worth noting, and one Acadigma may want to consider (§7, R4).

---

## 3. Theme frequencies

Share of the **7,449 negative (1–3★) textful reviews** in the school-OS competitive set that match each theme's keyword set. Reviews can match more than one theme.

| Theme                                     | Neg hits | % of all negative reviews | BD-app hits (all stars) |
| ----------------------------------------- | -------- | ------------------------- | ----------------------- |
| Media / upload / download / PDF / photos  | 1,165    | **15.6%**                 | 1,070                   |
| Speed, lag, crash, "loading"              | 994      | **13.3%**                 | 325                     |
| Parent–teacher communication              | 882      | **11.8%**                 | 70                      |
| Notifications (late, missing, duplicated) | 786      | **10.6%**                 | 93                      |
| Login / password / OTP                    | 647      | **8.7%**                  | 246                     |
| Support / no response from developer      | 571      | **7.7%**                  | 293                     |
| UI / navigation / confusion               | 553      | **7.4%**                  | 253                     |
| Offline / network / "server down"         | 476      | **6.4%**                  | 213                     |
| Homework / diary / routine                | 443      | 5.9%                      | 90                      |
| Fees / payment                            | 440      | 5.9%                      | 207                     |
| Pricing / paywall / "scam"                | 413      | 5.5%                      | 222                     |
| Forced or constant updates                | 265      | 3.6%                      | 113                     |
| Results / report cards / marks            | 257      | 3.5%                      | 391                     |
| Attendance                                | 126      | 1.7%                      | 69                      |
| Multiple children / siblings              | 113      | 1.5%                      | 4                       |
| Data loss / work not saved                | 77       | 1.0%                      | 25                      |
| Language / Bangla / fonts                 | 41       | 0.6%                      | 492                     |
| Timetable / routine                       | 36       | 0.5%                      | 15                      |

**Reading this table correctly `[INFERENCE]`:** the low percentages for attendance, results and timetable do **not** mean those features work well. They mean users rarely get far enough into the app to complain about them — they are stuck at login, at loading, or at an upload. Attendance and results are where the _product value_ is; login, speed and notifications are where the _product dies_. Acadigma's PRD goal of "attendance in ≤60 seconds" is correct but insufficient: the 60 seconds only counts if the teacher can get into the app at all.

---

## 4. The quote bank

All quotes are excerpts from Google Play reviews harvested 2026-09-17. Format: `★ · date · app`. `*BD` marks a Bangladeshi publisher. Long reviews are excerpted, not reproduced in full. Obscene reviews are excluded.

### 4.1 Login, password reset and OTP — 8.7% of negatives, and the #1 BD-specific pain

> "Repeatedly, and very repeatedly login issue. Often times, specially at crucial moments it says stuff like 'Something went wrong, please try again' … 8 out of 10 times I have to enter my pass again and again to log in."
> — 1★ · 2025-11-18 · Noubahini College Dhaka *BD

> "faltu app … i need to Login every time i open the app!!"
> — 1★ · 2025-10-15 · Noubahini College Dhaka *BD

> "Quite embarrassing and not very helpful. All the time I open the app have to log in with password."
> — 1★ · 2025-08-18 · Noubahini College Dhaka *BD

> "too much login issues"
> — 1★ · 2026-06-07 · Noubahini College Dhaka *BD

> "good but someany time it ottomatikly log out"
> — 2★ · 2026-08-01 · Noubahini College Dhaka *BD

> "এটাতে আমি login করে পারছি না আর এটাই যাই দেই সব ভুল দেখাচ্ছে" _(I can't log in, and whatever I enter it shows everything is wrong)_
> — 1★ · 2026-08-14 · School360 *BD

> "There should be an option so that students can reset their passwords or usernames through email or phone number verification. But they don't have this system. And now I am in a problem and I cannot know my homeworks and results."
> — 1★ · 2020-08-10 · ClassTune *BD

> "this app isn't user-friendly, moreover, one cannot reset password."
> — 1★ · 2021-06-19 · ClassTune *BD

> "Very bad, school administration does not give the password"
> — 1★ · 2026-05-03 · SchoolOS

> "I forgot my password But there is no way to recover it"
> — 1★ · 2022-05-03 · Smart School

> "dude why can't I reset my password when I forget it? it says invalid no email address found after update"
> — 1★ · 2026-06-08 · Smart School

> "there is No option for forget / reset password as well as phone no. change ."
> — 1★ · 2025-04-11 · Smart School

> "I can't login I don't know the password and I can't click in forgot password also I have also emailed be no response came"
> — 1★ · 2021-08-24 · Smart School

> "In this app there is a problem when we change pass word … after doing logout when we put 5 letter password it say to type more then 6 letter. Please fix this problem"
> — 1★ · 2022-01-23 · Smart School

> "I spend 2 hours trying to get my username and password correct, and each time I tried to do it, it kept saying they're wrong. I even tried my email, but it didn't except it!"
> — 1★ · 2020-05-28 · ClassTune *BD

> "whenever i use my password on another laptop it says account not found … I logouted from my other phone and then used it on my laptop and then it worked"
> — 1★ · 2020-06-13 · ClassTune *BD

> "Today I tried to login to my account and it wouldn't let me in as apparently too many student are already using it. That makes no sense at all."
> — 1★ · 2020-06-18 · ClassTune *BD

> "I want to change my user id, my name (its wrong) but cant. i also want to insert my email to get notifications by email but cant!"
> — 1★ · 2017-01-19 · ClassTune *BD

> "very bad experience, same ID password can be logged by this app but class pay shows: Access Denied."
> — 1★ · 2022-04-20 · ClassTune *BD — single sign-on broken between the school app and its own fee app.

> "It repeatedly ask to enter the registered mobile number in school despite entering the registered mobile number. Please resolve the problem as school has already started."
> — 5★ (text negative) · 2026-06-12 · NeverSkip Teacher

> "when I entered my number it didn't work"
> — 1★ · 2025-09-20 · Smart School

> "I'm trying to sign up for few days ago. but code doesn't sent to my phone number. What is the reason?"
> — 3★ · 2023-08-26 · Priyo Shikkhaloy *BD — OTP SMS not delivered.

> "When we enter the OTP it shows error but we have to enter a U-Pin code given by the teachers"
> — 5★ · 2024-07-14 · Uolo Learn — a top-voted review on the listing is an OTP workaround.

> "This app is amazing but when I enter the OTP, it says that it's error. Please do something."
> — 5★ · 2024-05-23 · Uolo Learn

> "Really it's worst app … when I'm entering my userID nd Password it's coming invalid credentials … I'm using my friend's account to attend classes."
> — 1★ · 2020-11-21 · MCB Parent

> "the app essentially requires me to log in everytime. I have to select the following options — I am a parent, I have an account, then my account. It appears I no longer have the option to stay logged in."
> — 3★ · 2019-09-20 · ClassDojo

> "Hello love this app I am using its for my It institute 200+ students. Can u pls Update its Login authentication it save auto Login info. instead repeatedly enter id and pass."
> — 4★ · 2025-09-08 · School Management System

### 4.2 Speed, crashes and "loading" on low-end phones — 13.3% of negatives

> "very laggy app i have to login so many times which is so annoying and sometimes i have to redownload the app to work again otherwise it just hang in one loading screen. absolute Disaster"
> — 1★ · 2026-01-03 · Noubahini College Dhaka *BD

> "app is getting black screen in my android 11 os"
> — 2★ · 2026-08-02 · Noubahini College Dhaka *BD

> "This app took a lot of time to load! So,,,,,, But it's very useful"
> — 5★ · 2024-11-07 · Noubahini College Dhaka *BD — a _five-star_ review that leads with load time.

> "High speed net thakar poreo sharadin loading hoy" _(even with high-speed net it loads all day)_
> — 1★ · 2020-11-28 · ClassTune *BD

> "This app isnt that satisfactory. Takes a million years to load and on my tablet it doesn't even load it just stays on that classtune picture screen. I always have to do it from the website."
> — 1★ · 2020-05-14 · ClassTune *BD

> "Servers crash most of the time and are very slow. I missed 30 min of my class just because the notice where the meeting id and pass were took too long to load up."
> — 1★ · 2020-06-18 · ClassTune *BD

> "খালি লোডিং হয়" _(it just keeps loading)_
> — 1★ · 2024-04-20 · ClassTune *BD

> "It's super annoying! When you open a file or message, you have to wait and sometimes the app itself gets stuck you can't get out."
> — 1★ · 2020-07-19 · ClassTune *BD

> "It's very slow In responding your command. We are not sure if our [work] has successfully reached our teachers and there [is] not a way to check it."
> — 1★ · 2020-06-19 · ClassTune *BD

> "Very slow app. Ussless"
> — 1★ · 2024-03-14 · ClassTune *BD

> "Its a very poorly optimized app plus it doesn't even show data accurate."
> — 1★ · 2024-02-29 · ClassTune *BD

> "The mobile app doesnt even load. It is not just an issue on my side, every person in my school has this issue."
> — 1★ · 2023-04-30 · ClassTune *BD

> "ZERO … it [is] soooo slow that it takes around 30 minutes. once I was checking my child's homework and it took 30-45 minutes just to open."
> — 1★ · 2026-01-06 · MCB Parent

> "Extremely slow, highly unreliable and overall totally user-unfriendly. It takes ages to load at the login stage itself. Navigation is tedious, cumbersome and confusing."
> — 1★ · 2022-06-15 · MCB Parent

> "The MyClassBoard Parent App is extremely disappointing. It takes too long to load and often hangs. Updates are posted very late, making the information useless."
> — 1★ · 2026-02-15 · MCB Parent

> "the app size and update size is too high nearly eat away 200mb for application minimum and this make my phone slower for other tasks…. we are using with compromise no choice"
> — 3★ · 2020-04-18 · SMART MCB (teacher)

> "dis app always ask to update and its took a lot of storage in my phone"
> — 1★ · 2025-04-08 · MCB Parent

> "It is very slow and uses so much data (every time I go back to the main feed it loads the entire thing again)."
> — 2★ · 2022-10-07 · Seesaw

> "Clunky, takes forever to load. 80% of the time photos/videos won't load."
> — 2★ · 2022-12-06 · ClassDojo

> "It really does not work on android 11. I mean I've tried on three phones and the results are the same. The attendance is not marked, even I'm present is not shown to the teacher"
> — 1★ · 2021-07-02 · Teachmint

> "Not running in my phone. Opens but can't run. Only shows Smart School logo over the screen, neither log in box nor any other changes appears"
> — 1★ · 2024-07-05 · Smart School

> "It is very laggy … I cannot find out the work which is older than a week"
> — 1★ · 2020-09-26 · ClassTune *BD

### 4.3 Notifications — 10.6% of negatives

> "If changes are made, like section changing, offday notice no notification is given. which is a big problem."
> — 1★ · 2026-01-13 · Noubahini College Dhaka *BD

> "Good but it would have been appreciated if classtune sent us notifications. Currently we have to manually enter to check if there is a notice."
> — 4★ · 2024-06-02 · ClassTune *BD

> "some notifications never reach the students or are sent very late and some notifications are repeated constantly."
> — 1★ · 2020-06-19 · ClassTune *BD

> "it doesn't sync notifications on time — for example once I got a notification of a class that would start at 8:30 am at 10 am."
> — 1★ · 2020-06-19 · ClassTune *BD

> "its notifications comes late than the actual time and also one message comes thousand of times"
> — 1★ · 2020-06-19 · ClassTune *BD

> "I got the notifications after the class finishes"
> — 1★ · 2020-06-27 · ClassTune *BD

> "it doesn't keep us parents notified at all. what's the use of it then?"
> — 1★ · 2019-02-01 · ClassTune *BD

> "Besi besi Pacage er Notification ese disturbed kore" _(too many package/marketing notifications, it's disturbing)_
> — 1★ · 2024-12-13 · Priyo Shikkhaloy *BD

> "Whenever I start any particular online class it sends notification to other classes as well."
> — 1★ · 2021-08-06 · Smart School

> "Notification is not comming — my 2 period is missed. PLS fix the notification problem"
> — 1★ · 2021-06-27 · Smart School

> "this app sends nootification but when we enter app we see nothing"
> — 1★ · 2020-09-04 · Smart School

> "why there is no option for notifications. We have to keep checking the app if anything is put on by the school or teachers."
> — 2★ · 2025-09-07 · MCB Parent

> "we are receiving notification only but while checking in app, it is not updated one"
> — 1★ · 2024-11-04 · MCB Parent

> "Whenever notifications are sent, they should refer to the name of child also rather than landing directly onto announcement page."
> — 2★ · 2020-03-07 · MCB Parent

> "this app has stopped sending push notifications (e.g., when my child's teacher sends a private message or posts to the class). I've missed important health related announcements due to this."
> — 2★ · 2021-07-20 · ClassDojo

> "It shows multiple notifications (which never disappear), however no new posts or messages when i check, meaning I'm constantly having to check"
> — 1★ · 2024-01-12 · ClassDojo

> "the notifications keep repeating itself, even after checking the messages. It can come as late as 2 days after."
> — 3★ · 2025-11-05 · ClassDojo

> "extremely frustrated with the lack of notifications … It is very frustrating seeing messages from teachers days later because you didnt even know you had them."
> — 2★ · 2019-08-28 · ClassDojo

> "am not getting the notifications properly at right time no matter the notifications settings … whenever they send any msgs the notification alerts after 2-3 days"
> — 4★ · 2021-06-16 · Uolo Learn

> "Fuze feeds are sent during midnight and are quite disturbing. Why do you sent Fuze feeds at odd hours … Even banks don't send non critical SMS alerts during night time."
> — 1★ · 2020-02-16 · Uolo Learn

> "I also can not adjust settings in the app to send me push notifications only. It always seems me an email stating I have a notification as well as the push notification on the phone. Very annoying."
> — 3★ · 2019-09-10 · ClassDojo

### 4.4 Offline, network and "server down" — 6.4% of negatives

> "Most of the times it shows 'no internet connection' even when the wifi line seems to be connected."
> — 1★ · 2020-05-01 · ClassTune *BD

> "While I will try to use this app in mobile, all time it shows no internet connection. All the apps are working, only this stupid app is not working."
> — 1★ · 2019-07-31 · ClassTune *BD

> "I have GREAT internet but it still does not work."
> — 1★ · 2020-06-26 · ClassTune *BD

> "Faltu app. Internet lage. Offline app hoile valo hoitoh. Server probs." _(Useless app. Needs internet. It would be good if it were an offline app. Server problems.)_
> — 1★ · 2020-06-23 · ClassTune *BD

> "This is trash … If it was offline students would have loved it."
> — 2★ · 2021-01-11 · ClassTune *BD

> "its better to write in diary if we don't have internet then what will happened"
> — 1★ · 2019-08-06 · ClassTune *BD

> "This app is very buggy, the servers are down often at crucial times."
> — 1★ · 2020-06-17 · ClassTune *BD

> "Baje khub baje.. Ektu pressure porlei server down" _(Very bad. The moment there's any load, the server goes down)_
> — 1★ · 2020-06-06 · ClassTune *BD

> "in the exam time app can not work, and auto result go. We can not participate the exam. The server problems more"
> — 1★ · 2020-06-15 · ClassTune *BD

> "When I open the app, it is telling that my Wi-Fi is offline but always my Wi-Fi is online only"
> — 1★ · 2020-12-12 · NeverSkip Teacher

> "When I am evaluate I can't go to next page it shows something went wrong go to back page even with good net connection."
> — 1★ · 2021-03-22 · NeverSkip Teacher

> "when I open this app then the app show me 'your internet conection appears to be offline'"
> — 1★ · 2021-09-01 · NeverSkip Admin

> "It shows mostly network error. In the online exam there is no option for start again when stuck due to networks. It also affects the rating of student."
> — 1★ · 2020-05-23 · MCB Parent

> "again and again its showing NETWORK ERROR .. speed of internet connection is 72mbps"
> — 5★ (text negative) · 2021-01-30 · MCB Parent

> "Although My network is static but whenever i start the Teachmint app, the network goes slow and i am not even able to conduct class"
> — 1★ · 2022-01-17 · Teachmint

> "if the internet is not good but you're still in the classroom it can also effect the attendance"
> — 3★ · 2022-02-14 · Teachmint

> "server busy … unable to connect … Try again later … For 10 days … Unable to receive any materials from school"
> — 2★ · 2020-07-06 · Uolo Learn

> "the message 'check internet connection' comes up. I have uninstalled the app, used both Wi-Fi and data and this message always comes up"
> — 2★ · 2019-12-09 · Seesaw

### 4.5 Attendance — low complaint volume, high consequence

> "very bad app teacher ra jokhon kushi tokhon absent diye dey" _(teachers mark you absent whenever they feel like it)_ — the reviewer asks for students to get visibility and a right of appeal.
> — 1★ · 2026-05-19 · Noubahini College Dhaka *BD

> "I m not able to mark present, absent of my class."
> — 3★ · 2022-06-28 · NeverSkip Teacher

> "After update I don't find attendance of my students"
> — 1★ · 2021-07-12 · NeverSkip Teacher

> "it gives a very wrong attendance, even though I was present it showed to b absent"
> — 2★ · 2021-07-29 · Teachmint

> "I can't get attendance of students after a year. When I need that there is no attendance display. According govt rules teachers should [keep] students attendance of online classes."
> — 3★ · 2021-05-26 · Teachmint

> "student can't view their attendance percentage"
> — 1★ · 2021-06-01 · Teachmint

> "Even if i attended full years clss the Statistics of mine attendance was 0."
> — 2★ · 2022-03-15 · MCB Parent

> "Attendance is showing incorrect … not updating properly"
> — 1★ · 2019-04-12 · MCB Parent

> "Except in laptop there's no availability of attendence in mobile"
> — 3★ · 2020-10-15 · MCB Parent

> "All Students monthwise attendance report not available. Many features are missing like auto attendance updation from subjectwise attendance."
> — 1★ · 2021-07-17 · SMART MCB (teacher)

> "even parents should be able to see [their] Ward's attendance, their report cards! no features at all."
> — 2★ · 2019-02-27 · Uolo Learn

> "No feature to apply for leaves or students absence."
> — 1★ · 2019-10-21 · MCB Parent

> "I didn't get my child's attendance question on time and we got our first absence."
> — 2★ · 2020-04-16 · ClassDojo

> "It would be very good for teachers if the app could also allow downloading the attendance report, including students' names along with their father's names, mobile numbers, and email addresses."
> — 3★ · 2025-08-31 · InClass

> "while sending attendance through WhatsApp please avoid present students details so that parents can easily track their child. For more convenience separate list may be provided … for absent and late comers"
> — 5★ · 2026-05-24 · InClass

> "I want you to make it only the class teacher can see his students and make attendance, not other teachers."
> — 4★ · 2026-08-28 · School Management System

### 4.6 Results, marks and report cards

> "I got 64 in Arts and Crafts but the report card says 18? What is this? FIX THIS FAST!"
> — 1★ · 2016-09-24 · ClassTune *BD

> "Our results has been published in this app but I can't see it I don't know why"
> — 1★ · 2020-08-12 · ClassTune *BD

> "I tried to see my report card and I only found the last year's report."
> — 1★ · 2021-03-16 · ClassTune *BD

> "it gives wrong information about exam routins"
> — 1★ · 2019-02-01 · ClassTune *BD

> "some quiz exams show results before even attending"
> — 1★ · 2020-04-05 · ClassTune *BD

> "My school 2nd term exam routine was changed but you didn't [give] the new routine!"
> — 1★ · 2016-08-09 · ClassTune *BD

> "perfect app. but I'm experiencing issue when generating result, please sort the issue"
> — 5★ · 2026-03-04 · School Management App

> "This app is so good and nice. but I wish some things needed to be added on the result sheet of each candidate. To create a space for remark after result score."
> — 5★ · 2026-07-30 · School Management System

> "A report card that is automatically created accordingly of the student performance. Also a certificate system that can be downloaded after each exam. If all of this is done, all the teachers and students will be bound to use teachmint."
> — 3★ · 2022-01-20 · Teachmint

> "the percentage it shows is always wrong… So please developers try to overcome this problem"
> — 2★ · 2020-03-19 · Eduman Staff

> "Plz make sure even names must come on alphabetical order in Exam section while entering marks"
> — 4★ · 2023-09-01 · tuFee

> "While evaluating papers it doesn't even have basic features [like] pinch zoom, no autorotate, badly placed icons and horrible wireframe! This feels like an app from the 2000s."
> — 1★ · 2021-07-23 · NeverSkip Teacher

### 4.7 Fees and payments

> "its a good idea to connect student, teacher & parents. but options are not updated. there is not FEES option, but they sms us to pay fees by bkash."
> — 2★ · 2020-03-30 · ClassTune *BD

> "I can't pay my fees. There isn't a pay option on the ClassTune app and when I try to login in on the ClassPay app, it says that my username and/or password doesn't exist, though it clearly does … I'm stuck to a dead end."
> — 1★ · 2021-02-09 · ClassTune *BD

> "Please arrange to accept all Banks Card, [it] accepts only Trust Bank's card. But due to Covid-19 situation, agent or Trust Bank is not available everywhere."
> — 3★ · 2020-04-15 · ClassTune *BD

> "Update removes the tution fees option"
> — 1★ · 2020-05-07 · ClassTune *BD

> "my fees option is gone. I logged out and then loged in again but it doesent works"
> — 1★ · 2020-06-22 · ClassTune *BD

> "payment slip download hoi na" _(the payment slip won't download)_
> — 1★ · 2022-11-25 · Classpay *BD

> "Please update the apps. Tuition fees option not show."
> — 3★ · 2020-04-09 · ClassTune *BD

> "very bad app. There is no fee modules i.e. there is no option of Admission fee, monthly fee, exam fee, Annual function fee, Late fee, fine etc. which is necessary for school management."
> — 1★ · 2026-08-27 · School Management System

> "your app is good. Please add a fee add option with students add record and track student payments due and received."
> — 3★ · 2025-10-29 · School Management App

> "unable to select a particular item in the list of pending fee. eg. if I choose the 2nd item, the 1st one is getting auto selected."
> — 5★ · 2025-05-12 · MCB Parent

> "there should be an option on Tuition fee structure, like quarterly or any payment plan that suits your institution, rather than monthly payments."
> — 4★ · 2026-05-11 · Smart School Management

> "They have given info about fees. But no one knows whom should I send the copy [of] receipt."
> — 1★ · 2020-04-27 · Uolo Learn

> "even the payment interface is laced with problems"
> — 1★ · 2022-06-15 · MCB Parent

> "Very nice app. Easy to use, fast and reliable. UPI payment gateway is very good."
> — 5★ · 2026-05-08 · SchoolOS — the one unambiguous payment _delight_ in the corpus.

> "send all due amount [to] each of the students in just one click through whatsapp. automatic I card and money receipt is the best feature … I have recovered 80% of the due amount"
> — 5★ · 2022-05-24 · tuFee

### 4.8 Pricing, paywalls and trust

> "fraud app hain, payment mat karna koi, payment karne k 2-4 din baad fir payment mangega aur pro feature lock kar dega." _(it's a fraud app, don't pay — 2–4 days after paying it asks for payment again and locks the pro features)_
> — 1★ · 2026-07-03 · InClass

> "Complete scam. They will just take your money and then ask for more money to unlock the features you already paid for … Customer service is only through a sketchy WhatsApp number."
> — 1★ · 2025-05-18 · InClass

> "i did purchase two id cards for my students it keeps on saying error … my money gone, and they don't return my funds."
> — 1★ · 2025-06-07 · InClass

> "no trial no demo very poor app"
> — 1★ · 2021-05-06 · School Plus

> "spend too much time chatting with an operator on their very limited demo app, so unable to trial a real version … They're asking for the money per student even before you have a chance to establish real time data."
> — 1★ · 2019-10-21 · School Plus

> "রেজিস্ট্রেশন ছাড়া ডেমো/কিছুদিন ব্যবহারের সুযোগ দেওয়া উচিত ছিলো … হুট করে কিছু না জেনেই কেনো মানুষ ফোন নাম্বার ইমেইলের মতো সেন্সিটিভ তথ্য আপনাদের হাতে তুলে দিবে?? আগে আস্থা অর্জন করুন।" _(You should have allowed a demo/trial without registration … why would people hand over sensitive information like phone number and email without knowing anything? Earn trust first.)_
> — 2★ · 2024-11-08 · Priyo Shikkhaloy *BD

> "কোর্স কেনার পরেও কিছু দিন পর সেই কোর্স আবার কিনতে হয়! টাকা দিয়ে কোর্স কিনে কেন লাইফটাইম ব্যবহার করতে পারবো না?" _(even after buying a course you have to buy it again after some days — why can't I use it for life after paying?)_
> — 1★ · 2025-08-19 · Priyo Shikkhaloy *BD

> "performance good, but money is too much"
> — 3★ · 2025-12-24 · InClass

> "Very Bad App. why this app requires pro version. waste of time"
> — 1★ · 2025-08-06 · InClass

> "$60 for a premium version is beyond ridiculous. Some of those premium benefits should really just be included. Not to mention, I never chose premium, but it signed me up and charged me anyway."
> — 2★ · 2023-09-20 · ClassDojo

> "Useless, and $60 for full version? But the only option for my child's school so we are stuck with it … most parents in my child's class don't use the app due to being hammered with upgrading to the paid version"
> — 2★ · 2024-01-22 · ClassDojo

> "Bugs you waaay too much to upgrade … app notifications, a banner at the top of the story feeds, and pop ups when you switch to the points section … there's a point where you actively hinder usability"
> — 3★ · 2021-09-17 · ClassDojo

> "considering the school uses the platform multiple times daily i feel it should be more attainable for low income families."
> — 3★ · 2021-10-12 · ClassDojo

> "worryingly it doesn't say how much is it after the 7 day trial … Not encouraging trust here."
> — 3★ · 2020-09-02 · ClassDojo

> "Excellent outlook with rich contents … I have purchased 4 years premium package with a reasonable price."
> — 5★ · 2024-01-26 · Priyo Shikkhaloy *BD — a BD user _praising_ a long-horizon prepaid plan.

> "Gives more for less money."
> — 5★ · 2024-04-17 · tuFee

> "subscription fee also not high. Really happy with this app."
> — 5★ · 2024-04-30 · tuFee

### 4.9 Language and Bangla

> "It's really good. It has both bangla and english. thats more helpful for students parents and teachers"
> — 5★ · 2020-11-06 · ClassTune *BD — the most-upvoted _positive_ ClassTune review; bilingualism is the named reason.

> "School360 একটি শিক্ষা-ভিত্তিক অ্যাপ যা শিক্ষার্থী, শিক্ষক এবং অভিভাবকদের জন্য ডিজাইন করা হয়েছে … স্কুল ম্যানেজমেন্ট, অ্যাটেনডেন্স, রেজাল্ট, নোটিশ বোর্ড … সহজে পরিচালনা করতে সহায়তা করে।"
> — 5★ · 2025-03-21 · School360 *BD

> "Edutune অ্যাপটি ব্যবহার করে ভালো লেগেছে। অ্যাপটি বেশ সুন্দর, সহজে ব্যবহার করা যায় এবং প্রয়োজনীয় ফিচারগুলোও গোছানো।" _(Liked using EduTune. Quite nice, easy to use, and the necessary features are organised.)_
> — 5★ · 2026-09-06 · EduTune *BD

> "এই স্কুল অ্যাপস ম্যানেজমেন্ট টি অনেক ভালো। সুন্দরভাবে ডকুমেন্ট রাখা যায় | হিসাব পাতি সম্পন্ন ভাবে রাখা যায়" _(This school app management is very good. Documents can be kept nicely, accounts can be kept completely.)_
> — 5★ · 2025-06-26 · School Management Software *BD

> "'ঢ'-কে বলা হয়েছে 'ড' … 'জিরাফ'কে লেখা এবং বলা হয়েছে 'জিরাপ'" _(a line-by-line correction of Bengali glyph and spelling errors)_
> — 4★ · 2025-01-22 · Bangla School *BD

> "font size is not enough to understand the topic easily"
> — 4★ · 2023-06-27 · 10 Minute School *BD

`[INFERENCE]` Language rarely appears as a _complaint_ in BD school-app reviews (0.6% of negatives) because incumbents are already bilingual or English-only-and-tolerated. But it appears constantly as the _reason for praise_. Bangla is table stakes, not a differentiator — and Bengali rendering and spelling errors are noticed and called out in forensic detail.

### 4.10 Data loss, work not saved, features vanishing after update

> "I submitted things the first day and the next day it says that you didn't submit anything."
> — 1★ · 2020-06-27 · ClassTune *BD

> "I used to have the 'submit' button but now it just disappeared! the place where it used to be is just blank … 'Filter by subjects' and 'filter by date' don't work."
> — 1★ · 2021-08-19 · ClassTune *BD

> "the option to submit answers just got disappeared. Like poof! 'It's gone.'"
> — 1★ · 2020-07-26 · ClassTune *BD

> "All the assessments I sent say not submmited."
> — 1★ · 2020-06-19 · ClassTune *BD

> "you can only send your assignments for one notice once so if you send the wrong assignment or files there is no way of undoing it."
> — 1★ · 2020-06-18 · ClassTune *BD

> "It was working just fine before the latest update, now i can't switch to student mode there is literally no options!"
> — 1★ · 2020-10-04 · ClassTune *BD

> "Even when the app is updated, previous record gets vanished"
> — 1★ · 2019-11-07 · Eduman Staff

> "Worst ever app. Servers gets down every time. By default resets everytime — you will have to need asistance from software developers."
> — 1★ · 2021-09-04 · Eduman Staff

> "if the file selecting time is out then the whole process will get erased and we have to do the submision from first."
> — 1★ · 2021-07-22 · MCB Parent

> "The app crashes every so often, doesn't save frequently (its a kids app, it should save automatically after every change), so students are forced to do the work over and over again."
> — 1★ · 2020-05-07 · Seesaw

> "after spending 20 minutes assisting a 5 year old moving letters around, the app would not save anything unless we updated it."
> — 3★ · 2020-04-23 · Seesaw

> "backup facility is not as much good — only 108 kb backup which irritate me"
> — 4★ · 2025-07-16 · tuFee — an admin explicitly asking for real, verifiable exports.

### 4.11 Support and responsiveness

> "It want Some Features Which I tell From Two Month … And Coustomer Service is not good"
> — 1★ · 2026-06-26 · Smart School Management

> "I have also emailed be no response came this app is worse"
> — 1★ · 2021-08-24 · Smart School

> "Have mailed for getting credentials to have a demo yet I didn't get any response from admin side"
> — 5★ (text negative) · 2016-12-21 · NeverSkip Admin

> "After multiple mails and calls also the support team has not done anything to fix the issue"
> — 1★ · 2020-04-30 · Uolo Learn

> "Given feedback… Raised mail… Spoke to customer service… Nothing works still. Only option left is to contact school"
> — 2★ · 2020-07-06 · Uolo Learn

> "Issues have been reported earlier also but they don't really seems to care."
> — 1★ · 2020-02-16 · Uolo Learn

> "this issue has been reported by lots of parents for over a year. The response is 'its being looked into', obviously not!"
> — 3★ · 2021-09-01 · Seesaw

> "when I complained about it they told me to wait for 8-10 days, now it has been a month and the app is still not working"
> — 1★ · 2021-05-08 · Teachmint

> "I want to thank teachmint team for resolving the bugs through the new update … One of their representatives also contacted me through voice call"
> — 4★ · 2022-02-02 · Teachmint — the delight version; the reviewer _raised their own rating_.

> "The response from the helping community is very fast. If you face any problem they can solve it within 2 hours."
> — 5★ · 2022-05-24 · tuFee

> "Their behavior and politeness is really appreciatable."
> — 5★ · 2025-09-07 · Teachers BD *BD

> "Great support by developers, they understand the our need and try to update features in apps"
> — 3★ · 2025-08-19 · InClass

### 4.12 Multiple children, role switching and account model

> "How can I add multiple students?" / "Cant add multiple students"
> — 3★ · 2017-10-27 and 2★ · 2018-08-15 · ClassTune *BD

> "Unable to register with multiple student with one phone number in this app. If two students are studying in different class in same school then this app is not any useful."
> — 1★ · 2020-04-15 · Uolo Learn

> "instead of seeing all messages in one place, we have to click on the child's name, go to chats and repeat it for the other child. Too many clicks."
> — 1★ · 2023-06-18 · Uolo Learn

> "When I opened the chat section to send a message to my teachers it was not showing me my teachers instead it showed me my sibling's teachers."
> — 1★ · 2023-08-14 · MCB Parent

> "I have two kids added but only one kid session is easily accessed where as the other one keeps on getting dropped saying 'parent portal is stopped'."
> — 1★ · 2021-05-21 · MCB Parent

> "recent update removed second kid from the app. This is not good and there's a bug in add siblings option."
> — 2★ · 2019-07-09 · MCB Parent

> "The sibling option is not working."
> — 1★ · 2024-04-09 · MCB Parent

> "We have twins in P1. This app doesn't seem to support being able to switch between their separate journals without having to sign out of one then type the code for the other journal."
> — 3★ · 2021-09-01 · Seesaw

> "I have two kids and both of them use the same device, so they always have to scan their QR code every time that they want to log in."
> — 2★ · 2021-10-22 · Seesaw

> "gets difficult to manage when u have multiple kids with multiple teachers … There is NO SEARCH feature in the timeline. I have to scroll endlessly"
> — 3★ · 2019-09-10 · ClassDojo

> "to add anything additional (another child, more home details, etc), you have to pay for membership!"
> — 3★ · 2021-10-25 · ClassDojo

> "Once a person enrolls as a Teacher, He/She can't join any other online class as a student, from the same profile."
> — 4★ · 2020-11-21 · Teachmint — 1,946 helpful votes, the single most-upvoted review in the whole corpus.

### 4.13 Onboarding: "what is the school code?"

> "What is the school code"
> — 1★ · 2023-06-14 · School Plus

> "Hello pls after downloading the app, its requesting for school code, pls how do I generate that"
> — 1★ · 2020-08-28 · School Plus

> "I just downloaded the app for my school but its requesting for a code. I'm the administrator, how can I get the code?"
> — 1★ · 2020-07-04 · School Plus

> "How do I register to get code for my school?"
> — 1★ · 2021-11-21 · School Plus

> "Is the app for public? What is the registration key?"
> — 1★ · 2022-06-13 · ATTENDANCE SCHOOL

> "How to sign up by new user? What will be pswrd?"
> — 1★ · 2022-05-25 · Smart School

> "it doesn't work.. how to resister new school it always shows school not found?"
> — 2★ · 2021-08-05 · Smart School

> "My school was not their I search for a long time but I don't find my school"
> — 1★ · 2023-12-08 · Smart School

> "Useless app. At least a guest should have option to see your features. What do I do with the names of schools you currently have?"
> — 1★ · 2020-01-15 · Smart School

> "there dont have register button school information"
> — 1★ · 2020-05-31 · ClassTune *BD

> "first of all i installed it for the first time — instead of asking me to open a new account, it asks me to sign in"
> — 1★ · 2020-06-09 · ClassTune *BD

`[EVIDENCE]` Nine separate apps carry 1★ reviews whose entire content is a confused question about how to get a school or registration code. These are not bugs; they are onboarding failures that permanently damage the store rating.

### 4.14 Permissions, privacy and trust

> "There are many permissions here that they do not need. And here there is no security information on our mobile … All information is stolen."
> — 1★ · 2019-07-17 · ClassTune *BD

> "I Don't get it why on earth this app requires location access and modify and delete things from sd card…."
> — 1★ · 2019-07-17 · ClassTune *BD

> "It [is] surprising why this scool app will seek access to my contact?"
> — 1★ · 2017-11-11 · ClassTune *BD

> "Not functioning if you don't allow it to control your phone calls."
> — 1★ · 2017-04-09 · ClassTune *BD

> "I don't really like application which ask phone number to be able to use it … I don't feel safe any more since my phone number got hacked"
> — 3★ · 2021-03-01 · Teachmint

> "Have to share contact number for communication"
> — 3★ · 2024-11-15 · Noubahini College Dhaka *BD

### 4.15 Delights — what users actually praise

> "It's really good. It has both bangla and english … we can talk with the teachers by texting. thats really good. if we have any problems we can ask them by texting the subject teachers. and it is very easy to use."
> — 5★ · 2020-11-06 · ClassTune *BD

> "This app is really helpful. It makes Students, Parents & Teachers life very easy."
> — 5★ · 2020-09-24 · ClassTune *BD

> "I always get my homework done through this app. My teachers let me read through this app."
> — 5★ · 2020-07-15 · ClassTune *BD

> "I appreciate how efficiently it handles attendance, results, and other operations. It's a reliable and time-saving tool"
> — 5★ · 2025-03-21 · School360 *BD

> "আলহামদুলিল্লাহ এটি সুন্দর একটি এপস … খুব সহজেই পেমেন্ট, এটেন্ডেন্স, বিভিন্ন প্রয়োজনীয় নোটিশ ইত্যাদি অনেক কাজ হাতের মুঠোয় পাওয়া যায়" _(payment, attendance, all the necessary notices — many tasks in the palm of your hand)_
> — 5★ · 2025-04-11 · School360 *BD

> "আমি প্রায় ২০-২৫টা এডুকেশন ইআরপি কোম্পানির সাথে কথা বলেছি … উনাদের অ্যাপের সার্ভিসটা আমার কাছে খুব ভালো লেগেছে … যথেষ্ট আন্তরিকতার সাথে কাস্টমাইজেশন করে দেন। তাছাড়া খুব কম কোম্পানিই মোবাইল অ্যাপ সার্ভিস দিয়ে থাকে" _(I spoke to about 20–25 education ERP companies … very few even provide a mobile app service, which they do; and they customise sincerely)_
> — 5★ · 2026-05-21 · Amar School *BD — **a Bangladeshi school owner describing his actual buying process.**

> "We have been using this software in our school … since 2022. AmarSchool web applications and this mobile application has made our work much easier."
> — 5★ · 2023-10-01 · Amar School *BD

> "By using this app I can easily see my result and every month Salary paid or not."
> — 5★ · 2024-05-20 · Amar School *BD — staff payroll visibility named as a delight.

> "Now there is no need a register to maintain the record, because there's every feature in this application which needs to a school for maintain the record."
> — 5★ · 2020-09-22 · tuFee

> "automatic I card and money receipt is the best feature … I have recovered 80% of the due amount"
> — 5★ · 2022-05-24 · tuFee

> "I love this app! It was so nice to be able to see my child's school activities, friends, assignments, field trips, and teachers daily. I also love how I am able to send private messages and pictures to the teachers"
> — 5★ · 2024-05-22 · ClassDojo — 971 helpful votes.

> "not only can I take the register, contact parents, add homework, I can also give students positives!"
> — 5★ · 2022-09-15 · ClassDojo — 672 helpful votes.

> "Through this app, we can see homework, attendance, report cards, notices, and all other important school updates in just a few clicks. It saves so much time"
> — 5★ · 2025-11-23 · MCB Parent — 191 helpful votes.

> "It is very useful as I have fractured in my leg so I can't go to school so it provides me everything that what had teacher taught in the school."
> — 5★ · 2024-05-08 · MCB Parent

> "this app is very important for the parents to check the homework given in the school and it is very important for the children who forget the homework continuously"
> — 5★ · 2024-03-13 · SMART MCB

> "Very useful app, It's user-friendly low size, Quick to update, awesome."
> — 5★ · 2021-03-24 · SMART MCB — **"low size" named as a virtue.**

> "It's really good app with lots of features. Interface is very nice and is user friendly."
> — 4★ · 2020-11-21 · Teachmint — 1,946 helpful votes.

> "features like Hand raise, attendance, assignment and announcement are very useful"
> — 5★ · 2022-05-16 · Teachmint — 773 helpful votes.

> "The free account allows teachers to add 1 coteacher so you can collaborate."
> — 5★ · 2022-01-07 · Seesaw — 292 helpful votes.

> "I used seesaw (the free version) for several years at no cost, and it was the best all-encompassing online journal I had ever used."
> — 5★ · 2020-10-13 · Seesaw

> "Parents can easily view attendance, results, timetables, and important updates. Creating and linking accounts is simple and smooth."
> — 5★ · 2025-06-16 · School M

> "I got 2 tution from this app. Really trustworthy." / "All tutions are real."
> — 5★ · 2025-09-07 · Teachers BD *BD — **verification is the named delight in the BD teacher-marketplace category.**

> "in app chat system available, which is really convenient and easier to contact with customer support unlike other tutor provider apps"
> — 5★ · 2025-11-09 · Teachers BD *BD

---

## 5. Top 15 pains, ranked

Ranking combines **frequency** (share of the 7,449 negative school-OS reviews), **severity** (does it stop the user doing the job?) and **BD-specificity** (does it hit harder in Bangladesh?). Frequency figures are keyword-match estimates and should be read as ±3pp.

| #   | Pain                                                                                             | Freq.                                                                                                | Evidence strength                                                                 | Why it ranks here                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Login is a daily tax: forced re-login, no session persistence, no self-serve password reset**  | ~9% overall, but **the single most common BD complaint** (192 of 246 BD login mentions are negative) | **Very strong** — 27 quotes across 9 apps, three separate BD apps                 | Every BD school app in the corpus has 1★ reviews about being logged out or unable to reset a password. The user is locked out of their own child's results and has no recovery path except calling the school office.                 |
| 2   | **App is slow, hangs on a loading screen, or crashes on mid-range/older Android**                | ~13%                                                                                                 | **Very strong** — 22 quotes; ClassTune's 3.18★ over 2,743 ratings is largely this | "Takes a million years to load", "30–45 minutes just to open", black screen on Android 11. Appears in _five-star_ reviews as a tolerated defect.                                                                                      |
| 3   | **Notifications are late, duplicated, or silently absent**                                       | ~11%                                                                                                 | **Very strong** — 21 quotes across 6 apps                                         | A notice that arrives after the class is worse than no notice. Parents miss health announcements; students miss periods. Named cause of rating drops after updates in ClassDojo, Uolo, MCB.                                           |
| 4   | **"Server down / no internet connection" when the connection is fine; nothing works offline**    | ~6%                                                                                                  | **Strong** — 18 quotes, heavily BD-weighted                                       | Two ClassTune reviewers explicitly ask for an offline app; one says a paper diary is better. Exam-time server collapse is the most rage-inducing failure in the whole corpus.                                                         |
| 5   | **Fee payment is broken, partial, or lives in a second app with different credentials**          | ~6%                                                                                                  | **Strong** — 15 quotes, ClassTune/Classpay is a textbook failure                  | Fee option disappears after an update; only one bank's card accepted; separate ClassPay app rejects the same credentials; no downloadable receipt.                                                                                    |
| 6   | **Attendance is wrong, invisible to the person it affects, or unexportable**                     | ~2% frequency but very high severity                                                                 | **Strong**                                                                        | Students marked absent while present; attendance percentage hidden from students/parents; no month-wise report; teacher can't mark at all after an update. Low complaint count because users rarely reach the screen (§3).            |
| 7   | **Paywall resentment and trust collapse: pay-again-to-unlock, no demo, hidden post-trial price** | ~6%                                                                                                  | **Strong** — 17 quotes; "scam"/"fraud" appear verbatim                            | Acute in the South Asian set. A BD reviewer explicitly demands a _no-registration_ trial before surrendering a phone number. Two apps are accused of re-charging for already-purchased features.                                      |
| 8   | **Onboarding dead end: "what is the school code?" with no answer in the app**                    | Not keyword-measurable; **11 quotes across 9 apps**                                                  | **Strong**                                                                        | Users who cannot even start rate 1★. This is pure top-of-funnel loss and it is permanently visible on the store listing.                                                                                                              |
| 9   | **Support is a black hole**                                                                      | ~8%                                                                                                  | **Strong** — 12 quotes                                                            | "Emailed, no response came." Conversely, the _strongest_ delights in the corpus are about responsive support (tuFee "within 2 hours"; Teachmint calling a reviewer back). Support quality is a rating lever.                          |
| 10  | **Uploads, downloads and attachments fail or degrade**                                           | ~16% (largest single theme)                                                                          | **Strong** but partly online-class-specific                                       | Photos compressed to illegibility, multi-file attachments impossible, PDFs won't open, no progress indicator, submissions silently not saved.                                                                                         |
| 11  | **Work and data vanish — after updates, after timeouts, after "submission"**                     | ~1% frequency, catastrophic severity                                                                 | **Moderate–strong** — 12 quotes                                                   | Submit button disappears; previous records vanish on update; "by default resets everytime". Destroys trust permanently in a system of record.                                                                                         |
| 12  | **Parents with more than one child are second-class citizens**                                   | ~1.5%                                                                                                | **Strong for comparables, thin for BD** (ClassTune has 2 explicit requests)       | Sibling switching requires logout; notifications don't say which child; one phone number can't hold two students. `[INFERENCE]` Under-represented in BD data only because BD apps are too immature for parents to reach this problem. |
| 13  | **Forced/constant updates that change nothing and eat storage and data**                         | ~4%                                                                                                  | **Strong** — MCB and Teachmint especially                                         | "Why should we update the app daily?" 200 MB app + update on a phone with little storage is a real cost.                                                                                                                              |
| 14  | **Report cards and mark sheets are wrong, stale, or missing history**                            | ~3.5%                                                                                                | **Moderate–strong**                                                               | Wrong mark on a report card; only last year's report visible; no remarks column; no auto-generated report card.                                                                                                                       |
| 15  | **Excessive permissions and unexplained phone-number harvesting**                                | Not keyword-measurable; **6 quotes**                                                                 | **Moderate**                                                                      | BD reviewers of a school app specifically object to contacts, location and call-control permissions and conclude "all information is stolen." A children's-data product cannot afford this perception.                                |

**Honourable mentions (below the cut but real):** no dark mode; no iOS build (repeatedly demanded of BD apps — Noubahini, ClassTune, School360); no desktop/Windows app for the office (`"Can i use it windows?"`, `"I wish you could develop a computer application"`); no in-app search of the feed/timeline; class-teacher-only permission scoping requested explicitly.

---

## 6. Top 10 delights, ranked

| #   | Delight                                                                                  | Frequency signal                                                                  | Evidence                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **"One place for homework, attendance, results and notices" — the consolidation itself** | The most repeated theme in 4–5★ reviews across every app                          | MCB Parent 5★ (191 votes): homework, attendance, report cards, notices "in just a few clicks". tuFee: "no need [for] a register to maintain the record".                              |
| 2   | **Direct, low-friction parent↔teacher messaging**                                        | ~12% of _all_ reviews mention parent communication; dominant in ClassDojo's 4.82★ | ClassDojo 5★ (971 votes): private messages and pictures to teachers. ClassTune's top positive: "we can talk with the teachers by texting".                                            |
| 3   | **Fast, human support that actually closes the loop**                                    | Appears in the highest-rated small apps (tuFee 4.20★, Teachers BD 4.26★)          | "solve it within 2 hours"; Teachmint reviewer _raised_ their rating after a callback.                                                                                                 |
| 4   | **Bilingual Bangla + English UI**                                                        | Named explicitly in BD five-star reviews                                          | ClassTune's most-upvoted positive names bilingualism as the reason.                                                                                                                   |
| 5   | **Small app size and fast updates**                                                      | Rare but emphatic                                                                 | SMART MCB 5★: "user-friendly low size, Quick to update". `[INFERENCE]` Directly validates the PRD's <200 KB/route JS budget as a _marketable_ attribute, not just an engineering one. |
| 6   | **Money actually recovered: automated dues, receipts and ID cards**                      | Strongest ROI language in the corpus                                              | tuFee 5★: "I have recovered 80% of the due amount"; "automatic I card and money receipt is the best feature".                                                                         |
| 7   | **A working payment gateway on a local rail**                                            | One clean instance                                                                | SchoolOS 5★: "UPI payment gateway is very good." `[INFERENCE]` The BD equivalent — bKash/Nagad/card via SSLCommerz — is an unclaimed delight; ClassTune failed at exactly this.       |
| 8   | **Vendor willingness to customise, and the mere existence of a mobile app**              | The clearest BD _buyer_ signal in the corpus                                      | Amar School 5★, a school owner: after evaluating 20–25 education ERP vendors, "very few companies even provide a mobile app service" and they "customise sincerely".                  |
| 9   | **Verification and trust in marketplace-type products**                                  | Dominant in Teachers BD's reviews                                                 | "All tutions are real"; "Really trustworthy". `[INFERENCE]` Directly transferable to Acadigma's marketplace and hiring modules: _verified_ is the product.                            |
| 10  | **Staff-facing transparency (own attendance, own salary, own timetable)**                | Small but distinct                                                                | Amar School 5★: "I can easily see my result and every month Salary paid or not." Teachers value seeing _their own_ record, not only entering students'.                               |

---

## 7. Implications for Acadigma — pain → concrete requirement → PRD home

Each row states a screen or behaviour precise enough to build and test, and the PRD feature area it lands in (`§5.x` refers to PRD section numbers).

| Pain                                       | Concrete product requirement (screen / behaviour)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | PRD feature                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **P1 Login tax**                           | Sessions must survive app restarts, OS memory pressure and 30+ days idle — refresh-token rotation with silent renewal, never a forced re-login on cold start. Ship **three** recovery paths visible on the sign-in screen itself: "Forgot password" (email), "Sign in with phone OTP", and "Ask my school to reset" (generates an admin task in the school's console). Admin must have a one-tap **Reset credentials** action on any staff/parent row that issues a time-boxed link, and this must be a first-class screen, not a support ticket. Password rules must be shown _before_ typing, not after rejection. Add an e2e test: log in, kill app, reopen 10× — zero re-auth prompts. | §5.1 Identity & tenancy (F-ID-01…09); add an explicit "credential recovery" part |
| **P1b Cross-app credential mismatch**      | Acadigma ships four apps (Campus/Students/Parents/Admin). Every one must accept the _same_ identity with true SSO and a shared session. No second login for fees. Add a cross-app e2e test asserting a session minted in Campus authenticates in Parents.                                                                                                                                                                                                                                                                                                                                                                                                                                  | §5.1; Constraints §7                                                             |
| **P2 Slow / hangs / crashes**              | Enforce the PRD's LCP <2.5 s and <200 KB/route in CI on a throttled low-end Android profile, and add two behaviours the reviews demand: (a) **no infinite spinners** — every async surface has a 6-second timeout that renders a retry state with a plain-language cause, never a spinner that persists; (b) **skeleton + cached-last-value** rendering so attendance, results and notices always paint instantly from cache while revalidating. Add a Lighthouse + LCP budget gate that blocks merge.                                                                                                                                                                                     | §6 Performance; §5.1 notifications shell; R0 design system                       |
| **P3 Notification reliability**            | Notifications need a **delivery ledger**: every event row records queued → sent → delivered → opened, visible to the sending admin ("42 of 47 parents received this"). Hard de-duplication key per event so one notice can never fire twice. Quiet hours in Asia/Dhaka (no non-urgent push 22:00–07:00) after the Uolo midnight-feed complaint. Every notification payload names the child and the section. A "Notices" tab that is authoritative even when push fails.                                                                                                                                                                                                                    | §5.1 Notifications; §5.5 Messaging                                               |
| **P4 Offline / false "no internet"**       | Never show a network error the app hasn't verified — distinguish _offline device_, _server unreachable_, and _request failed_ with different copy and different recovery. Attendance must be markable fully offline and replayed idempotently (already in PRD) — extend the same treatment to **marks entry** and **lesson logs**, the other two screens teachers use in poor-signal rooms. Show an explicit "3 items waiting to sync" chip so the teacher knows their work is not lost.                                                                                                                                                                                                   | §6 Offline; §5.2 Attendance (F-AC-05); extend to Exams/marks                     |
| **P5 Fee payment**                         | Fees live **inside** Campus and the Parents app — never a separate app, never separate credentials. Support bKash, Nagad, card and bank via SSLCommerz from day one (ClassTune's single-bank restriction is the cautionary tale). Every paid transaction produces an immediately downloadable, Bengali-capable PDF receipt with a reference number. Partial payments and per-head dues (admission / monthly / exam / late fee / fine) must be modelled as distinct heads — a reviewer named exactly this gap. Fee features must never disappear behind a plan change for a school that already paid.                                                                                       | §5.4 Payments core (F-CM-01…07); §5.5 school billing                             |
| **P6 Attendance correctness & visibility** | Parents and (later) students see their own attendance percentage and the daily record, with the marking teacher's name and timestamp. A **dispute/correction request** flow: parent flags a day → class teacher sees it in a queue → correction is written with an audit entry. Attendance edit window (already in PRD) must be surfaced in the UI as a countdown, not enforced silently. Monthly register exports to PDF **and** CSV including guardian name and phone, as the InClass reviewer requested.                                                                                                                                                                                | §5.2 Attendance (F-AC-05); §5.1 Audit; §5.5 Reports                              |
| **P7 Paywall & trust**                     | Never lock a school out of data it created. Over-limit behaviour must be **read-only, never destructive** (already PRD) — say so explicitly in the UI with the exact upgrade price in BDT, VAT-inclusive, before any trial starts. Offer a **demo school with seeded data that requires no registration** — one tap from the marketing site into a sandbox tenant. Never re-charge for an entitlement already granted; entitlements are permanent per the order line. Publish prices in the console and on the site.                                                                                                                                                                       | §5.4 Plans & subscriptions; §5.6 Platform console                                |
| **P8 "What is the school code?"**          | The join flow must be answerable _from inside the app with no prior knowledge_: a school **search by name and district** (not a code-only field), plus "My school isn't listed → register your school" and "I don't have a code → request access from your school" which notifies the admin. Join codes are rotating and admin-approved (already PRD) — add a shareable deep link and a printable QR poster the school hangs at the gate. Never show a bare code field as the first screen.                                                                                                                                                                                                | §5.1 Invitations & onboarding (F-ID-03/04)                                       |
| **P9 Support black hole**                  | In-app **Help** on every screen that opens a ticket pre-filled with school, role, screen, app version and correlation id. A visible SLA ("we reply within 1 working day") and a ticket status the user can see. Platform console gets a support queue with ageing. `[INFERENCE]` For 10 launch schools, a named human per school plus a WhatsApp/phone channel will move the rating needle more than any feature.                                                                                                                                                                                                                                                                          | §5.6 Platform console support tools; §5.1 Audit/correlation ids                  |
| **P10 Uploads & attachments**              | Client-side image compression with a **quality floor** so a photographed worksheet stays readable (the recurring complaint is over-compression, not size). Multi-file attach in one action. Visible upload progress and a durable retry queue — never a silent failure. Resumable uploads for poor connections. Signed-URL downloads must open in-app for PDF/image without a round trip to a browser.                                                                                                                                                                                                                                                                                     | §5.3 Resources (F-TE-06); §5.5 Messaging attachments; §5.2 Assignments           |
| **P11 Data loss**                          | Every destructive or replacing write is versioned and reversible within the audit trail. Assignment/marks submissions get an explicit confirmed state with a server-issued receipt id shown to the user; "submitted" must mean the server acknowledged. Schema migrations must never remove a user-visible record — add a migration checklist item and a post-deploy smoke test that counts rows in each tenant's core tables. Schools can export **all** their data (CSV + PDF) unaided, at any time.                                                                                                                                                                                     | §6 Quality/Observability; §5.1 Audit; §5.4 school data export                    |
| **P12 Multi-child parents**                | The Parents app is child-switcher-first: a persistent child chip in the header, a **combined inbox** across children, and every notification titled with the child's name. One phone number ↔ many students, including across sections and years. Test with a seeded two-and-three-child guardian.                                                                                                                                                                                                                                                                                                                                                                                         | §5.2 Parent portal (F-AC-11); §5.1 Notifications                                 |
| **P13 Forced updates / weight**            | PWA-first means most changes ship without a store update — make this an explicit marketing claim. When the native wrapper must update, it is optional unless a breaking API version demands it, and the prompt states what changed. Keep the Android wrapper small and never bundle what the PWA can fetch.                                                                                                                                                                                                                                                                                                                                                                                | §4 R4 Native; §6 Performance                                                     |
| **P14 Report cards**                       | Report card generation must be verifiable: a preview diff against the marks grid before publish, publish-to-parents as an explicit gated action with an audit entry, and **full history** — every past term's report card stays retrievable forever. A teacher remarks field per subject and an overall comment (with AI draft + teacher approval, already PRD). Bengali font embedding verified by a rendering test in CI, not by eyeballing.                                                                                                                                                                                                                                             | §5.5 Reports/PDF; §5.2 Exams (F-AC-07)                                           |
| **P15 Permissions & privacy**              | Request the _minimum_ Android permissions and explain each in Bengali and English at the moment of use (camera only when scanning a QR; storage only when attaching). No contacts, no location, no call permissions — ever. A plain-language privacy page inside the app stating what is collected about children and what is not. Play Data Safety declaration must match reality.                                                                                                                                                                                                                                                                                                        | §6 Privacy; §4 R4 Android (Capacitor)                                            |

### 7.1 Three strategic conclusions

1. **The Bangladeshi school-OS market has no incumbent with a defensible reputation — qualified (amended per SYNTHESIS).** `[EVIDENCE]` The category leader by review volume, ClassTune, sits at **3.18★ across 2,743 ratings and has not shipped an update since 14 June 2024**. Every other BD competitor has under 120 ratings. **A 3.18★ rating is not the same thing as a weak incumbent.** ClassTune still holds the school's data, its attendance/results history, and — per the review corpus itself — a field person who answers on a Friday when something breaks (§4.11). The real moat a challenger has to overcome is not the star rating; it is the **switching cost of re-entering every student, teacher and guardian record** a school has already put into the incumbent, plus the risk of a mid-year cutover during an exam cycle. `[INFERENCE]` Acadigma's realistic competitive advantage in year one is not features — it is _an app that opens, logs you in once, and loads fast_ — but that advantage only converts a sale if the switching-cost story (data migration done for the school, on day one, by Acadigma) is addressed explicitly in the sales motion, not assumed away by a low competitor star rating.

2. **Reliability beats breadth, and the reviews say so in the schools' own words.** Attendance, results and timetable — the things the PRD spends most of its scope on — generate almost no complaints, because users never get past login and loading. Building forty features on a shaky session and notification layer reproduces ClassTune. `[INFERENCE]` R0's auth, session and notification-delivery work deserves more engineering time than the release map currently implies, and its exit criteria should include hard numbers (zero forced re-logins in a 30-day soak; ≥99% notification delivery measured, not assumed).

3. **The buyer and the user complain about different things, and Acadigma must serve both.** School owners (Amar School, School360, tuFee reviews) praise ROI, customisation willingness, dues recovery, payroll visibility and _the existence of a mobile app_. Parents and teachers complain about login, speed and notifications. `[INFERENCE]` Sales collateral should lead with dues recovery and time saved; the product must be judged on session reliability and load time. A "money recovered / hours saved this term" panel in the owner dashboard would speak directly to the buyer's language found in these reviews — and it is cheap, since the data already exists in the fee and attendance tables.

### 7.2 Suggested additions to the PRD's success metrics (§3)

Derived from the pain ranking; all measurable:

- **Zero forced re-authentications** for an active user over a 30-day period (e2e soak test + real-user telemetry).
- **Notification delivery ≥ 99%**, measured by the delivery ledger, with p95 queue-to-device under 60 seconds.
- **Cold start to first meaningful paint < 2.5 s** on a 2 GB-RAM Android device over 3G-fast — already implied by the LCP target but should be stated for the _native wrapper_ too.
- **Self-serve credential recovery rate ≥ 90%** — nine in ten locked-out users resolve it without contacting the school office.
- **Zero "unknown error" strings** shipped — every error state names a cause and offers an action (auditable as a lint rule over i18n keys).

---

## 8. Sources

All Google Play data accessed **2026-09-17** via the Play Store's public listing pages and its public reviews endpoint. No authentication was used for any source.

### Google Play listings (Bangladeshi publishers)

| App                                          | URL                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| ClassTune                                    | https://play.google.com/store/apps/details?id=com.classtune.app                   |
| Classpay                                     | https://play.google.com/store/apps/details?id=com.classtune.classpayapp           |
| Noubahini College Dhaka (Onnorokom Software) | https://play.google.com/store/apps/details?id=ac.osl.ncd                          |
| Amar School                                  | https://play.google.com/store/apps/details?id=com.amarschool.app                  |
| EduTune                                      | https://play.google.com/store/apps/details?id=com.aitl.edutune                    |
| School360                                    | https://play.google.com/store/apps/details?id=com.myapp.school360.com.bd          |
| Teachers BD                                  | https://play.google.com/store/apps/details?id=com.techsoft24.teachers_bd          |
| Edufy                                        | https://play.google.com/store/apps/details?id=com.softifybd.edufy                 |
| School Management Software                   | https://play.google.com/store/apps/details?id=com.schoolmanagement.software       |
| Eduman – Staff                               | https://play.google.com/store/apps/details?id=com.ixs.staff                       |
| Eduman – Admin                               | https://play.google.com/store/apps/details?id=com.ixs.admin                       |
| 10 Minute School                             | https://play.google.com/store/apps/details?id=com.a10minuteschool.tenminuteschool |
| Shikho                                       | https://play.google.com/store/apps/details?id=tech.shikho.android                 |
| Priyo Shikkhaloy                             | https://play.google.com/store/apps/details?id=com.priyoshikkhaloy.android         |
| Shikkha Sohay                                | https://play.google.com/store/apps/details?id=com.shikkhasohayapp                 |
| Bangla School                                | https://play.google.com/store/apps/details?id=com.bishwajtdas.banglaschool        |
| Out of School Children in BD (RiseUp Labs)   | https://play.google.com/store/apps/details?id=com.riseuplabs.oscbd                |
| Sk Mobile School                             | https://play.google.com/store/apps/details?id=com.devxhub.skmobileschool          |

### Google Play listings (South Asian and global comparables)

| App                                      | URL                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| ClassDojo                                | https://play.google.com/store/apps/details?id=com.classdojo.android               |
| Teachmint                                | https://play.google.com/store/apps/details?id=com.teachmint.teachmint             |
| MCB Parent App (MyClassboard)            | https://play.google.com/store/apps/details?id=com.mcb.myclassboard.activity       |
| SMART MCB (teacher)                      | https://play.google.com/store/apps/details?id=com.mcb.teacherapp                  |
| Uolo Learn                               | https://play.google.com/store/apps/details?id=com.uolo.notes                      |
| Uolo Teach                               | https://play.google.com/store/apps/details?id=com.uolo.teach                      |
| Seesaw                                   | https://play.google.com/store/apps/details?id=seesaw.shadowpuppet.co.classroom    |
| NeverSkip Teacher App                    | https://play.google.com/store/apps/details?id=com.nskteacher                      |
| NeverSkip Admin                          | https://play.google.com/store/apps/details?id=com.nskadmin                        |
| Smart School (CodeLogic)                 | https://play.google.com/store/apps/details?id=com.codelogictechnologies.schoolapp |
| Fedena Connect                           | https://play.google.com/store/apps/details?id=com.fedena.fconnect                 |
| InClass – Student Attendance             | https://play.google.com/store/apps/details?id=com.rtsschool.app                   |
| School Plus                              | https://play.google.com/store/apps/details?id=com.m2hinfotech.eschool             |
| tuFee / Coaching Management              | https://play.google.com/store/apps/details?id=com.syst.tuitionapp2                |
| SchoolOS                                 | https://play.google.com/store/apps/details?id=com.schoolos                        |
| School M                                 | https://play.google.com/store/apps/details?id=com.alfasun.schoolm                 |
| Smart School Management                  | https://play.google.com/store/apps/details?id=com.smartschools.app                |
| School Management System (Rayvila)       | https://play.google.com/store/apps/details?id=com.rayvila.sms                     |
| School Management App                    | https://play.google.com/store/apps/details?id=com.school.myschool                 |
| ATTENDANCE SCHOOL                        | https://play.google.com/store/apps/details?id=com.gjinfotech.school               |
| Campus Care (Entab white-label instance) | https://play.google.com/store/apps/details?id=com.carmel.campuscare               |

### Other sources consulted

| Source                                                            | URL                                  | Outcome                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ClassTune official Facebook page (11K followers)                  | https://www.facebook.com/classtune/  | Accessed 2026-09-17. Marketing posts and engagement bait only; no substantive user complaints in public comments.                                                           |
| ClassTune product site                                            | https://classtune.com/               | Vendor marketing; used only to confirm product identity.                                                                                                                    |
| Bangladesh English Medium School Parents Forum (public FB page)   | https://www.facebook.com/bemspforum/ | Identified via search 2026-09-17; not mined (content requires login for depth; no login used).                                                                              |
| Web search for BD school-software teacher/parent forum discussion | —                                    | Returned vendor marketing pages (mysoftheaven, pathshalasoft, bidyaan, nextzen, schoolsoftware-bd), not user discussion. Recorded as an absence-of-evidence finding (§1.3). |

### Reproducibility

The raw harvest and the derived theme files are retained in this session's scratchpad:
`reviews.json`, `reviews_bd2.json`, `ALL.json`, `th2/<theme>.txt`, `th2/_app_<package>.txt`.
The harvester (`play.js`) and analyser (`analyze2.js`) are re-runnable and will reproduce every count in §3 and every quote in §4.

---

_Prepared by research fetcher #3 for Acadigma Campus, 2026-09-17. Inferences are marked. Frequency figures are keyword-match estimates over a 26,193-review corpus and are indicative, not exact._
