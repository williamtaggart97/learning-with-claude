# Learning mode — a Claude add-on

**Thesis:** Claude still answers, but every exchange also builds the user's understanding and adds to a profile of what they know, how they learn, and what they care about.

**Target user:** a grad student in data science and statistics under deadline pressure who genuinely wants to understand the material. This carries over directly to a working professional in a new field.

## How a message is handled

1. **Router (Haiku 4.5, structured output):** classifies the message.
   - **Concept question:** Claude asks 1–3 framing questions first. Most are short answer, some are multiple choice or multi-select, and "I don't know" is always an option. They lay out the steps toward the answer without revealing it or asking the user to guess.
   - **Lookup:** the answer comes right away. Claude also flags the hidden decisions behind the question (e.g., which t-test) as **Learn It Later** callouts.
2. **Answerer (Sonnet 5, streamed):** built on the user's framing responses (confirming what they got right, correcting the rest) and on their learning style. Rendered as markdown with KaTeX math and highlighted code.
3. **Assessor (Haiku 4.5, runs in the background):** returns JSON describing:
   - concepts touched, with a mastery change and the evidence for it
   - learning-style signals
   - the user's context (field, projects, the kinds of data they use)
   - new Learn It Later items

Model IDs live in config so the answerer can be switched (e.g., to Opus for a demo recording).

## Learner profile

- **Learning style has three dimensions:**
  - intuition first ↔ formal first
  - code / concept / worked-example first
  - brief ↔ thorough

  They're inferred from behavior, never asked through a quiz. The user can correct them once the profile unlocks.
- **Unlock ladder** (thresholds live in config):
  - **Tier 0:** Learn It Later queue plus a progress meter ("Claude is getting to know how you learn — 3/5")
  - **Tier 1 (5 framing exchanges):** read-only profile with a "here's how I think you learn" reveal
  - **Tier 2 (15 exchanges or 8 concepts):** the profile becomes editable and "suggested next topics" appear

  The meter counts framing exchanges, not raw messages, so it rewards engaging rather than spamming.
- **Learn It Later:** a card preview plus a "dig in" button that opens a new chat. The new chat applies the concept back to the original problem, then to other problems relevant to what we know about the user. The queue keeps the user on task in the moment and doubles as a record of what they're interested in.

## Stack and infrastructure

- **Framework and data:** Next.js (App Router) + React, Prisma + Postgres. Local development uses Postgres; the hosted app uses Neon on Vercel.
- **Database schema:** `User` (with `demoSessionId`), `Conversation`, `Message`, `FramingExchange`, `Concept`, `ConceptMastery`, `LearningStyle`, `UserContext`, `LearnLaterItem`, plus a table for rate limits.
- **Access:** no auth. A shared passcode in middleware gates the app, and a per-user rate limit protects the API key.
- **Demo personas:** each browser session gets its own copies, keyed by a cookie, and there's a "Reset this persona" button. Personas can be switched freely once past the passcode.
  - **Maya** (super user): MPH epidemiology, readmissions thesis. Tier 2, ~12 concepts, fully inferred learning style, 5 Learn It Later items, 4–5 past conversations.
  - **Dev** (almost unlocked): MS data science, churn-modeling capstone. 4/5 framing exchanges, so one more triggers the Tier 1 unlock live. ~2 past conversations.
  - **Sam** (brand new): no history; the empty state with starter prompts.
- **Visual style:** Claude-like (cream background, serif display text, coral accent) with no Anthropic logos. The learning features (framing cards, Learn It Later chips, profile panel) get their own visual language on top.

## Deliverables

- GitHub repo: https://github.com/williamtaggart97/learning-with-claude
- Hosted app on Vercel, gated by passcode
