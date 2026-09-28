// Markdown pre-processing for rendering (A5). Pure; client- and server-safe.
//
// normalizeMathDelimiters: Claude sometimes writes \( … \) and \[ … \];
//   remark-math only understands $ … $ / $$ … $$, so convert them (outside
//   code).
// prepareStreamingMarkdown: make a PARTIAL answer safe to render mid-stream:
//   - an unterminated ``` fence is closed, so partial code renders as code;
//   - an unterminated $$ display block is held back until it closes (instead
//     of flashing raw TeX);
//   - an unterminated inline $ on the last line is held back likewise.

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** Apply `fn` to the parts of `src` that are not code (fenced blocks or inline spans). */
function mapOutsideCode(src: string, fn: (text: string) => string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (!buffer.length) return;
    const text = buffer.join("\n");
    // Leave inline code spans untouched.
    out.push(
      text
        .split(/(`+[^`\n]*?`+)/g)
        .map((part, i) => (i % 2 === 1 ? part : fn(part)))
        .join(""),
    );
    buffer = [];
  };
  for (const line of lines) {
    const m = FENCE_RE.exec(line);
    if (fence) {
      out.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
      continue;
    }
    if (m) {
      flush();
      fence = m[1];
      out.push(line);
      continue;
    }
    buffer.push(line);
  }
  flush();
  return out.join("\n");
}

export function normalizeMathDelimiters(src: string): string {
  if (!src.includes("\\(") && !src.includes("\\[")) return src;
  return mapOutsideCode(src, (text) =>
    text
      .replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `$$${body}$$`)
      .replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body.trim()}$`),
  );
}

/** Positions of unescaped "$" runs in a line: { index, length }. */
function dollarRuns(line: string): { index: number; length: number }[] {
  const runs: { index: number; length: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") {
      i++;
      continue;
    }
    if (line[i] !== "$") continue;
    let j = i;
    while (line[j] === "$") j++;
    runs.push({ index: i, length: j - i });
    i = j - 1;
  }
  return runs;
}

export function prepareStreamingMarkdown(src: string): string {
  const lines = src.split("\n");
  let fence: string | null = null;
  let offset = 0;
  let displayOpenAt = -1; // absolute offset of an unmatched $$
  let inlineOpenAt = -1; // absolute offset of an unmatched $ on the current line
  let inlineCode = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const m = FENCE_RE.exec(line);
    inlineOpenAt = -1;
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
    } else if (m && displayOpenAt < 0) {
      fence = m[1];
    } else {
      inlineCode = false;
      // Walk the line, ignoring $ inside inline code spans.
      let lastTick = -1;
      const tickFree = line.replace(/`[^`]*`/g, (s) => " ".repeat(s.length));
      if ((tickFree.match(/`/g) ?? []).length % 2 === 1) {
        lastTick = tickFree.lastIndexOf("`");
        inlineCode = true;
      }
      for (const run of dollarRuns(tickFree)) {
        if (inlineCode && run.index > lastTick) break;
        if (run.length >= 2) {
          displayOpenAt = displayOpenAt < 0 ? offset + run.index : -1;
          inlineOpenAt = -1;
        } else if (displayOpenAt < 0) {
          inlineOpenAt = inlineOpenAt < 0 ? offset + run.index : -1;
        }
      }
    }
    offset += line.length + 1;
  }

  if (fence) return `${src}\n${fence}`;
  if (displayOpenAt >= 0) return src.slice(0, displayOpenAt).trimEnd();
  if (inlineOpenAt >= 0) return src.slice(0, inlineOpenAt).trimEnd();
  return src;
}

/** The fence marker left open at the end of `src`, or null. */
function openFenceAtEnd(src: string): string | null {
  let fence: string | null = null;
  for (const line of src.split("\n")) {
    const m = FENCE_RE.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
    } else if (m) {
      fence = m[1];
    }
  }
  return fence;
}

/** Trailing status notes the server appends to partial answers (R3, R10). */
const TRAILING_NOTE_RE = /\n*_\((?:Stopped\.|Claude hit an error[^)]*)\)_\s*$/;

/**
 * A stopped/errored answer can end inside a code fence, which would swallow
 * the trailing "_(Stopped.)_" note into the code block. Close the fence
 * before the note (or at the end).
 */
export function repairUnclosedFence(src: string): string {
  const fence = openFenceAtEnd(src);
  if (!fence) return src;
  const note = TRAILING_NOTE_RE.exec(src);
  if (note && openFenceAtEnd(src.slice(0, note.index)) === fence) {
    return `${src.slice(0, note.index).replace(/\s+$/, "")}\n${fence}\n\n${src.slice(note.index).trim()}`;
  }
  return `${src}\n${fence}`;
}

const LIST_ITEM_RE = /^([-*+]|\d{1,9}[.)])(\s|$)/;

/**
 * Split markdown into top-level blocks so a streaming render can memoize the
 * finished ones and re-parse only the last. Splits only at blank lines that
 * sit outside fenced code and $$ display math and are followed by an
 * unindented line that doesn't start a list item — so list items (and their
 * indented continuations/code), code and math stay whole. Rendering the
 * blocks one after another gives the same output as rendering the whole
 * string (reference-style link definitions aside, which answers don't use).
 */
export function splitMarkdownBlocks(src: string): string[] {
  const lines = src.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  let inDisplay = false;
  let blankRun = 0;

  const push = () => {
    const text = current.join("\n").replace(/\n+$/, "");
    if (text.trim()) blocks.push(text);
    current = [];
  };

  for (const line of lines) {
    const blank = line.trim() === "";
    if (!fence && !inDisplay && !blank && blankRun > 0 && current.length > 0) {
      if (!/^\s/.test(line) && !LIST_ITEM_RE.test(line) && !line.startsWith(">")) push();
    }
    blankRun = blank ? blankRun + 1 : 0;
    current.push(line);

    const m = FENCE_RE.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
      continue;
    }
    if (m && !inDisplay) {
      fence = m[1];
      continue;
    }
    const tickFree = line.replace(/`[^`]*`/g, (s) => " ".repeat(s.length));
    for (const run of dollarRuns(tickFree)) if (run.length >= 2) inDisplay = !inDisplay;
  }
  push();
  return blocks;
}
