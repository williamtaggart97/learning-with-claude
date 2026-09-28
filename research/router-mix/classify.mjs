// Runs every prompt in prompts.json through the app's real router prompt
// (ROUTER_SYSTEM + ROUTER_JSON_SCHEMA from the app worktree) as a brand-new
// learner, then tallies router kind against the hand-labelled intent.
//
// Usage: node research/router-mix/classify.mjs [path-to-app-checkout]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(process.argv[2] ?? path.join(here, "../../../plan-design-context-dec643"));
const require = createRequire(path.join(appRoot, "package.json"));
const Anthropic = require("@anthropic-ai/sdk").default;

// API key from the app's .env.local (never printed).
if (!process.env.ANTHROPIC_API_KEY) {
  const env = fs.readFileSync(path.join(appRoot, ".env.local"), "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY=(.*)$/m);
  if (m) process.env.ANTHROPIC_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
}

// Pull the router system prompt straight from source so this tracks the app.
const promptsSrc = fs.readFileSync(path.join(appRoot, "src/lib/claude/prompts.ts"), "utf8");
const sys = promptsSrc.match(/export const ROUTER_SYSTEM = `([\s\S]*?)`;/);
if (!sys) throw new Error("ROUTER_SYSTEM not found in prompts.ts");
const configSrc = fs.readFileSync(path.join(appRoot, "src/config.ts"), "utf8");
const minQ = configSrc.match(/minQuestions:\s*(\d+)/)[1];
const maxQ = configSrc.match(/maxQuestions:\s*(\d+)/)[1];
const ROUTER_SYSTEM = sys[1]
  .replaceAll("${FRAMING.minQuestions}", minQ)
  .replaceAll("${FRAMING.maxQuestions}", maxQ)
  .replace(/\\`/g, "`");
const routerModel = process.env.ROUTER_MODEL || configSrc.match(/router:\s*process\.env\.ROUTER_MODEL \|\| "([^"]+)"/)[1];

const catalogSrc = fs.readFileSync(path.join(appRoot, "src/lib/concept-catalog.ts"), "utf8");
const catalog = [...catalogSrc.matchAll(/slug:\s*"([^"]+)",\s*\n\s*name:\s*"([^"]+)"/g)]
  .map(([, slug, name]) => `${slug} — ${name}`)
  .join("\n");

// Mirrors formatLearner() for a brand-new user (Sam).
const learnerText = [
  "Concept mastery: no concepts assessed yet.",
  "Learning style: unknown yet — use a balanced default (short intuition, then the key formal piece, then code if relevant).",
  "User context: nothing known yet (assume a data science / statistics grad student).",
].join("\n\n");

const CALLOUT = {
  type: "object",
  properties: { title: { type: "string" }, preview: { type: "string" }, appliedContext: { type: "string" }, conceptSlug: { type: "string" } },
  required: ["title", "preview", "appliedContext", "conceptSlug"],
  additionalProperties: false,
};
const SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["concept", "lookup"] },
    rationale: { type: "string" },
    conceptSlugs: { type: "array", items: { type: "string" } },
    framingQuestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          format: { type: "string", enum: ["short_answer", "multiple_choice", "multi_select"] },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["prompt", "format", "options"],
        additionalProperties: false,
      },
    },
    skipCallout: { anyOf: [CALLOUT, { type: "null" }] },
    callouts: { type: "array", items: CALLOUT },
  },
  required: ["kind", "rationale", "conceptSlugs", "framingQuestions", "skipCallout", "callouts"],
  additionalProperties: false,
};

const userPrompt = (message) => `<concept_catalog>
${catalog || "(empty)"}
</concept_catalog>

<learner_profile>
${learnerText}
</learner_profile>

<recent_conversation>
(no earlier turns — this is the first message)
</recent_conversation>

<new_message>
${message}
</new_message>

Classify the new message and produce the JSON.`;

const client = new Anthropic({ maxRetries: 3 });
const prompts = JSON.parse(fs.readFileSync(path.join(here, "prompts.json"), "utf8"));

async function route(p) {
  const res = await client.messages.create({
    model: routerModel,
    max_tokens: 2000,
    system: ROUTER_SYSTEM,
    messages: [{ role: "user", content: userPrompt(p.text) }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const out = JSON.parse(text);
  return {
    ...p,
    kind: out.kind,
    rationale: out.rationale,
    nQuestions: out.framingQuestions.length,
    nCallouts: out.callouts.length,
    calloutTitles: out.callouts.map((c) => c.title),
  };
}

// Small concurrency pool.
const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < prompts.length) {
      const p = prompts[next++];
      try {
        results.push(await route(p));
      } catch (err) {
        results.push({ ...p, kind: "error", rationale: String(err?.message ?? err) });
      }
      process.stderr.write(".");
    }
  }),
);
process.stderr.write("\n");
results.sort((a, b) => a.id - b.id);
fs.writeFileSync(path.join(here, "results.json"), JSON.stringify(results, null, 2));

// ── Report ──
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "-");
const count = (rows, k) => rows.filter((r) => r.kind === k).length;
const ok = results.filter((r) => r.kind !== "error");
console.log(`router model: ${routerModel}   prompts: ${results.length}   errors: ${results.length - ok.length}\n`);
console.log(`OVERALL  concept ${count(ok, "concept")} (${pct(count(ok, "concept"), ok.length)})   lookup ${count(ok, "lookup")} (${pct(count(ok, "lookup"), ok.length)})\n`);

console.log("BY HAND-LABELLED INTENT");
for (const intent of ["task", "lookup", "concept"]) {
  const rows = ok.filter((r) => r.intent === intent);
  const withCallouts = rows.filter((r) => r.kind === "lookup" && r.nCallouts > 0).length;
  console.log(`  ${intent.padEnd(8)} n=${String(rows.length).padEnd(3)} -> concept ${pct(count(rows, "concept"), rows.length).padStart(4)}   lookup ${pct(count(rows, "lookup"), rows.length).padStart(4)}   (lookups with >=1 callout: ${withCallouts}/${count(rows, "lookup")})`);
}
console.log("\nBY BUCKET");
for (const bucket of [...new Set(ok.map((r) => r.bucket))]) {
  const rows = ok.filter((r) => r.bucket === bucket);
  console.log(`  ${bucket.padEnd(13)} n=${String(rows.length).padEnd(3)} concept ${pct(count(rows, "concept"), rows.length).padStart(4)}`);
}
console.log("\nDISAGREEMENTS (intent concept/lookup vs router) and TASKS ROUTED TO CONCEPT");
for (const r of ok) {
  const mismatch = (r.intent === "concept" && r.kind !== "concept") || (r.intent === "lookup" && r.kind !== "lookup") || (r.intent === "task" && r.kind === "concept");
  if (mismatch) console.log(`  #${r.id} [${r.intent}->${r.kind}] ${r.text.slice(0, 90)}\n      ${r.rationale}`);
}
for (const r of results.filter((x) => x.kind === "error")) console.log(`  ERROR #${r.id}: ${r.rationale}`);
