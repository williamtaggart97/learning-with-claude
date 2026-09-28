// Empty-state starter prompts (D2). A mix of concept questions (the router
// usually frames these), lookups (answered right away) and a task (the work
// product first, L8), so reviewers see all three router paths (L4). Lookups
// and tasks end with the end-of-answer slot (L5). Pure; server-safe.
import type { UserContextDTO } from "@/lib/types";

export interface StarterPrompt {
  /** Short label on the card. */
  title: string;
  /** Message sent on click. */
  prompt: string;
  kind: "concept" | "lookup" | "task";
}

const BASE: StarterPrompt[] = [
  {
    kind: "concept",
    title: "Why does the bootstrap work?",
    prompt: "Why does the bootstrap give a valid standard error? It feels like cheating to resample my own data.",
  },
  {
    kind: "lookup",
    title: "Two-sample t-test in R",
    prompt: "What's the R code for a two-sample t-test comparing a numeric outcome between two groups?",
  },
  {
    kind: "concept",
    title: "Ridge vs. lasso intuition",
    prompt: "What's the intuition for why lasso sets coefficients exactly to zero but ridge doesn't?",
  },
  {
    kind: "task",
    title: "Email my advisor about a model switch",
    prompt: "Draft an email to my advisor explaining why I switched from Poisson to negative binomial regression.",
  },
  {
    kind: "lookup",
    title: "CI for a proportion in Python",
    prompt: "How do I compute a 95% confidence interval for a proportion in Python?",
  },
  {
    kind: "concept",
    title: "What a p-value really says",
    prompt: "If my p-value is 0.03, what does that actually tell me — and what doesn't it tell me?",
  },
  {
    kind: "lookup",
    title: "Reshape long → wide in pandas",
    prompt: "How do I reshape a long pandas DataFrame to wide format with one column per measurement?",
  },
];

/** Context-tailored prompts, matched on simple keywords in the inferred user context. */
const TAILORED: { match: RegExp; prompt: StarterPrompt }[] = [
  {
    match: /readmission|hospital|epidemiolog/i,
    prompt: {
      kind: "concept",
      title: "Calibration for my risk model",
      prompt: "My readmission model has a decent AUC. Why would I also need to check its calibration?",
    },
  },
  {
    match: /churn/i,
    prompt: {
      kind: "concept",
      title: "Picking a churn threshold",
      prompt: "How should I choose the probability threshold for my churn classifier instead of just using 0.5?",
    },
  },
];

export function starterPromptsFor(context: UserContextDTO | null, max = 6): StarterPrompt[] {
  const haystack = context ? [context.field, ...context.projects, ...context.dataTypes, context.notes].join(" ") : "";
  const tailored = haystack ? TAILORED.filter((t) => t.match.test(haystack)).map((t) => t.prompt).slice(0, 1) : [];
  if (!tailored.length) return BASE.slice(0, max);
  // Replace one generic concept prompt so the concept/lookup/task mix stays balanced.
  const base = BASE.filter((p) => p.title !== "Ridge vs. lasso intuition");
  return [...tailored, ...base].slice(0, max);
}
