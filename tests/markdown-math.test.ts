// Math vs currency in rendered markdown (A5). Single "$" is literal (prices
// are common for marketers); inline math is $$…$$, display math is $$ on its
// own lines; \( \) and \[ \] are normalized. The components can't render under
// the react-server test condition, so the render checks run the same remark
// pipeline (remark-math with REMARK_MATH_OPTIONS, then rehype-katex).
//
// Run: node --conditions=react-server --import tsx --test tests/*.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Element, Root, RootContent } from "hast";
import { toText } from "hast-util-to-text";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import {
  normalizeMathDelimiters,
  prepareStreamingMarkdown,
  REMARK_MATH_OPTIONS,
  splitMarkdownBlocks,
} from "@/components/markdown/prepare";

const processor = unified()
  .use(remarkParse)
  .use(remarkMath, REMARK_MATH_OPTIONS)
  .use(remarkRehype)
  .use(rehypeKatex);

async function render(src: string): Promise<Root> {
  return (await processor.run(processor.parse(normalizeMathDelimiters(src)))) as Root;
}

function classes(node: Element): string[] {
  const c = node.properties?.className;
  return Array.isArray(c) ? c.map(String) : [];
}

/** Count KaTeX renders: inline (.katex outside .katex-display) and display. */
function katexCounts(tree: Root) {
  let inline = 0;
  let display = 0;
  const walk = (node: Root | RootContent, inDisplay: boolean) => {
    if (node.type === "element") {
      const cls = classes(node);
      if (cls.includes("katex-display")) {
        display++;
        return;
      }
      if (cls.includes("katex")) {
        if (!inDisplay) inline++;
        return;
      }
    }
    if ("children" in node) for (const child of node.children) walk(child, inDisplay);
  };
  walk(tree, false);
  return { inline, display };
}

test("render: dollar amounts stay literal text", async () => {
  const tree = await render("Revenue per recipient fell from $0.29 to $0.24, a $5k swing.");
  assert.deepEqual(katexCounts(tree), { inline: 0, display: 0 });
  assert.match(toText(tree), /fell from \$0\.29 to \$0\.24, a \$5k swing\./);
});

test("render: $$…$$ inside a sentence is inline KaTeX, prices beside it stay literal", async () => {
  const tree = await render("Call when $$p > 0.10$$, since a call costs $6 and saves $240.");
  assert.deepEqual(katexCounts(tree), { inline: 1, display: 0 });
  const text = toText(tree);
  assert.match(text, /costs \$6 and saves \$240\./);
  assert.doesNotMatch(text, /\$\$/);
});

test("render: $$ on its own lines is display KaTeX", async () => {
  const tree = await render("Break-even:\n\n$$\np^* = \\frac{6}{60}\n$$\n\nDone.");
  assert.deepEqual(katexCounts(tree), { inline: 0, display: 1 });
});

test("render: an escaped \\$5 renders as $5", async () => {
  const tree = await render("It costs \\$5 per send.");
  assert.deepEqual(katexCounts(tree), { inline: 0, display: 0 });
  assert.match(toText(tree), /It costs \$5 per send\./);
});

test("render: \\( \\) becomes inline math and \\[ \\] on its own line becomes display math", async () => {
  assert.deepEqual(katexCounts(await render("So \\(x^2\\) grows, at $3 each.")), { inline: 1, display: 0 });
  assert.deepEqual(katexCounts(await render("So:\n\n\\[\nx^2 + 1\n\\]\n\nok")), { inline: 0, display: 1 });
  assert.deepEqual(katexCounts(await render("So:\n\n\\[ x^2 + 1 \\]\n\nok")), { inline: 0, display: 1 });
});

test("normalize: \\(x\\) → $$x$$; \\[…\\] alone on a line → a $$ block; code untouched", () => {
  assert.equal(normalizeMathDelimiters("a \\( x \\) b"), "a $$x$$ b");
  assert.equal(normalizeMathDelimiters("a\n\\[ x^2 \\]\nb"), "a\n$$\nx^2\n$$\nb");
  assert.equal(normalizeMathDelimiters("a\n\\[\nx^2\n\\]\nb"), "a\n$$\nx^2\n$$\nb");
  // Indented (inside a list item) keeps its indentation.
  assert.equal(normalizeMathDelimiters("- item\n\n  \\[ y \\]"), "- item\n\n  $$\n  y\n  $$");
  // Mid-line \[ \] becomes inline math.
  assert.equal(normalizeMathDelimiters("so \\[y\\] here"), "so $$y$$ here");
  assert.equal(normalizeMathDelimiters("`\\(x\\)` and\n```\n\\(y\\)\n```"), "`\\(x\\)` and\n```\n\\(y\\)\n```");
  assert.equal(normalizeMathDelimiters("costs $5"), "costs $5");
});

test("streaming: prices are never held back", () => {
  for (const partial of [
    "Revenue fell from $0.29",
    "Revenue fell from $0.29 to $0.24 after",
    "A $5 CPA and a $",
    "Line one costs $3\nline two costs $4 and more",
  ])
    assert.equal(prepareStreamingMarkdown(partial), partial);
});

test("streaming: an unclosed $$ (inline or display) is held back until it closes", () => {
  assert.equal(prepareStreamingMarkdown("Costs $6, so call when $$p > 0."), "Costs $6, so call when");
  assert.equal(prepareStreamingMarkdown("Costs $6, so call when $$p > 0.10$$ and"), "Costs $6, so call when $$p > 0.10$$ and");
  assert.equal(prepareStreamingMarkdown("Break-even:\n\n$$\np^* = \\frac{6"), "Break-even:");
  assert.equal(prepareStreamingMarkdown("Break-even:\n\n$$\nx\n$$\n\nNext $4"), "Break-even:\n\n$$\nx\n$$\n\nNext $4");
  // $ inside inline code doesn't count.
  assert.equal(prepareStreamingMarkdown("Use `$$` then $5"), "Use `$$` then $5");
});

test("blocks: inline $$…$$ doesn't glue paragraphs together", () => {
  assert.deepEqual(splitMarkdownBlocks("Call when $$p > 0.10$$.\n\nCosts $6."), ["Call when $$p > 0.10$$.", "Costs $6."]);
});
