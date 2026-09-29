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
| U1 | Domain: any field (revised) | Prompts assume nothing about the user's field and infer it from the profile and conversation. Data science/statistics (Dev) and marketing (Maya) are the seeded examples, and the concept catalog is seeded for those two. |
| U2 | Target user: anyone building skills for study or work (revised) | Students and working professionals alike. Often under time pressure, but genuinely want to understand what they're learning and apply it to real tasks. |
| U3 | Lives inside chat as a Claude add-on | Users come for answers; Learning mode promotes deeper thinking through nudges, questions and other interactions. |
| U4 | The task still gets done, but learning is the emphasis | The product leads with growth rather than just answers. |

## Learning interaction

| # | Decision | Detail |
|---|----------|--------|
| L1 | Core mechanism: framing questions | For concept questions Claude asks 1–3 framing questions that show the steps toward the answer. They never reveal the answer and never ask the user to predict it. Rejected alternatives: pure productive struggle (too costly under deadlines) and predict-then-reveal (users don't know the answer). |
| L2 | "I don't know" always available | On every framing question. It's treated as useful profile data, not failure. |
| L3 | Mixed question formats | Mostly short answer, some multiple choice or multi-select. |
| L4 | Claude decides when to frame (revised) | A router classifies each message as concept, lookup or task. It leans toward concept only when choosing between concept and lookup. Requests to produce something (code, prose, a fix) are tasks even when a concept sits underneath. Messages that mention a deadline are never framed. Evidence: `research/router-mix/`. |
| L5 | Lookups and tasks answer immediately (revised) | Every answer ends with at most one box, the end-of-answer slot. What fills it, and which hidden decision it features, is an experiment (see E1–E5). Only the featured hidden decision is saved to Learn It Later; there are no extra suggestion rows. Priority moments such as a tier unlock replace the slot. |
| L6 | Answers are shaped by framing responses | They build on what the user said, confirming what they got right and correcting the rest. |
| L7 | Answers are shaped by learning style | Presentation adapts to the inferred style (see P2). |
| L8 | Tasks are never blocked by framing | The work product comes first. When a task comes from a real misconception (e.g., leakage, perfect separation), Claude adds a "why this happened" Learn It Later card. Framing after the answer is a possible phase 2. |
| L9 | Framing is rationed: once per topic | No second framing exchange on a concept already framed in the same conversation. "Skip, just answer" on each message stays the only user control; there's no deadline-mode toggle. |

## End-of-answer experiment

| # | Decision | Detail |
|---|----------|--------|
| E1 | The slot rotates among variants | **A** Learn It Later card with "Dig in now" · **B** "Walk me through it" (optional framing after the answer) · **C** one-question quick check, always with "I don't know" · **D** apply it to your project (needs known user context) · **E** nothing (control). Only variants that fit the message are eligible; weights live in config and start equal. |
| E2 | "Most important" has randomness | The router returns up to 3 hidden-decision candidates, ranked. The pipeline features rank 1 most of the time (default 60%) and otherwise picks one of the others at random. This tests whether the router's ranking matches what users engage with. |
| E3 | The featured decision is always saved | It goes to Learn It Later whatever the variant, even E, so the queue behaves the same across variants and the experiment only tests how it's surfaced. |
| E4 | Assignment is random per answer | Per-answer randomization gets data fastest at demo scale. Switch to per-user assignment if downstream metrics like return visits become the goal. Priority moments (a tier unlock) are never randomized or logged. |
| E5 | What we measure | **Primary:** the slot is engaged in the same session (dig in, walk-through started, quick check answered, feature list checked). **Secondary:** Learn It Later dig-ins within 7 days, framing exchanges completed, mastery gains from the assessor. **Guardrail:** the conversation ends right after the answer. Demo traffic won't reach significance; the point is working instrumentation and a readout. With real traffic, move to a bandit (e.g., Thompson sampling). |

## Learn It Later

| # | Decision | Detail |
|---|----------|--------|
| Q1 | Deferral keeps the user on task | Concepts the user skips and the hidden decision featured in each answer (E3) go to a queue instead of interrupting the task. |
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
| X4 | Three seeded personas, freely switchable | **Maya** (super user, Tier 2): junior marketer ~10 months into her first job at Quillhaven, a small DTC home-textiles brand; owns email and helps with paid social (Klaviyo, Meta Ads Manager, GA4, Google Sheets). Projects: a welcome-series subject-line A/B test, a monthly campaign report, and the Meta vs. Google budget split (attribution). 15 concepts, 5 Learn It Later items, 5 past conversations. **Dev** (almost unlocked): MS data science, churn capstone, 4/5 framing exchanges, ~2 past conversations. **Sam** (brand new): empty state; nothing is known about him or his field, so he sees field-neutral starter prompts. |
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
