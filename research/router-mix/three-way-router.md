# Proposal: three-way router (concept / lookup / task)

For the session building the app in `.claude/worktrees/plan-design-context-dec643`. Nothing here has been changed in that worktree.

## Why

We ran 80 realistic grad-student prompts through the current router (`ROUTER_SYSTEM` in `src/lib/claude/prompts.ts`, Haiku 4.5, new-learner profile). The prompts and the script are in `research/router-mix/` on branch `claude/feature-design-iteration-7b8fb0`.

| Hand-labelled intent | n | Routed to concept (framing) | Routed to lookup |
|---|---|---|---|
| Concept question | 22 | 100% | 0% |
| Lookup | 20 | 0% | 100% |
| **Task** (debug, write code or prose, clean data) | 38 | **29%** | 71% |

The router separates concept questions from lookups perfectly. Tasks, which are likely the largest share of real traffic, get framed or not almost at random depending on phrasing:

- **Framed, and harmful:** "Draft an email to my advisor…" (#33), "Help me write a response to Reviewer 2" (#36), "I need the model done by Friday" (#26). Asking framing questions before the answer blocks deliverables and ignores a stated deadline.
- **Framed, good topic but wrong timing:** leakage (#6), perfect separation (#8), Stan divergences (#9), singular fit (#2). These are real learning moments, but the user needs the fix first.
- **Not framed, handled well:** the code-writing prompts. They went to lookup, and 22 of 27 got hidden-decision callouts.

## Proposed rule

> Tasks always get done first. Framing never blocks a task.

| Kind | What the user wants | Handling |
|---|---|---|
| `concept` | Understanding (why, which method, how to interpret) | Unchanged: 1–3 framing questions, then the answer. |
| `lookup` | A fact, syntax or a recipe | Unchanged: answer now, plus 0–2 hidden-decision callouts. |
| `task` (new) | Work product: fix this, write this code or text, clean this data | Answer now in a new `task` answer mode, plus 0–2 hidden-decision callouts. When the task was caused by a real misconception (bug from leakage, separation, …), add a `whyCallout` for it. |

For tie-breaks, move the "lean toward concept" rule so it only applies between concept and lookup. When a message asks Claude to *produce* something (code, prose, a fix), it's a `task`, even if a concept sits underneath it. The concept goes in the callouts.

## Changes, file by file

### Phase 1 (small, mostly prompt and schema)

1. **`src/lib/claude/prompts.ts`: `ROUTER_SYSTEM`**
   - Section 1: add `"task"` with a definition and examples: fixing an error or warning, writing or refactoring code, drafting or editing prose (methods, emails, reviewer responses), reshaping or cleaning data, and "should I just do X?" when the user is clearly mid-task.
   - Add the tie-break rule above. Also add: "If the user mentions a deadline or asks for a deliverable, never choose concept."
   - Section 4: make the callout rules cover both `lookup` and `task`. For `task`, add `whyCallout` (nullable): when the problem comes from a misunderstanding (not a typo or an environment issue), give a Learn It Later card for that concept. Its title should read like "Why scaling before the split leaks".
2. **`src/lib/claude/router.ts`**
   - `ROUTER_JSON_SCHEMA.kind` enum becomes `["concept", "lookup", "task"]`. Add `whyCallout: anyOf [CALLOUT_JSON, null]` to properties and to `required`.
   - `normalizeRouterOutput`: add a `task` branch. Callouts are capped at 2, and `whyCallout` is normalized. A concept result with no usable framing should degrade to `task` when the message asks for a deliverable, otherwise to `lookup`. The router-failure fallback stays `lookup`.
3. **`src/lib/schemas.ts`**: add `TaskRouterResultSchema` (`kind: "task"`, common fields, `callouts?`, `whyCallout: LearnLaterCallout | null`) to the `RouterResultSchema` union. Export the type from `src/lib/types.ts`.
4. **`src/lib/claude/prompts.ts`: `MODE_INSTRUCTIONS`**: add a `task` answer mode. Deliver the work product first, complete and ready to use. For fixes, state the cause in one plain sentence, then the fix. Name the one or two choices you made on the user's behalf in a single clause each; they'll be saved as callouts, so don't expand on them. No quizzing.
5. **`src/lib/pipeline/chat.ts`**: route `task` through the existing lookup path (`answerAndPersist`) with `mode: "task"`.
6. **One end-of-answer slot, chosen by an experiment (revised L5, new E1–E5 in PLAN.md).** This applies to both lookups and tasks. Today every callout is saved as `origin: "flagged"`. Instead:
   - **Candidates.** The router returns up to 3 hidden-decision candidates, ranked most consequential first; for tasks, `whyCallout` counts as a candidate. Raise the cap from 2 to 3 in `normalizeRouterOutput`.
   - **Pick the featured candidate (E2).** Rank 1 with probability `EXPERIMENT.topPickProbability` (default 0.6), otherwise uniformly among the rest. Persist only that one as a Learn It Later item (`origin: "flagged"`), whatever the variant (E3).
   - **Pick the slot variant (E1).** Filter to eligible variants, then draw by weight from `EXPERIMENT.slotWeights` in `src/config.ts`:
     - `card` (A): always eligible.
     - `walkthrough` (B): needs a concept slug; clicking starts a framing exchange after the answer.
     - `quickcheck` (C): needs one multiple-choice question. Have the router or answerer return it as `quickCheck: {prompt, options, correctIndex} | null`.
     - `apply` (D): needs known user context (projects or data types).
     - `none` (E): always eligible.
   - **Priority override (E4).** If this answer triggers a tier unlock, show the unlock instead and skip the draw. Don't log an impression.
   - **Log it.** A new `SlotImpression` table: `id, userId, conversationId, messageId, variant, candidateRank, learnLaterItemId, createdAt, engagedAt?, engagement?`, where engagement is `dig_in | walkthrough_started | quickcheck_answered | apply_clicked`. Set `engagedAt` from the existing routes those actions already hit. Send `{variant, ...payload}` to the client in the `callouts` stream event, or rename it `slot`.
   - **Readout.** A simple page behind the passcode showing, per variant, the impression count, engagement rate within the session, and how often the conversation ended right after the answer. At demo scale this is instrumentation, not a verdict.
   - The UI renders exactly one box per answer. See the canvas row "End-of-answer slot: experiment variants".
7. **Framing at most once per topic (new L9).** Enforce this in code, not just in the prompt. In `chat.ts`, if the router returns `concept` and any of its `conceptSlugs` match a `FramingExchange` already in this conversation, downgrade the result to `lookup`: answer immediately and use `skipCallout` as the single saved callout. The existing prompt line ("If the conversation shows the user was just framed on this same concept, prefer lookup") can stay as a first line of defense.
8. **Tests**: extend the `normalizeRouterOutput` tests to cover task parsing, the `whyCallout` null and present cases, and concept→task degradation. Add a pipeline test for the once-per-topic downgrade and for "only the first callout is persisted".

### Phase 2 (UI, optional, needs a design pass)

- **"Why did this happen?" after a task answer.** Render `whyCallout` as a distinct chip under the answer rather than silently queueing it. Clicking it starts a framing exchange on that concept *after* the fix, which keeps the learning moment without blocking the fix. This would add a new entry point for `FramingExchange` (framing that follows an answer).
- **Progress meter.** Most traffic will be tasks, so should an answered post-task framing exchange count toward the Tier 1 and Tier 2 thresholds (`src/lib/tiers.ts`, P7)? Counting it seems consistent with "rewards engaging". Opening a Learn It Later item should not count.

## Decision log impact (already updated in PLAN.md on the design branch)

- **L4 (revised):** concept / lookup / task. The lean toward concept applies only when choosing between concept and lookup. Deliverables and messages that mention a deadline are never framed.
- **L5 (revised):** lookups and tasks answer immediately and end with at most one box. The box is chosen by the E1–E5 experiment, and only the featured hidden decision is saved.
- **E1–E5 (new):** the end-of-answer slot rotates among card, walk-through, quick check, apply-it and nothing. The featured decision is rank 1 about 60% of the time. Every impression and engagement is logged.
- **L8 (new):** tasks are never blocked by framing.
- **L9 (new):** framing happens at most once per topic in a conversation. The per-message "Skip, just answer" stays the only user control; there's no deadline-mode toggle.
- **Q1:** reworded to match L5.

## How to check it

From the design worktree, after the router change:

```bash
node research/router-mix/classify.mjs C:/Users/willi/dev/learning-with-claude/.claude/worktrees/plan-design-context-dec643
```

The script needs a small update to accept `task` in its schema and report. Targets: concept and lookup stay at 100% agreement, 0 tasks framed, and the debugging tasks (#2–#11) get a `whyCallout`.
