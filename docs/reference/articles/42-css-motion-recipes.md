# 42 CSS Motion Recipes You Can Paste Anywhere

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**       | <https://app.notion.com/p/42-CSS-Motion-Recipes-You-Can-Paste-Anywhere-3b7e396e06bb818d8854c2c5658453c6>                                                                                                                                                                                                                                                                                                                                                               |
| **Author**    | Charlie Hills (Notion page)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Published** | Added 9 August 2026, 5:58 PM                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Accessed**  | 2026-09-17, via Chrome (`get_page_text` + DOM toggle expansion).                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Capture**   | **Partial, and the missing part is the CSS.** All prose, both design rules, and the complete 42-recipe taxonomy are captured. The recipe bodies are Notion code blocks that lazy-load (`Loading HTML code…` / `Loading CSS code…`); expanding all 42 toggles programmatically did not materialise them, and a second extraction attempt was blocked by a content filter. The starter file and the "Four things that will trip you up" section are likewise unrendered. |

> **This is not a UI-motion article.** Despite the title, the recipes are
> motion-**graphics** recipes — assets you render to video or GIF with
> HyperFrames and post to a feed. Every one runs on a 6-second infinite loop.
> None of the nine interaction patterns our brief asked for (sheet slide, list
> stagger, skeleton shimmer, press feedback, toast, tab underline,
> pull-to-refresh, success check) appears anywhere in the 42. What we took from
> it is two rules, not code. See `packages/ui/src/motion/RECIPES.md`.

---

## Raw extracted text

**42 CSS Motion Recipes You Can Paste Anywhere**

_Category:_ AI Image & Video · _Type:_ Toolkit

_Description:_ Every animation from the Every Motion Claude Can Make board, as copy-paste CSS. 42 recipes across 7 families, a starter file that runs them, and the loop rule that stops a GIF freezing on a half-empty first frame. No JavaScript, no library, no install.

All 42 animations from the motion board, as copy-paste CSS. No JavaScript, no library, no build step, no account. Take a recipe, drop it into the starter file below, change one colour value, and it plays.

How to read this. Every recipe is a toggle. Open one and you get two blocks: the HTML that draws the shape, and the CSS that moves it. Both go into the same starter file, which is the next section. Start there and the rest of the page makes sense.

### Watch all 42 first

Each one is playing live below, with its code beside it. Scroll it, find the one you want, then come back up for the starter file.

### The starter file

Save this as `motion.html` anywhere on your machine and open it in a browser. Every recipe on this page drops into the two marked spots.

> `Loading HTML code…` — **not captured** (Notion lazy-load).

Check it worked. You should see one dark rounded box, about the size of a postcard, in the middle of a navy page. Nothing moves yet, because you have not pasted a recipe in. If the box is missing, the file did not save with a `.html` ending.

### Three ways to use one

| What you want                              | What you do                                                                                                 | Roughly    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------- |
| Just see it move                           | Paste a recipe into the starter file, save, refresh the browser.                                            | 2 minutes  |
| Put it on your own words or numbers        | Swap the text inside the HTML block, then change `--c` at the top of the starter file to your brand colour. | 10 minutes |
| Turn it into a video or a GIF you can post | Hand the finished `motion.html` to HyperFrames, which renders HTML out as real video. Free and open source. | 30 minutes |

The fastest route if you use Claude. Paste the starter file and a recipe into a chat and say: take this animation and apply it to the headline "your text here", in the colour #RRGGBB. It will rewrite both blocks for you. You do not need to understand the CSS to change it.

### The one rule that makes them loop properly

Every recipe here runs on a 6 second loop, and every timing inside it divides into 6000 milliseconds. That is not a style choice. It is what stops the loop stuttering when it wraps around. If you change the duration, change it everywhere in that recipe or the motion will jump on repeat.

> _[Image caption]_ The poster-frame loop: settled, hard cut at 28 percent, rebuild, settled.

The second half of the rule is where it starts settled. Feeds freeze a long GIF to its first frame, so if your animation opens on a reveal, the still preview everyone scrolls past is a half-empty canvas. Start finished, break at 28 percent, rebuild, and the frozen frame is a complete graphic that still animates when it plays.

**Only ambient motion should cycle forever. Blink, flicker, breathe, beat. Anything that reveals should play once and hold.**

### The 42 recipes

Each toggle has the HTML first, then the CSS. Paste both into the starter file.

**Text: Words that arrive (7)** — Reach for these when the point IS the sentence. A headline that lands, a line that types itself, a caption that lights up as it is read.
Kinetic type · Typewriter · Matrix decode · Karaoke captions · Neon glow · Gradient fill · Clone wall

**Data: Numbers that move (7)** — Reach for these when you are showing a figure. A number that counts up reads as a result. The same number sitting still reads as a slide.
Count-up · Bar race · Stock ticker · Line draw · Progress bars · Countdown · Map route

**Transitions: Cuts between two states (10)** — These get you from one thing to the next. They are the difference between a slideshow and something that feels edited.
Crossfade · Glitch · Light leak · Zoom punch · Whip pan · Radial split · Grid wipe · Warp dissolve · Flash cut · Lens warp

**Code: Terminal and editor (4)** — For when the subject is software. They make a still of code look like code being written.
Code typing · Code diff · Code morph · Code scroll

**Interface: Screens and product (7)** — Demo a thing without recording your screen. Cursor, phone, lower thirds, logo.
Cursor demo · Phone mockup · App showcase · Logo assemble · Lower thirds · Beat cut · Camcorder HUD

**Texture: Atmosphere over the top (4)** — Layers, not subjects. Put one over something else. One is a mood. Three is a mess.
Film grain · Lens flare · Aurora · Hand-drawn

**3D: Depth without a 3D engine (3)** — For when flat is not enough. Still pure CSS, no WebGL and no library.
Particles · 3D extrude · Shader dissolve

### Four things that will trip you up

> **Not captured** — the section body did not render.

### Put it inside your own Claude

Everything above is copy-paste. This section makes the library permanent, so Claude knows all 42 by name and writes the block when you ask for it. Two routes, depending on what you use.

**Route 1: any Claude, including the free plan.** Make a Project. Attach the live file from the top of this page to it. Then paste this into the Project instructions.

> `Loading Plain Text code…` — **not captured**.

Then just ask for what you want: give me Count-up on the number 12,400 in #D97557.

**Route 2: Claude Code, as a skill.**

> **Not captured** — the section did not render.
