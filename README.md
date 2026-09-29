# Learning mode

A working prototype of **Learning mode**, a Claude add-on for learning through collaboration. Claude still answers, but each exchange also builds the user's understanding and adds to a profile of what they know, how they learn, and what they care about.

- **Target user:** anyone building skills for their studies or work, in any field: students and working professionals who are short on time but want to understand what they're learning, not just get the answer. The seeded personas cover data science and marketing.
- **Core idea:** for *concept* questions Claude asks 1–3 short **framing questions** before it answers. They lay out the steps toward the answer without giving it away, and "I don't know" is always an option. *Lookups* and *tasks* are answered straight away, and the concepts behind them go to a **Learn It Later** queue so the user stays on task.
- Real Claude API calls throughout. Nothing is scripted.

Design narrative: [DESIGN.md](DESIGN.md). Every decision with its ID (L4, E2, P6, …): [PLAN.md](PLAN.md).

---

## What to try (5 minutes)

After the passcode, use the persona switcher to move between three seeded learners. Each browser session gets its **own copy** of every persona, so you can't break anything for other reviewers, and **Reset this persona** puts the current one back to its seeded state.

| Persona | Who | What it shows |
|---|---|---|
| **Maya** | Junior marketer (email & paid social) at Quillhaven, a small DTC home-textiles brand. Tier 2. | The full learner profile, for a marketer: 15 concepts with mastery and the evidence behind each score, an inferred learning style you can edit, suggested next topics, 5 Learn It Later items, 5 past conversations in the sidebar. |
| **Dev** | MS data science, churn capstone. 4 of 5 framing exchanges done, 3 concepts tracked. | **The unlock.** Switch to Dev, ask a concept question (e.g. *"Why does regularization reduce overfitting?"*), and answer the framing card. That fifth exchange triggers the Tier 1 reveal ("here's how I think you learn"). |
| **Sam** | Brand new. Nothing known, not even his field. | The empty state with field-neutral starter prompts that cover all three router paths, and the Tier 0 progress meter. |

Things to look for:

1. **The framing card.** Ask a *why* or *which method* question. Claude asks 1–3 questions (short answer, multiple choice or multi-select, each with "I don't know"), then answers by building on what you said: it confirms what you got right and corrects the rest. **Just answer** (skip) is always available, and the skipped concept goes to Learn It Later.
2. **Lookups and tasks.** Ask *"What's the R code for a two-sample t-test?"* or *"Draft a report on last month's email campaigns"*, or paste an error to fix. The answer comes immediately. Claude still spots the hidden decision (e.g. Welch vs. Student, or how open rate is defined) and saves it.
3. **Learn It Later + Dig in.** Open the queue and click **Dig in** on a card. A new chat opens that ties the concept back to the problem where it came up, then applies it to other problems in the user's context.
4. **The end-of-answer experiment.** Each lookup or task answer ends with at most one box, drawn at random from: a Learn It Later card, "Walk me through it" (framing after the answer), a one-question quick check, "Apply it to your project", or nothing (the control). The readout is at **`/results`**, linked as **Experiment results** in the persona menu.
5. **The profile updates itself.** A background assessor updates mastery, style and context a few seconds after each answer. Watch the profile panel change.

---

## Architecture

```
user message
   │
   ▼
Router + framing ── Haiku 4.5, one structured-output call (A1)
   │  classifies: concept │ lookup │ task   (+ ranked hidden-decision candidates)
   │
   ├─ concept → framing card (1–3 questions) ── user answers or skips
   │                                   │
   ▼                                   ▼
Answerer ── Sonnet 5, streamed as NDJSON (A2), shaped by framing responses + learning style
   │   lookup/task answers end with the experiment slot (E1–E5)
   ▼
Assessor ── Haiku 4.5, strict JSON, runs after the response via next/server after() (A3)
       → concept mastery + evidence, style signals, user context, new Learn It Later items
```

