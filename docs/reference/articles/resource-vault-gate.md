# The Free AI Resource Vault — the landing page behind URLs 5 and 6

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URLs**      | Two distinct `mcp_token` query strings, both on `https://charliehills.substack.com/p/resource`:<br>• `…?mcp_token=eyJwaWQiOjM5Njk4NDUsInNpZCI6MjA5MDE0Njg5NCwiYXgiOiI2NTdlNTc1MjU3YTQwNzI0NmVmYTdkOWNmNDY4YzFlOCIsInRzIjoxNzg5NjE5ODYzLCJleHAiOjE3OTIwMzkwNjN9.L07e7t36rOMkBeqO_92MKnkdNOWsWVTCJkjXEDe2xQg`<br>• `…?mcp_token=eyJwaWQiOjM5Njk4NDUsInNpZCI6MjA5MDE0Njg5NCwiYXgiOiJkMDUzOGU4ZjdkMjU1YTVlMjQ2MDQ2MjRjY2YxZTE2NiIsInRzIjoxNzg5NjE5ODc3LCJleHAiOjE3OTIwMzkwNzd9.s_R9ysEbwEhTIgkxwUb14hGb3WWM10PSpEkMua3afBs` |
| **Author**    | Charlie Hills — _MarTech AI_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Published** | 31 May 2026                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Accessed**  | 2026-09-17, via Chrome (`get_page_text`), both URLs fetched separately.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Capture**   | **Full page, but there is no article.** Both tokens resolve to byte-identical content: a subscription gate. It contains no prompts, no skills and no design material — only instructions for finding the vault link in a welcome email.                                                                                                                                                                                                                                                                                 |

## Why there is nothing to implement here

Both URLs are the same Substack post. The two `mcp_token` values differ only in
their `ax` claim and a 14-second difference in `ts`; they are per-request
tracking tokens, not per-resource keys. Neither unlocks anything: the page
itself says the vault link is delivered by email after subscribing, and it is
not printed on the page for anyone, subscribed or not.

**We did not subscribe.** Subscribing would mean entering the owner's email
address into a third-party marketing list, which is a decision for the owner and
not something an agent should do on their behalf. If the owner wants the vault
contents, the path is: subscribe at `charliehills.substack.com/subscribe` from
an address they choose, then paste the vault link into a follow-up task.

Treat the tokens as expiring credentials. `exp` decodes to **2026-10-14**, after
which both URLs will return the same gate anyway.

---

## Raw extracted text (identical for both URLs)

**The Free AI Resource Vault (100+ prompts, skills, workflows & guides)**
_Everything I've ever made, free. Subscribe and it unlocks below._
CHARLIE HILLS · MAY 31, 2026

Hi, I'm Charlie Hills 👋

I help creators and marketers get more done with AI.

You're probably here because you want a resource. It lives in the vault, along with everything else I've made. Every week I share the actual prompts, skills and workflows I use, and it's all free.

New here? Subscribe below and the whole thing opens up. 100+ prompts, Claude skills, guides, cheat sheets and tool stacks. I add to it most days.

### The link comes by email, not on this page

This is the bit that trips people up. When you subscribe, a welcome email lands within a few minutes, and the vault link is inside it.

Search your inbox for this exact subject line: `Welcome - here's your free Resource Vault`

Check promotions and spam while you're in there. It hides in one of those more often than it should.

### Already subscribed?

Two different things happen depending on when you joined.

**If you subscribed after 2 June 2026** — your welcome email has the link. Search that subject line above and you'll find it.

**If you subscribed before 2 June 2026** — your welcome email won't have it. That one's on me. The link wasn't in the flow back then, so you can search all day and turn up nothing, and plenty of you have. Search for this instead. I sent it to everyone on 2 June: `Save this link. All my free stuff is here.` That one has the vault link in it.

**Still nothing?** Reply to any email I've sent you, or leave a comment below, and I'll send it straight over. You won't be the first and it's no bother.

### Once you're in

Bookmark it. I add things most days and you'll want to come back rather than hunt for this page again.

Two small things that keep these emails landing in your inbox instead of your promotions tab: reply to one of them (even a one-word hello works); drag it to your primary inbox if it landed somewhere else.

Subscribe free and it's all yours 👉 https://charliehills.substack.com/subscribe

Stay curious, stay human and keep creating.

– Charlie
