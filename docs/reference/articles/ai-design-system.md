# Design in Claude Code (without the AI look) — "How to quit AI slop"

|               |                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**       | <https://charliehills.substack.com/p/ai-design-system>                                                                                                                             |
| **Author**    | Charlie Hills — _MarTech AI_                                                                                                                                                       |
| **Published** | 30 August 2026                                                                                                                                                                     |
| **Accessed**  | 2026-09-17, via Chrome (`get_page_text`).                                                                                                                                          |
| **Capture**   | **Full.** Body text complete, including all four prompts verbatim. Images are represented by caption text. Subscribe boilerplate, product waitlist links and event promos trimmed. |

> **Audience caveat.** This is written for a solo marketer making LinkedIn
> graphics and slide decks, not for a product team with a written design system.
> Read it as a description of the _shape_ of a good AI design harness
> (reference → rulebook → read-before-you-draw → self-check), because the shape
> transfers even though the workflow does not. See
> `docs/architecture/DESIGN-SYSTEM-ADDENDUM.md`.

---

## Raw extracted text

**How to quit AI slop**
_A human writes the rules once. AI runs them forever._
CHARLIE HILLS · AUG 30, 2026

This week I gave a talk to 120 people at NatWest. I built the 29 slides for it in one sitting. A month ago that same deck would have taken me two days of arguing with Claude about fonts and spacing. I have a design background (which made it worse) and I've tried everything on this.

Nothing worked until I stopped describing the deck I wanted and pointed at one I already had.

In this issue: what the AI gives you when it has nothing of yours to read · how to connect Figma to Claude, step by step · the four files that make everything come out on brand.

### First, what I (actually) tried

It was Thursday and I needed a deck in under 24 hours. I already had one created by Claude Code. It was pretty good, but I needed something bespoke for tomorrow. I was tired of fighting Claude. So I gave the same brief to the tools everyone recommends. Here is Gamma. Here is Claude Design. Here is Canva, through its own MCP connector.

Canva built the cover slide. Thin, empty, one stat line.

All of them are competent. None of them were perfect.

Here is the same slide out of my own system. Same brief, same brand file. Face rail, slide number, the numbers that matter, a real footer.

**You cannot fix that by prompting harder. They had nothing of yours to read, so they had nothing to point at.**

I'm not bashing Gamma, Claude Design or Canva here. I'm just simply saying I found a better solution.

### What (actually) worked

Last year I worked with Shahmeer on a presentation. He built the first draft properly, the way a designer does, and it sat in my Figma for months. I had never once thought of it as a system. I just liked the deck.

**You almost certainly have a file like that (everyone does). You've just never called it the reference.**

The Figma MCP is what turned it into one. Claude reads a real Figma file directly now, so instead of describing my brand I pointed at that presentation and dropped in the ideas I wanted to make.

### Setting up Figma (properly)

1. **Make a Figma account.** Go to figma.com, sign up, and take the free plan.
2. **Get the file you like into it. This is your reference.** It is the deck, or the brand board, or the one thing somebody made you that actually looked right. If a designer built it, message them and ask for the Figma link. They will still have it.
3. **Connect Figma to Claude.** In the Claude desktop app, click the + button in the bottom left of the chat box. Hover over Connectors, then click Manage connectors. Hit the + next to Connectors, find Figma in the list, and click it. A browser window opens, you log into Figma, and you approve the access.
4. **Copy the link to the exact thing you want.** This is the step everyone misses, and I missed it too. Do not grab the web address out of the top of the browser. Open the file in Figma, right click the frame or the slide it needs to read, and choose Copy link. That link points at that one thing instead of the entire file. **And that is the difference between Claude reading your design and Claude reading a filing cabinet.**
5. **Send it, with the thing you are stuck on.** Paste the link first, then attach whatever you are currently fighting with, then say what is wrong with it and what you want instead.

That was it. Claude read the real file, took the styling out of it, and rebuilt the deck in it. It matched my brand style exactly, because it was built on top of something that already did.

### Why my infographics run somewhere else

I run my LinkedIn graphics on a similar system I've spent months building. I tested the Figma MCP for infographics (it's pretty good), but it struggled with the complexity that my infographics require.

> _[Image caption]_ The generator itself. Outputs, references, scripts, brand, templates, and the checks that sit on top of them.

It is that good for one reason. I worked with Nick Broekema, and Nick wrote me a proper brand guideline. He gave me the hex codes, the type scale, the spacing, everything. I have built everything since on that one document.

