"use client";
// Assistant-message markdown (A5): GFM, KaTeX math, highlighted code.
// Streaming-safe via prepareStreamingMarkdown. No code execution, no images.
//
// Streaming perf: the source is split into top-level blocks (fence- and
// $$-aware, see splitMarkdownBlocks). Each block is a memoized ReactMarkdown,
// so while an answer streams only the last (in-progress) block re-parses —
// and it skips rehype-highlight until it's finished.
import { memo, useMemo } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "./code-block";
import { normalizeMathDelimiters, prepareStreamingMarkdown, repairUnclosedFence, splitMarkdownBlocks } from "./prepare";

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm, remarkMath];
// KaTeX first so math nodes are rendered before the highlighter sees them.
const katex: NonNullable<Options["rehypePlugins"]>[number] = [
  rehypeKatex,
  { throwOnError: false, strict: "ignore", errorColor: "var(--color-danger)" },
];
const rehypePlugins: Options["rehypePlugins"] = [
  katex,
  [rehypeHighlight, { plainText: ["math", "text", "txt", "plain", "plaintext"] }],
];
const rehypePluginsNoHighlight: Options["rehypePlugins"] = [katex];

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ children }) => (
    <div className="lm-table-wrap">
      <table>{children}</table>
    </div>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  // No remote images in answers: show the alt text as a link instead.
  img: ({ src, alt }) => {
    const href = typeof src === "string" && /^https?:\/\//i.test(src) ? src : null;
    if (!href) return null;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {alt?.trim() || "image"}
      </a>
    );
  },
};

const Block = memo(function Block({ source, highlight }: { source: string; highlight: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={highlight ? rehypePlugins : rehypePluginsNoHighlight}
      components={components}
    >
      {source}
    </ReactMarkdown>
  );
});

export const Markdown = memo(function Markdown({
  text,
  streaming = false,
  className = "",
}: {
  text: string;
  streaming?: boolean;
  className?: string;
}) {
  const blocks = useMemo(() => {
    const normalized = normalizeMathDelimiters(text);
    return splitMarkdownBlocks(streaming ? prepareStreamingMarkdown(normalized) : repairUnclosedFence(normalized));
  }, [text, streaming]);

  return (
    <div className={`lm-prose ${streaming ? "lm-streaming" : ""} ${className}`}>
      {blocks.map((source, i) => (
        <Block key={i} source={source} highlight={!streaming || i < blocks.length - 1} />
      ))}
    </div>
  );
});
