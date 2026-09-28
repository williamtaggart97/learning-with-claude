"use client";
import { isValidElement, useRef, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";

const LANGUAGE_LABELS: Record<string, string> = {
  r: "R",
  py: "Python",
  python: "Python",
  sql: "SQL",
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  json: "JSON",
  yaml: "YAML",
  stata: "Stata",
  julia: "Julia",
  latex: "LaTeX",
  tex: "LaTeX",
  md: "Markdown",
  markdown: "Markdown",
  text: "Text",
  plaintext: "Text",
};

function languageOf(children: ReactNode): string | null {
  if (!isValidElement<{ className?: string }>(children)) return null;
  const match = /language-([\w+-]+)/.exec(children.props.className ?? "");
  return match ? match[1].toLowerCase() : null;
}

/** Fenced code block: language label + copy button. No execution (A5). */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const lang = languageOf(children);
  const label = lang ? (LANGUAGE_LABELS[lang] ?? lang) : "Code";

  async function copy() {
    const text = preRef.current?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text.replace(/\n$/, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — nothing useful to do */
    }
  }

  return (
    <div className="lm-code group overflow-hidden rounded-xl border border-line bg-code-bg">
      <div className="flex items-center justify-between border-b border-line/80 px-3.5 py-1.5 text-xs text-ink-muted">
        <span className="font-mono">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={copied ? "Copied" : `Copy ${label} code`}
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre
        ref={preRef}
        className="overflow-x-auto px-4 py-3 font-mono text-[0.84rem] leading-relaxed text-code-ink [&>code]:bg-transparent"
      >
        {children}
      </pre>
    </div>
  );
}
