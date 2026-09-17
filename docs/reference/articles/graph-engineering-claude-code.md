# Graph engineering in Claude Code: the 4-prompt folder map

|               |                                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**       | <https://charliehills.substack.com/p/graph-engineering-claude-code>                                                                                                                                      |
| **Author**    | Charlie Hills — _MarTech AI_                                                                                                                                                                             |
| **Published** | 13 September 2026                                                                                                                                                                                        |
| **Accessed**  | 2026-09-17, via Chrome (`get_page_text`). WebFetch returned a model-written summary rather than the source text, so the browser capture is the record.                                                   |
| **Capture**   | **Full.** Body text complete. Images and their captions are represented by caption text only. Subscribe/CTA boilerplate and the event promos at the foot are trimmed; nothing instructional was removed. |

---

## Raw extracted text

**Graph engineering (for normal people)**
_My AI couldn't find 78% of my work. Four prompts fixed it._
CHARLIE HILLS · SEP 13, 2026

Harness, loop, context, graph engineering. It's tiring, right?

Every month there's a new AI system you MUST implement. Every month there is a new one to learn, and the folder is still sitting there untouched.

I do this full-time and I still struggle to keep up. But all of them matter (to certain degrees):

- **Context.** What it can actually see in the window right now. You decide what goes in.
- **Harness.** What you bolt on. The standing rules, the gates and the files it reads before it starts work.
- **Loop.** How you get the AI to QA itself. It goes again until it passes, without you watching.
- **Graph.** Where your stuff is and what connects to what. People started calling this graph engineering this summer (the name is new, the problem isn't). That is the one this edition is about.

> _[Image caption]_ Graph, harness, context and loop drawn as one run: the graph feeds the harness, the harness loads the context window, the run hits a gate and loops back on a fail.

I ignored graphs for months. It was the thing standing between me and the only job I actually wanted done: getting other people into my system without me in the middle of it.

So that is the job I finally did, and it worked.

I've got everyone on my team onto Claude Code now, and some had never used it. I didn't do a training day or a call where I explained how it works. Your team doesn't have to be technical. You just have to give them the system.

The memory, the skills and the workflows now get updated by all of us, so a fix one person makes is in everybody's folder the next morning.

But none of this matters if your local setup's messy and you're pushing the wrong stuff to GitHub. Mine was, and I couldn't see it, because from the inside everything looked fine. My folders were readable by me and nobody else.

I spend hours on a newsletter, tell Claude to update the voice file from it, and the next time I ask for a first draft it sounds completely different. I had dumped everything in. Nothing pointed at anything, so it had no idea which part was the bit that worked.

So I ran the check on my own folders this week (four months later than I should have). Claude found 2,364 documents, 1,840 with nothing pointing at them.

That's 78% my own AI would never reach on its own, and it's the same 78% a new person would never find either. A folder your AI never opened reads exactly like a folder with nothing in it (which is the trap).

### Claude Code folder structure (this comes first)

My content system is laid out one folder per platform. That's architecture. LinkedIn, Instagram, the newsletter, YouTube. Four folders sitting on my Desktop, and whatever I'm making that day, I make it inside the folder that owns it.

A reel and an infographic have almost nothing in common, so they don't share a folder. Each one carries its own instructions file, its own brand rules, its own way of working. I open Claude in the folder and it already knows which job it's on, before I've typed a word.

Don't copy my four folders. Split it the way your business is already split. Mine is per platform because content is the job I do every day, so that is where the work actually divides. If you run go-to-market, yours is probably marketing, sales, operations. A one-person shop might be clients, offers, admin. Mirror your org chart, not mine.

There is no right answer here. **The only test is whether two things ever share a file (if they never do, they should never share a folder).**

Then the knowledge files go in the folder that uses them. One of mine sits in all four. It describes the person I write for (my ICP), down to what they already know and what they would scroll straight past.

### Step 1: Draw the map

A folder is just a list of files. What your AI needs is that list plus the lines between the things on it (the lines are the point).

Pick one folder. Not your whole Desktop, and not a raw export you downloaded once and never opened again. The folder your work actually runs on: client notes, past campaigns, proposals, briefs, meeting notes, transcripts. If you can't decide, pick the messiest one you open most weeks.

Paste this into Claude Code, in that folder:

> Read every single file in [THIS FOLDER] and build me a map of it. Do not skip any.
>
> For each one, work out what it is about and which other files cover the same ground.
>
> Then write MAP.md in this folder with four parts.
>
> PART ONE: every topic you found, and the files covering it, ranked by how many other files point at it.
>
> PART TWO: how many files nothing points at, as a number and as a percentage of the folder.
>
> PART THREE: the connections I would not have spotted myself, naming which two files each one joins and why you joined them.
>
> PART FOUR: a header saying how many files you read, and today's date.
>
> Mark every connection FOUND, meaning both files state it, or GUESSED, meaning you inferred it. Never present a guess as a find. If you cannot tell, mark it GUESSED.
>
> From now on, read MAP.md before any job in this folder, and append what you learned when you finish.

It writes one file. MAP.md, sitting in the folder you just pointed it at.

Why do this? Because AI is not deterministic, it is probabilistic. It does not read your files in a fixed order, it makes a call each time about what to look at. Sometimes the call is wrong, and it tells you a minute and 2,200 tokens later.

So you can have canons, memories, skills and hooks all set up, and none of them talk to each other. Nothing is broken. There is just no linkage. **The map is the linkage.**

Think of it like a Claude Skill: a clear sequential flow, with clear instructions on what follows. The map is that times 100, across everything in the folder.

I pointed it at five folders at once and had several readers working in parallel. I created this graph so you can visualise the connections, but this isn't useful whatsoever. It just looks pretty.

Point it at one folder rather than everything you own, and go and make a coffee.

### Step 2: Read what it hands back

It comes back in three parts, and each one answers a different question.

**Part #1: what you actually have.** Every topic in the folder, ranked by how many other files point at it. That list is what my folder says I care about. Not what I would have said. My rubric sits at the top on 113 references, and 78 of those come from one file.

**Part #2: what nothing points at.** 223 of my 309 documents are named by nothing else in the folder. Not lost. Not out of date. Just unreachable, which is the same thing in practice.

**Part #3: the problems.** Every connection it found, and whether that connection is real. If two files genuinely mention each other, it marks that FOUND. If it only thinks they go together, it marks that GUESSED. About half of mine came back each way. Without that one word you cannot tell a fact from a hunch, and you end up trusting the hunch.

> _[Image caption]_ Three things to look for in yours: two files giving opposite advice, one file sitting in two folders, and work nothing points at.

### Step 3: Fix what it found

So there is a third prompt, and it is the one that changes anything.

> Read MAP.md. Take everything in PART THREE.
>
> For each one: what breaks if I leave it, and the smallest change that fixes it.
>
> Then do the ones I approve. Ask before you touch anything you are not sure about.

It priced every one, did the seven that carried no risk, and stopped on the one that touched something already published.

That is the loop. The map finds it, this prompt prices it, and you approve the ones worth doing.

### Step 4: Make it stick

On its own the map is a report you read once. It becomes the fix the moment something reads it before every job. So don't paste that in yourself. Get it to do it, which is the fourth prompt:

> Add this line to the top of the CLAUDE.md in each of my folders:
>
> READ MAP.md IN THIS FOLDER BEFORE ANY JOB HERE, AND APPEND WHAT YOU LEARNED WHEN YOU FINISH.
>
> If a folder hasn't got a CLAUDE.md, make one with that line in it.

That's it. Four prompts, and the 1,840 files my AI couldn't reach are reachable now, through one file. I never added a pointer by hand.

### Set up your team OS (Claude Code for a non-technical team)

Your team OS is one folder system that everybody pulls from. You keep building in it, and they keep getting the new version.

Which is why the map came first. **Push a messy folder and the whole team pulls your mess (and trusts it, because it came from you).**

A repo is a folder that lives on GitHub instead of only on your laptop. Connect Claude to your GitHub, then paste this:

> Push these folders to a new private GitHub repo.

Then invite the people you work with. Keep it private, so only the people you add can see it. They accept, clone it once, and from then on it's `git pull` whenever they want the latest. That's the only thing they ever have to type.

That's how you give your team the capabilities you have on your own machine. They aren't just learning your system, they're running it. And it keeps working because you carry on building. You push, they pull, and what they open on Monday is what you fixed on Friday.

### Do this tonight

Pick the messiest folder you own. The one your work actually runs on. Run prompt one and wait it out. Look at the percentage it hands back (mine was 78%, and I do this full time).

Then ask it the one question you'd normally have opened three files to answer.

And if anyone else touches your work, put the map where they can reach it. That's what turns it from a trick you do into something your business runs on.

— Charlie
