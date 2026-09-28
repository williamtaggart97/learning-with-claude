// Shared building blocks for the profile panel's sections (V2: learning palette).
import { useId } from "react";
import { PencilIcon } from "@/components/icons";

export function ProfileSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 id={id} className="font-serif text-base font-medium text-learn-900">
            {title}
          </h3>
          {action}
        </div>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** "You edited this" marker for user-corrected values (P3/P4). */
export function EditedMarker({ label = "You edited this" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-spark-soft px-1.5 py-px text-[0.68rem] font-medium text-spark-ink">
      <PencilIcon className="size-3" />
      {label}
    </span>
  );
}

export const smallButton =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-learn-700 transition-colors hover:bg-learn-50 focus-visible:outline-2 focus-visible:outline-learn-500 disabled:opacity-60";

export const primarySmallButton =
  "inline-flex items-center gap-1 rounded-md bg-learn-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-learn-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-learn-500 disabled:opacity-60";

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-danger">
      {message}
    </p>
  );
}

/** Tier chip (P6): Tier 2 in spark gold, Tier 1 teal, Tier 0 neutral. */
export function TierBadge({ tier }: { tier: number }) {
  return (
    <span
      className={`rounded-full px-1.5 py-px text-[0.66rem] font-semibold tracking-wide uppercase ${
        tier === 2 ? "bg-spark-soft text-spark-ink" : tier === 1 ? "bg-learn-100 text-learn-800" : "bg-surface-muted text-ink-muted"
      }`}
    >
      Tier {tier}
    </span>
  );
}
