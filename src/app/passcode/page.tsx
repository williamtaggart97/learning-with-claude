import type { Metadata } from "next";
import { passcodeGate } from "@/lib/passcode";
import { PasscodeForm } from "./passcode-form";

export const metadata: Metadata = { title: "Enter passcode · Learning mode" };

/**
 * Only allow same-origin redirects. Resolving against a dummy origin catches
 * protocol-relative ("//evil.com") and backslash ("/\evil.com") tricks: any
 * value that would leave the origin falls back to "/".
 */
function safeNext(next: string | string[] | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const base = "http://x";
    const url = new URL(value, base);
    if (url.origin !== base) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

export default async function PasscodePage({ searchParams }: PageProps<"/passcode">) {
  // Read searchParams first: it makes the page request-time rendered, so the
  // gate state below reflects runtime env, not the build environment.
  const { next } = await searchParams;
  const gate = passcodeGate();
  if (gate.mode === "misconfigured") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
        <h1 className="font-serif text-3xl font-medium tracking-tight">Learning mode</h1>
        <p className="mt-2 text-sm text-danger" role="alert">
          This deployment is misconfigured, so access is blocked.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          The operator needs to set <code className="font-mono">DEMO_PASSCODE</code> and{" "}
          <code className="font-mono">PASSCODE_SECRET</code> (or explicitly set{" "}
          <code className="font-mono">DISABLE_PASSCODE_GATE=1</code>).
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="font-serif text-3xl font-medium tracking-tight">Learning mode</h1>
      <p className="mt-2 text-sm text-ink-muted">This demo is private. Enter the passcode to continue.</p>
      <PasscodeForm next={safeNext(next)} />
    </main>
  );
}
