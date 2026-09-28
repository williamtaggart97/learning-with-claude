"use client";
// Inline-only markdown for short strings (framing prompts/options): emphasis,
// inline code and $$math$$, no blocks. Router output sometimes uses *these*.
import { memo } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { normalizeMathDelimiters, REMARK_MATH_OPTIONS } from "./prepare";

// Single "$" stays literal (currency); inline math is $$ … $$ (see prepare.ts).
const remarkPlugins: Options["remarkPlugins"] = [[remarkMath, REMARK_MATH_OPTIONS]];
const rehypePlugins: Options["rehypePlugins"] = [[rehypeKatex, { throwOnError: false, strict: "ignore" }]];
/** Block-level markdown is flattened to its text (unwrapDisallowed); paragraphs are joined with a space. */
const blocks = ["h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "table", "hr", "img", "a"];

export const InlineMarkdown = memo(function InlineMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      disallowedElements={blocks}
      unwrapDisallowed
      components={{
        p: ({ children }) => <>{children}</>,
        code: ({ children }) => (
          <code className="rounded bg-code-bg px-1 py-px font-mono text-[0.88em]">{children}</code>
        ),
      }}
    >
      {normalizeMathDelimiters(text.replace(/\s*\n\s*\n\s*/g, " "))}
    </ReactMarkdown>
  );
});
