"use client";
// "What I know about your work" (P4): field, projects, data types. Read-only
// at Tier 1; editable at Tier 2 (chips, PATCH /api/profile → userEdited).
import { useEffect, useId, useRef, useState } from "react";
import { CloseIcon, PencilIcon, PlusIcon } from "@/components/icons";
import { usePatchProfile } from "@/lib/client/profile-patch";
import { useReturnFocus } from "@/lib/client/use-return-focus";
import type { UserContextDTO } from "@/lib/types";
import { EditedMarker, InlineError, primarySmallButton, ProfileSection, smallButton } from "./section";

export function ContextSection({ context, editable }: { context: UserContextDTO | null; editable: boolean }) {
  const ctx: UserContextDTO = context ?? { field: null, projects: [], dataTypes: [], notes: null, userEdited: false };
  const empty = !ctx.field && !ctx.projects.length && !ctx.dataTypes.length;

  return (
    <ProfileSection
      title="What I know about your work"
      description={editable ? "Picked up from your chats. Fix anything that’s off — answers use it for examples." : "Picked up from your chats and used to pick relevant examples."}
      action={ctx.userEdited ? <EditedMarker /> : undefined}
    >
      {empty && !editable ? (
        <p className="rounded-xl bg-learn-50 px-3 py-2.5 text-sm text-learn-900">Nothing yet — mention your field or project and it’ll show up here.</p>
      ) : (
        <dl className="space-y-3 rounded-xl border border-learn-100 bg-surface px-3.5 py-3">
          <FieldRow value={ctx.field} editable={editable} />
          <ChipsRow label="Projects" field="projects" items={ctx.projects} editable={editable} addLabel="Add a project" />
          <ChipsRow label="Data you work with" field="dataTypes" items={ctx.dataTypes} editable={editable} addLabel="Add a data type" />
          {ctx.notes && (
            <div>
              <dt className="text-xs font-semibold text-learn-700">Notes</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-ink">{ctx.notes}</dd>
            </div>
          )}
        </dl>
      )}
    </ProfileSection>
  );
}

function FieldRow({ value, editable }: { value: string | null; editable: boolean }) {
  const patch = usePatchProfile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const editRef = useReturnFocus(editing);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await patch({ userContext: { field: draft.trim() || null } });
    setSaving(false);
    if (res.ok) setEditing(false);
    else setError(res.message);
  };

  return (
    <div>
      <dt className="flex items-center justify-between gap-2 text-xs font-semibold text-learn-700">
        <label htmlFor={editing ? inputId : undefined}>Field</label>
        {editable && !editing && (
          <button
            ref={editRef}
            type="button"
            onClick={() => {
              setDraft(value ?? "");
              setEditing(true);
            }}
            className={smallButton}
            aria-label="Edit field"
          >
            <PencilIcon className="size-3" />
            Edit
          </button>
        )}
      </dt>
      <dd className="mt-0.5">
        {editing ? (
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input
              id={inputId}
              autoFocus
              value={draft}
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditing(false);
                }
              }}
              placeholder="e.g. MPH epidemiology"
              className="w-full rounded-lg border border-learn-200 bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-learn-500 focus:ring-2 focus:ring-learn-100"
            />
            <InlineError message={error} />
            <div className="flex justify-end gap-1">
              <button type="button" onClick={() => setEditing(false)} className={smallButton} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className={primarySmallButton} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <p className={`text-sm ${value ? "text-ink" : "text-ink-muted italic"}`}>{value ?? "Not known yet"}</p>
        )}
      </dd>
    </div>
  );
}

function ChipsRow({
  label,
  field,
  items,
  editable,
  addLabel,
}: {
  label: string;
  field: "projects" | "dataTypes";
  items: string[];
  editable: boolean;
  addLabel: string;
}) {
  const patch = usePatchProfile();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  // The "Add…" button: focus returns here when the add form closes, and after
  // removing the last chip.
  const addRef = useReturnFocus(adding);
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  /** After a removal: the chip whose remove button gets focus, or "add". */
  const focusAfter = useRef<{ item: string } | "add" | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const setFocusAfter = (target: { item: string } | "add") => {
    focusAfter.current = target;
    setFocusTick((t) => t + 1);
  };

  // Runs once the chips have re-rendered (and are enabled again) after a removal.
  useEffect(() => {
    const pending = focusAfter.current;
    if (pending === null || busy) return;
    focusAfter.current = null;
    (pending === "add" ? addRef.current : removeRefs.current.get(pending.item))?.focus();
  }, [focusTick, busy, items, addRef]);

  const remove = async (item: string) => {
    const index = items.indexOf(item);
    const next = items.filter((i) => i !== item);
    const following = next[index]; // the chip after the removed one, if any
    if (await commit(next)) setFocusAfter(following !== undefined ? { item: following } : "add");
    else setFocusAfter({ item });
  };

  const commit = async (next: string[]) => {
    setBusy(true);
    setError(null);
    const res = await patch({ userContext: { [field]: next } });
    setBusy(false);
    if (!res.ok) setError(res.message);
    return res.ok;
  };

  const add = async () => {
    const text = draft.trim();
    if (!text) return setAdding(false);
    if (items.some((i) => i.toLowerCase() === text.toLowerCase())) {
      setDraft("");
      return setAdding(false);
    }
    if (await commit([...items, text])) {
      setDraft("");
      setAdding(false);
    }
  };

  return (
    <div>
      <dt className="text-xs font-semibold text-learn-700">{label}</dt>
      <dd className="mt-1">
        {items.length === 0 && !editable && <p className="text-sm text-ink-muted italic">Not known yet</p>}
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item}
              className="inline-flex max-w-full items-start gap-1 rounded-lg border border-learn-100 bg-learn-50 py-1 pr-1 pl-2 text-xs leading-snug text-learn-900"
            >
              <span className="min-w-0 py-px break-words">{item}</span>
              {editable ? (
                <button
                  ref={(el) => {
                    if (el) removeRefs.current.set(item, el);
                    else removeRefs.current.delete(item);
                  }}
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(item)}
                  aria-label={`Remove ${item}`}
                  className="shrink-0 rounded p-0.5 text-learn-600 hover:bg-learn-100 hover:text-learn-900 focus-visible:outline-2 focus-visible:outline-learn-500 disabled:opacity-60"
                >
                  <CloseIcon className="size-3" />
                </button>
              ) : (
                <span className="w-1" />
              )}
            </li>
          ))}
          {editable && !adding && (
            <li>
              <button
                ref={addRef}
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-learn-300 px-2 py-1 text-xs font-medium text-learn-700 hover:bg-learn-50 focus-visible:outline-2 focus-visible:outline-learn-500"
              >
                <PlusIcon className="size-3" />
                {addLabel}
              </button>
            </li>
          )}
        </ul>
        {adding && (
          <form
            className="mt-1.5 flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              {addLabel}
            </label>
            <input
              id={inputId}
              autoFocus
              value={draft}
              maxLength={160}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setAdding(false);
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-learn-200 bg-surface px-2.5 py-1 text-sm text-ink outline-none focus:border-learn-500 focus:ring-2 focus:ring-learn-100"
            />
            <button type="submit" className={primarySmallButton} disabled={busy}>
              {busy ? "Adding…" : "Add"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className={smallButton} disabled={busy}>
              Cancel
            </button>
          </form>
        )}
        <div className="mt-1">
          <InlineError message={error} />
        </div>
      </dd>
    </div>
  );
}