- **Three-way router (L4, L8).** An 80-prompt study showed a concept/lookup-only router framed tasks almost at random, including "draft an email to my advisor" and "I need this by Friday". So tasks (write, fix, clean) are now their own class and are never blocked by framing. The "lean toward concept" tie-break applies only between concept and lookup, and messages that mention a deadline are never framed. Evidence and numbers: [research/router-mix/three-way-router.md](research/router-mix/three-way-router.md).
- **Framing is rationed (L9).** At most once per topic per conversation. The rule is enforced in code, not only in the prompt.
- **Unlock ladder (P6, P7).** Tier 0 is the queue plus a progress meter. Tier 1 (5 answered framing exchanges) is a read-only profile reveal. Tier 2 (15 exchanges or 8 concepts) makes the profile editable and adds suggested topics. Only answered framing exchanges count, so spamming messages doesn't help. Thresholds are in [`src/config.ts`](src/config.ts).
- **End-of-answer slot experiment (E1–E5).** The variant is randomized per answer among the variants that fit the message. The featured hidden decision is router rank 1 60% of the time and a lower-ranked candidate otherwise, which tests the router's ranking. The featured item is always saved to Learn It Later, so only the way it's surfaced varies. The primary metric is engagement in the same session, and the guardrail is the conversation ending right after the answer. The policy is in [`src/lib/slot/policy.ts`](src/lib/slot/policy.ts). Demo traffic won't reach significance; the point is working instrumentation and a readout.
- **Data model** (Prisma, [`prisma/schema.prisma`](prisma/schema.prisma)). `User` (keyed by a per-browser `demoSessionId`) owns `Conversation` → `Message`, `FramingExchange`, `ConceptMastery` (score + evidence), `LearningStyle` (3 dimensions with confidence and user overrides), `UserContext`, and `LearnLaterItem`. `Concept` is a shared catalog. `SlotImpression` stores experiment data and survives persona resets. `RateLimit` backs the fixed-window limits.
- **Access (X1–X6).** There are no accounts. A shared passcode is checked in `src/proxy.ts` (Next 16's replacement for middleware), and the cookie holds an HMAC of it, never the passcode itself. Personas are cloned per browser session from seeded template rows. Rate limits per session, per IP and per day across the whole app protect the API key.
- **Stack.** Next.js 16 (App Router) · React 19 · Prisma 7 (pg driver adapter) · Postgres (Neon in production) · Tailwind 4 · Anthropic TypeScript SDK · react-markdown + KaTeX + highlight.js.

---

## Local setup

**Prerequisites:** Node 20+ (developed on Node 24) and a Postgres database. A Neon branch or a local Postgres both work.

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env.local       # then fill in DATABASE_URL, DIRECT_URL, ANTHROPIC_API_KEY
npm run db:migrate               # prisma migrate dev: applies prisma/migrations
npm run db:seed                  # concept catalog + Maya / Dev / Sam templates
npm run dev                      # http://localhost:3000
```

Locally the passcode gate is **off** unless you set `DEMO_PASSCODE`.

| Script | What it does |
|---|---|
| `npm test` | Offline unit tests (router policy, slot experiment, style edits, starter prompts). No network or DB needed. |
| `npm run typecheck` / `npm run lint` | `tsc` (after `next typegen`) / ESLint |
| `npm run build` | `prisma generate && next build` |
| `npm run db:studio` | Prisma Studio |

Dev-only helper: open `/?slotVariant=quickcheck` (or `card`, `walkthrough`, `apply`, `none`) to force an end-of-answer variant. Forced impressions are flagged and excluded from `/results`. A small "slot forced: …" pill shows while an override is active (click **clear** to drop it). Production builds ignore the override and never show the pill.

---

## Deployment (Vercel + Neon)

1. **Neon.** Production uses the project's `production` branch. Use a separate branch (e.g. `dev`) for local work and Vercel **Preview** deployments.
2. **Vercel.** Import the GitHub repo. [`vercel.json`](vercel.json) sets the build command to `npm run build:vercel`, which runs `prisma generate && next build` and then `prisma migrate deploy` and `npm run db:seed` **only when `VERCEL_ENV=production`**. Preview builds never migrate or seed. Production needs `DIRECT_URL`, and the build fails if it's missing.
3. **Environment variables.** Set them in *Project → Settings → Environment Variables* (full list below). Scope `DATABASE_URL` / `DIRECT_URL` to **Production** with the `production` branch URLs. If you enable Preview deployments, give Preview the `dev` branch URLs so previews never read or write production data.
4. **Every production deploy migrates and seeds.** The seed is idempotent: it upserts the concept catalog (never deleting) and rewrites only the persona templates, each in one transaction. Session clones are untouched. To migrate or seed without deploying, use the commands below.
5. **Passcode.** Choose `DEMO_PASSCODE` and share it with reviewers. Changing `DEMO_PASSCODE` or `PASSCODE_SECRET` signs everyone out.

**Function limits.** The streaming routes set `maxDuration = 300`, which the Hobby plan allows (300 s with Fluid compute, the default) as do Pro and Enterprise. The background assessor runs in `after()`, which Vercel supports via `waitUntil`, within the same limit.

### Environment variables

| Variable | Production | Description |
|---|---|---|
| `DATABASE_URL` | **required** | Neon **pooled** URL (`…-pooler…`) with `sslmode=verify-full`. Used by the app at runtime. |
| `DIRECT_URL` | **required** | Neon **direct** (unpooled) URL. Used by `prisma migrate deploy` during the production build. |
| `ANTHROPIC_API_KEY` | **required** | Claude API key. |
| `DEMO_PASSCODE` | **required** | The shared passcode reviewers type. |
| `PASSCODE_SECRET` | **required** | Random secret used to HMAC the passcode cookie. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `EXPERIMENT_ACTIVE` | optional | End-of-answer experiment, **on** by default. `0` turns it off (answers show Learn It Later chips instead of the slot, and nothing is logged). |
| `ROUTER_MODEL` / `ANSWERER_MODEL` / `ASSESSOR_MODEL` / `SLOT_MODEL` | optional | Model overrides. Defaults are in `src/config.ts` (Haiku 4.5 / Sonnet 5 / Haiku 4.5 / Haiku 4.5). |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MINUTES` | optional | Chat requests per browser session per window (default 60 / 60 min). |
| `RATE_LIMIT_IP_MAX`, `RATE_LIMIT_IP_WINDOW_MINUTES` | optional | Per client IP (default 120 / 60 min). |
| `RATE_LIMIT_GLOBAL_DAILY_MAX` | optional | Whole-app cap per UTC day, which bounds API spend (default 2000). |
| `PASSCODE_MAX_ATTEMPTS`, `PASSCODE_WINDOW_MINUTES` | optional | Passcode guesses per IP (default 10 / 15 min). |
| `DISABLE_PASSCODE_GATE` | **leave unset** | `1` removes the gate entirely. |

If `DEMO_PASSCODE` or `PASSCODE_SECRET` is missing in production, the app **fails closed**: pages show a misconfiguration notice and APIs return 503.

### Migrate and seed the production branch manually

Production deploys do this for you. To run it by hand, fetch the connection string into your shell without printing it, run the migration and seed, then clear it. Both `prisma.config.ts` and the seed script prefer `DIRECT_URL`, and variables already in the environment take precedence over `.env.local`.

```bash
export DIRECT_URL="$(npx -y neon@latest cs production --project-id <project-id> \
  --database-name neondb --role-name neondb_owner --ssl verify-full)"
export DATABASE_URL="$DIRECT_URL"
npx prisma migrate status && npx prisma migrate deploy && npm run db:seed
unset DIRECT_URL DATABASE_URL
```

---

## Known limitations (it's a prototype)

- **No real accounts.** Identity is a browser cookie. Clearing cookies starts a fresh session, and persona data is per session and not meant to last.
- **The experiment is instrumentation, not a result.** Demo traffic is far too small for significance. With real traffic, per-user assignment and a bandit (e.g. Thompson sampling) would replace per-answer uniform randomization (E4, E5).
- **The assessor is best effort.** It runs after the response and can be skipped (e.g. for a stopped answer or on timeout), so a profile update can occasionally be missed. Mastery scores are heuristic estimates from a small model, not psychometrics.
- **Rate limits are fixed windows in Postgres.** That's enough to protect a demo key, not a production abuse system.
- **Domain.** Prompts are field-neutral, but the concept catalog is seeded only for data science/statistics and marketing. Other fields work; their concepts are invented on the fly, so slugs can be less consistent across conversations.
- **No in-browser code execution.** Code is rendered, not run.
- The visual style evokes Claude (cream, serif, coral) and deliberately uses no Anthropic logos or wordmarks.
