// Empty-state starter prompts (D2). A mix of concept questions (the router
// usually frames these), lookups (answered right away) and a task (the work
// product first, L8), so reviewers see all three router paths (L4). Lookups
// and tasks end with the end-of-answer slot (L5). The generic set spans
// fields (data, marketing, writing, coding, everyday work) because nothing is
// assumed about a new user's field. Pure; server-safe.
import type { UserContextDTO } from "@/lib/types";

export interface StarterPrompt {
  /** Short label on the card. */
  title: string;
  /** Message sent on click. */
  prompt: string;
  kind: "concept" | "lookup" | "task";
  /** The field the prompt comes from; keeps the generic set visibly field-neutral. */
  field: "data" | "marketing" | "writing" | "coding" | "research" | "work";
}

const SHOW_DONT_TELL = "“Show, don’t tell” in writing";

/** Ordered so any prefix of 6 keeps the concept/lookup/task mix (3/2/1). */
export const BASE: StarterPrompt[] = [
  {
    kind: "concept",
    field: "marketing",
    title: "Why A/B tests need enough data",
    prompt: "Why do A/B tests need a minimum sample size? If one version is ahead after a day, why not just call it?",
  },
  {
    kind: "lookup",
    field: "work",
    title: "Remove duplicates in a spreadsheet",
    prompt: "How do I remove duplicate rows in Google Sheets or Excel?",
  },
  {
    kind: "concept",
    field: "writing",
    title: SHOW_DONT_TELL,
    prompt: "What does “show, don’t tell” actually mean in writing, and when is telling the better choice?",
  },
  {
    kind: "task",
    field: "work",
    title: "Email my manager about a schedule change",
    prompt: "Draft a short email to my manager asking to move our weekly one-on-one from Monday to Thursday afternoons.",
  },
  {
    kind: "lookup",
    field: "coding",
    title: "Undo my last Git commit",
    prompt: "How do I undo my last Git commit but keep the changes in my working directory?",
  },
  {
    kind: "concept",
    field: "data",
    title: "What a p-value really says",
    prompt: "If my p-value is 0.03, what does that actually tell me — and what doesn't it tell me?",
  },
  {
    kind: "lookup",
    field: "research",
    title: "Cite a website in APA",
    prompt: "How do I cite a web page in APA 7th edition, including one with no author or date?",
  },
];

/**
 * Context-tailored prompts, matched on simple keywords in the inferred user
 * context. First match wins, so more specific entries come first. Each one
 * `replaces` the generic prompt (same kind, so the concept/lookup/task mix
 * stays balanced) that is least relevant to that audience.
 */
export interface TailoredPrompt {
  match: RegExp;
  prompt: StarterPrompt;
  /** Title of the same-kind BASE prompt this one displaces. */
  replaces: string;
}

export const TAILORED: TailoredPrompt[] = [
  {
    match: /churn/i,
    replaces: SHOW_DONT_TELL,
    prompt: {
      kind: "concept",
      field: "data",
      title: "Picking a churn threshold",
      prompt: "How should I choose the probability threshold for my churn classifier instead of just using 0.5?",
    },
  },
  {
    // Specific marketing terms only: a bare "email" or a "political campaign" isn't enough.
    match: /marketing|klaviyo|mailchimp|\b(?:email|ad)\s+campaigns?|paid\s+(?:social|search|media)|meta\s+ads|google\s+ads/i,
    replaces: SHOW_DONT_TELL,
    prompt: {
      kind: "concept",
      field: "marketing",
      title: "Do our ads actually cause sales?",
      prompt: "How would I test whether our Meta ads actually cause sales, instead of just trusting reported ROAS?",
    },
  },
];

export function starterPromptsFor(context: UserContextDTO | null, max = 6): StarterPrompt[] {
  const haystack = context ? [context.field, ...context.projects, ...context.dataTypes, context.notes].join(" ") : "";
  const tailored = haystack ? TAILORED.find((t) => t.match.test(haystack)) : undefined;
  const shown = BASE.slice(0, max);
  if (!tailored || !shown.length) return shown;
  // Swap within the shown prefix so its concept/lookup/task mix is unchanged:
  // the named prompt if shown, else the last shown prompt of the same kind.
  let drop = shown.findIndex((p) => p.title === tailored.replaces);
  if (drop < 0) drop = shown.findLastIndex((p) => p.kind === tailored.prompt.kind);
  if (drop < 0) drop = shown.length - 1;
  return [tailored.prompt, ...shown.filter((_, i) => i !== drop)];
}
