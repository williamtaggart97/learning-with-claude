# Additional features

Ideas for Learning mode that are **out of scope for the prototype**. They're recorded here so the design can account for them later. For what the prototype does build, see [DESIGN.md](DESIGN.md) and [PLAN.md](PLAN.md).

## F1. Task-only nudge

**Problem:** Some users only ever send task requests ("fix this code", "run a t-test on this"). The router answers these as lookups (L5), so the user gets their answer and some Learn It Later callouts, but never hits a framing exchange. Their progress meter never moves and the learner profile stays empty, so Learning mode quietly turns into plain chat.

**Behavior:** Once a user has made a run of task requests with no framing exchanges, Claude gently points out that tasks aren't the best way to learn, and offers a way in.

- **Trigger:** N consecutive task/lookup messages with no framing exchange in between. N lives in config, like the unlock thresholds (P6, P7).
- **Where it shows up:** after the answer, never before it or in place of it. The task still gets done (U4).
- **What it says:** short and non-judgmental, and tied to what the user has actually been doing. For example: "You've been getting a lot done. Want to spend two minutes on *why* the Welch t-test fit here? It'll make the next one faster."
- **What it offers:** a one-click path into learning, drawn from what already exists:
  - dig into the most relevant item in their Learn It Later queue (Q3)
  - reframe the current task as a concept question so it gets framing questions (L1)
- **Dismissable:** "Not now" dismisses it. After a dismissal, the counter resets and the threshold backs off (e.g., doubles) so the nudge doesn't nag.

**Why it fits:** it steers task-only users toward the framing exchanges that drive the profile and unlock ladder, without blocking their work. It also reuses the Learn It Later queue as the entry point, so the nudge is about something the user already ran into.

**Open questions:**

- Is a "task" the same as the router's lookup category, or should the router add a separate task class (e.g., "write this code for me" vs. "what's the formula for X")?
- Should the counter be per conversation or across all of a user's conversations?
- Should deadline signals ("due tonight") suppress the nudge?
- Should a user be able to turn the nudge off entirely?
