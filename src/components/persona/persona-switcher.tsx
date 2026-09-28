"use client";
// Demo persona switcher + "Reset this persona" (X4–X6), in the sidebar
// footer. After POST /api/persona or /api/persona/reset we go to `/`
// (conversation ids differ per persona) and router.refresh(): the (chat)
// layout re-renders with the new session user and <AppShell key={user.id}>
// remounts all client state.
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChartIcon, CheckIcon, ChevronUpDownIcon, ResetIcon } from "@/components/icons";
import { TierBadge } from "@/components/profile/section";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { API_ROUTES, type PersonaStateResponse } from "@/lib/api-contract";
import { apiJson, friendlyError } from "@/lib/client/api";
import { useProfile } from "@/lib/client/profile-store";
import { PERSONA_LIST } from "@/lib/personas";
import { framingRounds, TIER1_ROUNDS } from "@/lib/ui/profile-format";
import type { PersonaKey } from "@/lib/types";

/** What each persona demonstrates (reviewer-facing). */
const DEMO_NOTES: Record<PersonaKey, { stage: string; blurb: string }> = {
  maya: { stage: "Super user", blurb: "Unlocked, editable profile with evidence and suggested topics." },
  dev: {
    stage: "Almost unlocked",
    blurb: `${TIER1_ROUNDS - 1}/${framingRounds(TIER1_ROUNDS)} — answer one more to see the Tier 1 reveal.`,
  },
  sam: { stage: "Brand new", blurb: "Empty state and starter prompts; nothing learned yet." },
};

export function PersonaSwitcher() {
  const { profile } = useProfile();
  const { persona } = profile;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<PersonaKey | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Outside click closes the popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Focus the current persona when the popover opens.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>("[aria-current='true']")?.focus();
  }, [open]);

  const afterChange = () => {
    router.replace("/");
    router.refresh();
  };

  const switchTo = async (key: PersonaKey) => {
    if (key === persona.key) return setOpen(false);
    setBusy(key);
    setError(null);
    try {
      await apiJson<PersonaStateResponse>(API_ROUTES.persona, { method: "POST", json: { personaKey: key } });
      afterChange();
      // The shell remounts with the new persona; keep the busy state until then.
    } catch (err) {
      setError(friendlyError(err));
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy("reset");
    setError(null);
    try {
      await apiJson<PersonaStateResponse>(API_ROUTES.personaReset, { method: "POST" });
      setConfirmReset(false);
      afterChange();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(null);
    }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={rootRef} data-slot="persona-switcher" className="relative">
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 bottom-full left-0 z-20 mb-2 animate-rise-in rounded-card border border-line bg-surface p-1.5 shadow-[0_16px_40px_-18px_rgba(43,38,33,0.4)]"
        >
          <div className="px-2.5 pt-1.5 pb-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <DemoLabel />
              Switch persona
            </p>
            <p className="mt-1 text-[0.72rem] leading-relaxed text-ink-muted">
              Each persona shows a different stage of Learning mode. Changes stay in this browser only.
            </p>
          </div>
          <ul className="space-y-0.5">
            {PERSONA_LIST.map((p) => {
              const current = p.key === persona.key;
              const note = DEMO_NOTES[p.key];
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    data-menu-item
                    aria-current={current ? "true" : undefined}
                    disabled={busy !== null}
                    onClick={() => void switchTo(p.key)}
                    className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait ${
                      current ? "bg-surface-muted" : "hover:bg-surface-muted"
                    }`}
                  >
                    <Avatar name={p.displayName} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                        {p.displayName}
                        <span className="text-xs font-normal text-ink-muted">· {note.stage}</span>
                      </span>
                      <span className="mt-0.5 block text-[0.74rem] leading-snug text-ink-muted">{note.blurb}</span>
                    </span>
                    <span className="mt-0.5 w-4 shrink-0 text-accent-ink">
                      {busy === p.key ? (
                        <>
                          <span className="lm-dots inline-flex gap-0.5" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                          <span className="sr-only">Switching</span>
                        </>
                      ) : (
                        current && (
                          <>
                            <CheckIcon className="size-4" />
                            <span className="sr-only">Current persona</span>
                          </>
                        )
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              data-menu-item
              disabled={busy !== null}
              onClick={() => {
                setOpen(false);
                setConfirmReset(true);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ResetIcon className="size-4 text-ink-muted" />
              Reset {persona.displayName} to the start
            </button>
            {/* Reviewer-facing readout of the end-of-answer experiment (E5). New tab, so the chat keeps running. */}
            <a
              href={API_ROUTES.results}
              target="_blank"
              rel="noopener"
              data-menu-item
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ChartIcon className="size-4 text-ink-muted" />
              Experiment results
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
          {error && (
            <p role="alert" className="px-2.5 pt-1 pb-1.5 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Demo persona: ${persona.displayName}, Tier ${profile.tier}. Switch or reset persona`}
        className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
          open ? "bg-line/70" : "hover:bg-line/50"
        }`}
      >
        <Avatar name={persona.displayName} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink">{persona.displayName}</span>
            <TierBadge tier={profile.tier} />
            <DemoLabel />
          </span>
          <span className="block truncate text-xs text-ink-muted" title={persona.tagline}>
            {persona.tagline}
          </span>
        </span>
        <ChevronUpDownIcon className="size-4 shrink-0 text-ink-muted" />
      </button>

      <ResetDialog
        open={confirmReset}
        name={persona.displayName}
        busy={busy === "reset"}
        error={confirmReset ? error : null}
        onCancel={() => {
          setConfirmReset(false);
          setError(null);
          // The menu item that opened the dialog is gone; return focus to the trigger.
          requestAnimationFrame(() => triggerRef.current?.focus());
        }}
        onConfirm={() => void reset()}
      />
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif text-sm font-medium text-accent-ink"
    >
      {name.slice(0, 1)}
    </span>
  );
}

function DemoLabel() {
  return (
    <span className="rounded border border-line-strong px-1 py-px text-[0.6rem] font-semibold tracking-wider text-ink-muted uppercase">
      Demo
    </span>
  );
}

function ResetDialog({
  open,
  name,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  name: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalDialog open={open} onClose={() => !busy && onCancel()} labelledBy="lm-reset-title" describedBy="lm-reset-desc">
      <div className="w-[min(24rem,calc(100vw-2rem))] animate-rise-in rounded-card border border-line bg-surface p-5 shadow-xl">
        <h2 id="lm-reset-title" className="font-serif text-lg font-medium text-ink">
          Reset {name}?
        </h2>
        <p id="lm-reset-desc" className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          {name}’s conversations, learning profile and Learn It Later queue go back to where the demo starts. Only this
          browser is affected.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-autofocus
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl px-3.5 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent-strong px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-strong-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70"
          >
            <ResetIcon className="size-4" />
            {busy ? "Resetting…" : `Reset ${name}`}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
