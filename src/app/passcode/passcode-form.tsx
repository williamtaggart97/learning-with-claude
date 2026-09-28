"use client";

import { useState, type FormEvent } from "react";
import { API_ROUTES, type ApiError } from "@/lib/api-contract";

export function PasscodeForm({ next }: { next: string }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(API_ROUTES.passcode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        window.location.assign(next);
        return;
      }
      const body = (await res.json().catch(() => null)) as ApiError | null;
      setError(body?.error ?? "Something went wrong");
    } catch {
      setError("Network error — try again");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      <label htmlFor="passcode" className="sr-only">
        Passcode
      </label>
      <input
        id="passcode"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        placeholder="Passcode"
        className="rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending || !passcode}
        className="rounded-xl bg-accent-strong px-4 py-3 font-medium text-white transition-colors hover:bg-accent-strong-hover disabled:opacity-50"
      >
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