**Start with the reference. It is the thing everything else stands on.**

### Step 1. Pull your rules out of the work you already have

If you can pay someone to design, pay them once, not per graphic. And if you can't, pull it out yourself.

Go and collect five pieces of design you already like. Your best graphics, your banner, your website, a deck you reuse, anything of yours that felt right. Screenshots are fine. Put them in a folder (that's what the prompt below reads).

Paste this:

> I am giving you five pieces of design I already like.
>
> Write me one file called REFERENCE.md that any AI can read before it makes anything for me. It must cover:
>
> 1. Every colour as a hex code, and what each one is for
> 2. The fonts, the sizes, and the spacing between things
> 3. Where my logo goes and how much clear space it needs
> 4. Five things my brand must never do
> 5. One example, described in full, of it done right
>
> Ask me about anything you cannot work out from the files.
>
> Show me the file before you save it.

Run this once and you keep the file forever. Every hex in mine was sampled off five finished pieces with a pixel reader, not guessed.

So the next test was a brand that is not mine. Tarana Kasana is a really good LinkedIn creator. She did not ask me to do this, I just wanted to see whether the system held up on a brand that was not mine, so I built hers off her public LinkedIn banner and nothing else. Perfectly on brand, and not one value was a guess. **Your banner is probably already your reference (you have just never read it as one).**

Same day, same system, completely different brand. Jim Cranston did not ask me either, and his came out in his own sage green with nothing of mine anywhere in it.

That is how both came out so fast. Not a clever prompt (it never is). **A library of work to point at, there's sixty-six builds in my system now, so it clones the closest one instead of starting again.**

### Step 2. Make Claude read it before it draws

**A reference nobody opens is a mood board with extra steps.**

Paste this:

> Add this to CLAUDE.md, and create the file if it does not exist:
>
> Before designing, generating or laying out anything, read REFERENCE.md in full.
>
> Every colour, size and spacing value comes from that file.
>
> If something I ask for is not covered there, ask me rather than choosing for yourself.
>
> When you have finished, check your own output against REFERENCE.md, fix what fails, and only then show me.

**That last line does more than the other three combined (by a distance). Claude checks its own work against the file before anything reaches you.**

### Step 3. Turn the file into a design system

The reference tells Claude what's allowed. A design system tells it how to build (very different jobs).

Paste this:

> Read REFERENCE.md and every file in /examples.
>
> Write me DESIGN.md in the project root. It is the build rulebook, not a mood board. Cover:
>
> 1. The colour tokens, named by JOB (background, ink, accent, muted), each with its hex
> 2. The type scale, in real sizes, and which face goes where
> 3. The spacing scale, as a small set of values I reuse everywhere
> 4. The components I actually use, with what each one is for
> 5. A decision log at the bottom, where every choice we make from now on gets recorded
>
> Work from what is IN the reference and the examples. Where they disagree, ask me.
>
> Show me the file before you save it.

Then give it somewhere to live, because a rulebook nobody can find is a rulebook nobody reads:

```
your-project/
  CLAUDE.md      the four lines that make it read everything below
  REFERENCE.md   the five rules
  DESIGN.md      the build system
  examples/      five things you were happy with
```

That folder is the whole thing. Four files, one of them four lines long. On disk it is this small. CLAUDE.md at 360 bytes, REFERENCE.md and DESIGN.md at 12KB each, and a folder of examples.

**Screenshots in a folder are inspiration. A file it reads first is a system.**

And never accept the first version. **Ask for three or four variants and put them side by side, or you'll end up polishing whatever came out first** (I did this for months).

### The 29 tells of AI design

I can only spot these because I have been at this a while. You probably can't yet, and every one of them came out of a graphic I rejected. I've built a free skill off the back of six months designing in Claude Code. It checks your graphic against all 29 before you post it.

_(The list of 29 is not in the article; it is gated behind a newsletter subscription and a skill download. Not captured.)_

I've written before that graphic design was dead. That's half right. AI has replaced the designer who makes the individual post. It has not replaced the person who decides what good looks like. That judgement was never in the file, and it never gets automated.

It came from two people. Shahmeer made the deck. Nick made the guideline. I have not paid either of them a second time, and both of them are still in everything I ship.

**A machine can hold your rules perfectly. It cannot tell you they were the right ones.**

— Charlie
