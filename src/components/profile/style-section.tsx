"use client";
// "How you learn" (P2, P3): the three style dimensions as labelled spectrums
// with a confidence band. Read-only at Tier 1; adjustable at Tier 2 (PATCH
// /api/profile marks a dimension overridden — "You set this"). An overridden
// dimension's editor offers "Let Claude infer this again" (resetLearningStyle),
// which hands it back to the assessor.
import { useId, useState } from "react";
import { usePatchProfile } from "@/lib/client/profile-patch";
import { useReturnFocus } from "@/lib/client/use-return-focus";
import type { EntryPoint, LearningStyleDTO, StyleAxisDTO, StyleDimension } from "@/lib/types";
import {
  AXES,
  type AxisMeta,
  axisPositionLabel,
  axisText,
  CONFIDENCE_LABEL,
  confidenceLevel,
  describeDetail,
  describeEntryPoint,
  describeIntuition,
  ENTRY_POINT_LABEL,
  entryPointText,
  ENTRY_POINTS,
} from "@/lib/ui/profile-format";
import { InlineError, primarySmallButton, ProfileSection, smallButton } from "./section";

export function StyleSection({ style, editable }: { style: LearningStyleDTO | null; editable: boolean }) {
  return (
    <ProfileSection
      title="How you learn"
      description={
        editable
          ? "Inferred from how you answer framing questions. Adjust anything that doesn’t sound like you."
          : "Inferred from how you answer framing questions — never from a quiz."
      }
    >
      {style ? (
        <div className="space-y-3">
          <AxisCard meta={AXES[0]} axis={style.intuitionVsFormal} editable={editable} />
          <EntryPointCard entry={style.entryPoint} editable={editable} />
          <AxisCard meta={AXES[1]} axis={style.briefVsThorough} editable={editable} />
        </div>
      ) : (
        <p className="rounded-xl bg-learn-50 px-3 py-2.5 text-sm text-learn-900">
          Claude is still forming a picture of how you learn.
        </p>
      )}
    </ProfileSection>
  );
}

function ConfidenceTag({ confidence, overridden }: { confidence: number; overridden: boolean }) {
  const level = confidenceLevel(confidence, overridden);
  const cls =
    level === "set"
      ? "bg-spark-soft text-spark-ink"
      : level === "low"
        ? "text-ink-muted italic"
        : level === "early"
          ? "bg-learn-50 text-learn-700"
          : "bg-learn-100 text-learn-800";
  return <span className={`shrink-0 rounded-full px-1.5 py-px text-[0.68rem] font-medium ${cls}`}>{CONFIDENCE_LABEL[level]}</span>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-learn-100 bg-surface px-3.5 py-3">{children}</div>;
}

function AxisCard({
  meta,
  axis,
  editable,
}: {
  meta: AxisMeta;
  axis: StyleAxisDTO;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const adjustRef = useReturnFocus(editing);
  const level = confidenceLevel(axis.confidence, axis.overridden);
  const titleId = useId();

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p id={titleId} className="text-xs font-semibold text-learn-700">
          {meta.title}
        </p>
        <div className="flex items-center gap-1">
          <ConfidenceTag confidence={axis.confidence} overridden={axis.overridden} />
          {editable && !editing && (
            <button ref={adjustRef} type="button" onClick={() => setEditing(true)} className={smallButton} aria-label={`Adjust ${meta.title.toLowerCase()}`}>
              Adjust
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <AxisEditor meta={meta} axis={axis} labelledBy={titleId} onDone={() => setEditing(false)} />
      ) : (
        <>
          <Spectrum
            value={axis.value}
            confidence={axis.overridden ? 1 : axis.confidence}
            low={level === "low"}
            label={`${meta.title}: ${axisPositionLabel(meta, axis.value)}. ${CONFIDENCE_LABEL[level]}.`}
          />
          <div className="mt-1 flex justify-between text-[0.7rem] text-ink-muted">
            <span>{meta.left}</span>
            <span>{meta.right}</span>
          </div>
          <p className={`mt-1.5 text-sm leading-relaxed ${level === "low" ? "text-ink-muted" : "text-ink"}`}>
            {axisText(meta.key, axis)}
          </p>
        </>
      )}
    </Card>
  );
}

