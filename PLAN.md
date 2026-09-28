# Decision log

Every decision settled during design, grouped by area. For the narrative overview, see [DESIGN.md](DESIGN.md).

## Deliverable

| # | Decision | Detail |
|---|----------|--------|
| D1 | Output is a working prototype | A clickable Next.js/React web app, submitted for the "Learning through collaboration with Claude" prompt. |
| D2 | Real Claude API, no scripted paths | Live calls through Next.js route handlers; API key in `.env.local`. The empty state offers suggested starter prompts. |
| D3 | Delivered as GitHub repo + hosted link | https://github.com/williamtaggart97/learning-with-claude, plus a Vercel deployment. |
| D4 | Working name: "Learning mode" | Reads as a Claude feature toggle rather than a separate product. |

## User and positioning

| # | Decision | Detail |
|---|----------|--------|
| U1 | Domain: data science and statistics | |
| U2 | Target user: grad student | Under deadline pressure, but genuinely interested in understanding the material. Carries over to a working professional in a new field. |
| U3 | Lives inside chat as a Claude add-on | Users come for answers; Learning mode promotes deeper thinking through nudges, questions and other interactions. |
| U4 | The task still gets done, but learning is the emphasis | The product leads with growth rather than just answers. |

## Learning interaction

| # | Decision | Detail |
|---|----------|--------|
| L1 | Core mechanism: framing questions | For concept questions Claude asks 1–3 framing questions that show the steps toward the answer. They never reveal the answer and never ask the user to predict it. Rejected alternatives: pure productive struggle (too costly under deadlines) and predict-then-reveal (users don't know the answer). |
| L2 | "I don't know" always available | On every framing question. It's treated as useful profile data, not failure. |
| L3 | Mixed question formats | Mostly short answer, some multiple choice or multi-select. |
| L4 | Claude decides when to frame | A router classifies each message as concept or lookup, and leans toward treating apparent lookups as learning opportunities. |
| L5 | Lookups always answer immediately | Then flag the important hidden decisions (e.g., "which t-test?") as Learn It Later callouts. |
| L6 | Answers are shaped by framing responses | They build on what the user said, confirming what they got right and correcting the rest. |
| L7 | Answers are shaped by learning style | Presentation adapts to the inferred style (see P2). |

## Learn It Later

| # | Decision | Detail |
|---|----------|--------|
| Q1 | Deferral keeps the user on task | Concepts the user skips or that Claude flags go to a queue instead of interrupting the task. |
| Q2 | The queue doubles as interest data | It's used as insight into who the user is and what content to surface. |
| Q3 | Card preview + "dig in" | The card briefly explains the concept and how it applied where it came up. "Dig in" opens a new chat. |
| Q4 | Focus on applying the concept in new ways | The dig-in chat connects the concept back to the original problem, then to other problems relevant to the user's context. |

## Learner profile

| # | Decision | Detail |
|---|----------|--------|
| P1 | Concept-level mastery with evidence | Each concept has a mastery score and the evidence behind it, so the UI can show "why Claude thinks this." |
| P2 | Three learning-style dimensions | Intuition first ↔ formal first; code / concept / worked-example first; brief ↔ thorough. |
| P3 | Style is inferred, not quizzed | No onboarding quiz; inferred from behavior and correctable once the profile unlocks. |
| P4 | User context is inferred | Field, projects and data types are extracted from conversations and become editable at Tier 2. |
| P5 | Profile shapes future framing | Fewer questions on solid concepts, deeper ones on shaky concepts. |
| P6 | Soft unlock ladder | Tier 0: Learn It Later queue plus progress meter. Tier 1 (5 framing exchanges): read-only profile with a "here's how I think you learn" reveal. Tier 2 (15 exchanges or 8 concepts): editable profile plus suggested next topics. |
| P7 | Progress counts framing exchanges only | Rewards engaging, not message spam. Thresholds live in config. |

## Architecture

| # | Decision | Detail |
|---|----------|--------|
| A1 | Router + framing in one call | Haiku 4.5 with structured output, to keep latency low before the user sees anything. |
| A2 | Answerer | Sonnet 5, streamed. |
| A3 | Assessor | A separate background Haiku 4.5 call with a strict JSON schema. It returns concepts touched (mastery change plus evidence), learning-style signals, user context and new Learn It Later items. |
| A4 | Model IDs in config | So the answerer can be switched to Opus for a demo recording. |
| A5 | Rendering | Markdown + KaTeX + syntax-highlighted code. No in-browser code execution. |
| A6 | Database: Postgres + Prisma | Local Postgres for development, Neon for production. |
| A7 | Schema | `User` (with `demoSessionId`), `Conversation`, `Message`, `FramingExchange`, `Concept`, `ConceptMastery`, `LearningStyle`, `UserContext`, `LearnLaterItem`, plus a rate-limit table. |
| A8 | Hosting | Vercel + Neon. The user provisions the accounts; Claude wires up the config. |

## Access and demo

| # | Decision | Detail |
|---|----------|--------|
| X1 | No auth | |
| X2 | Shared passcode | Checked in middleware on the hosted app. |
| X3 | Per-user rate limit | Stored in Postgres, to protect the API key. |
| X4 | Three seeded personas, freely switchable | **Maya** (super user, Tier 2): MPH epidemiology, readmissions thesis, ~12 concepts, 5 Learn It Later items, 4–5 past conversations. **Dev** (almost unlocked): MS data science, churn capstone, 4/5 framing exchanges, ~2 past conversations. **Sam** (brand new): empty state. |
| X5 | Isolated per browser session | Personas are cloned per session via a cookie, so each reviewer starts clean. |
| X6 | "Reset this persona" button | Re-seeds the current persona. |
| X7 | Unlock celebration | A clear reveal when Dev crosses the Tier 1 threshold. |
| X8 | Claude-sidebar-style chat history | |

## Visual design

| # | Decision | Detail |
|---|----------|--------|
| V1 | Evokes the Claude look | Cream background, serif display text, coral accent, centered chat column. No Anthropic logo or wordmark. |
| V2 | Distinct visual language for learning features | Framing cards, Learn It Later chips and the profile panel stand out so reviewers see what's new. |

## Setup

| # | Decision | Detail |
|---|----------|--------|
| S1 | Repo lives outside OneDrive | `C:\Users\willi\dev\learning-with-claude`, to avoid OneDrive/`node_modules` sync problems. |