/** Track with a marker at the value and a translucent band showing uncertainty. */
function Spectrum({ value, confidence, low, label }: { value: number; confidence: number; low: boolean; label: string }) {
  const pos = ((value + 1) / 2) * 100;
  const band = Math.max(8, (1 - confidence) * 60); // % of track
  const l = Math.max(0, pos - band / 2);
  const r = Math.min(100, pos + band / 2);
  return (
    <div role="img" aria-label={label} className={`relative mt-2.5 h-2 rounded-full ${low ? "lm-hatch" : "bg-learn-100"}`}>
      <span aria-hidden="true" className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-learn-300" />
      <span
        aria-hidden="true"
        className="absolute inset-y-0 rounded-full bg-learn-300/60 transition-all duration-500"
        style={{ left: `${l}%`, width: `${r - l}%` }}
      />
      <span
        aria-hidden="true"
        className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm transition-all duration-500 ${
          low ? "border-learn-400 bg-surface" : "border-surface bg-learn-600"
        }`}
        style={{ left: `${pos}%` }}
      />
    </div>
  );
}

function AxisEditor({
  meta,
  axis,
  labelledBy,
  onDone,
}: {
  meta: AxisMeta;
  axis: StyleAxisDTO;
  labelledBy: string;
  onDone: () => void;
}) {
  const patch = usePatchProfile();
  const [draft, setDraft] = useState(Math.round(axis.value * 100));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = draft / 100;
  const unchanged = draft === Math.round(axis.value * 100);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await patch({ learningStyle: { [meta.key]: value } });
    setSaving(false);
    if (res.ok) onDone();
    else setError(res.message);
  };

  return (
    <div className="mt-2 space-y-2">
      <input
        type="range"
        min={-100}
        max={100}
        step={5}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        aria-labelledby={labelledBy}
        aria-valuetext={axisPositionLabel(meta, value)}
        className="w-full accent-[var(--color-learn-600)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-learn-500"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !unchanged) void save();
          if (e.key === "Escape") {
            e.stopPropagation();
            onDone();
          }
        }}
      />
      <div className="flex justify-between text-[0.7rem] text-ink-muted">
        <span>{meta.left}</span>
        <span>{meta.right}</span>
      </div>
      <p className="text-sm text-ink" aria-live="polite">
        <span className="font-medium">{axisPositionLabel(meta, value)}.</span>{" "}
        <span className="text-ink-muted">
          {meta.key === "intuitionVsFormal" ? describeIntuition(value) : describeDetail(value)}
        </span>
      </p>
      <InlineError message={error} />
      <div className="flex flex-wrap items-center gap-1">
        {axis.overridden && (
          <ResetToEstimate dimension={meta.key} disabled={saving} onBusy={setSaving} onError={setError} onDone={onDone} />
        )}
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={onDone} className={smallButton} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={save} className={primarySmallButton} disabled={saving || unchanged}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryPointCard({ entry, editable }: { entry: LearningStyleDTO["entryPoint"]; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const adjustRef = useReturnFocus(editing);
  const level = confidenceLevel(entry.confidence, entry.overridden);
  const titleId = useId();
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p id={titleId} className="text-xs font-semibold text-learn-700">
          Where to start
        </p>
        <div className="flex items-center gap-1">
          <ConfidenceTag confidence={entry.confidence} overridden={entry.overridden} />
          {editable && !editing && (
            <button ref={adjustRef} type="button" onClick={() => setEditing(true)} className={smallButton} aria-label="Adjust where to start">
              Adjust
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <EntryPointEditor
          value={entry.value}
          overridden={entry.overridden}
          labelledBy={titleId}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <ul
            className="mt-2.5 grid grid-cols-3 gap-1"
            aria-label={`Where to start: ${entry.value ? ENTRY_POINT_LABEL[entry.value] : "no preference yet"}. ${CONFIDENCE_LABEL[level]}.`}
          >
            {ENTRY_POINTS.map((ep) => {
              const on = ep.value === entry.value;
              return (
                <li
                  key={ep.value}
                  aria-current={on ? "true" : undefined}
                  className={`rounded-lg border px-1.5 py-1 text-center text-[0.72rem] leading-tight ${
                    on
                      ? level === "low"
                        ? "border-learn-400 border-dashed bg-learn-50 font-medium text-learn-800"
                        : "border-learn-600 bg-learn-600 font-medium text-white"
                      : "border-learn-100 text-ink-muted"
                  }`}
                >
                  {ep.label}
                </li>
              );
            })}
          </ul>
          <p className={`mt-1.5 text-sm leading-relaxed ${level === "low" ? "text-ink-muted" : "text-ink"}`}>
            {entryPointText(entry)}
          </p>
        </>
      )}
    </Card>
  );
}

function EntryPointEditor({
  value,
  overridden,
  labelledBy,
  onDone,
}: {
  value: EntryPoint | null;
  overridden: boolean;
  labelledBy: string;
  onDone: () => void;
}) {
  const patch = usePatchProfile();
  const [draft, setDraft] = useState<EntryPoint | null>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = useId();
  const options: { value: EntryPoint | null; label: string }[] = [...ENTRY_POINTS, { value: null, label: "No preference" }];

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await patch({ learningStyle: { entryPoint: draft } });
    setSaving(false);
    if (res.ok) onDone();
    else setError(res.message);
  };

  return (
    <div
      className="mt-2 space-y-2"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !saving) {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-2 gap-1">
        {options.map((o) => {
          const on = o.value === draft;
          return (
            <label
              key={o.label}
              className={`flex cursor-pointer items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-learn-500 ${
                on ? "border-learn-600 bg-learn-600 text-white" : "border-learn-200 text-learn-800 hover:bg-learn-50"
              }`}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={on}
                onChange={() => setDraft(o.value)}
              />
              {o.label}
            </label>
          );
        })}
      </div>
      <p className="text-sm text-ink-muted">{describeEntryPoint(draft)}</p>
      <InlineError message={error} />
      <div className="flex flex-wrap items-center gap-1">
        {overridden && (
          <ResetToEstimate dimension="entryPoint" disabled={saving} onBusy={setSaving} onError={setError} onDone={onDone} />
        )}
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={onDone} className={smallButton} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={save} className={primarySmallButton} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "Let Claude infer this again" for a dimension the user set: clears the
 * override (PATCH resetLearningStyle) so Claude goes back to inferring it.
 * Claude's earlier estimate isn't stored, so it restarts from a hedged
 * "still figuring this out" read (see src/lib/style-patch.ts).
 */
function ResetToEstimate({
  dimension,
  disabled,
  onBusy,
  onError,
  onDone,
}: {
  dimension: StyleDimension;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onDone: () => void;
}) {
  const patch = usePatchProfile();
  const hintId = useId();
  const reset = async () => {
    onBusy(true);
    onError(null);
    const res = await patch({ resetLearningStyle: [dimension] });
    onBusy(false);
    if (res.ok) onDone();
    else onError(res.message);
  };
  return (
    <>
      <span id={hintId} className="sr-only">
        Claude will go back to inferring this from how you learn.
      </span>
      <button
        type="button"
        onClick={reset}
        disabled={disabled}
        aria-describedby={hintId}
        title="Claude will go back to inferring this from how you learn"
        className={smallButton}
      >
        Let Claude infer this again
      </button>
    </>
  );
}
