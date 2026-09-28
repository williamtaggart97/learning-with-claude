"use client";
// Dev-only pill shown while an end-of-answer variant is forced
// (?slotVariant=…, see src/lib/client/dev-slot-variant.ts), so a forced arm
// isn't mistaken for the real draw. Compiled out of production builds.
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clearDevSlotOverride, devSlotOverride, DEV_SLOT_VARIANT_EVENT } from "@/lib/client/dev-slot-variant";

function DevSlotBadgeImpl() {
  const pathname = usePathname();
  const [variant, setVariant] = useState<string | null>(null);

  useEffect(() => {
    // Read after mount (sessionStorage), on navigation and when cleared.
    const read = () => setVariant(devSlotOverride());
    read();
    window.addEventListener(DEV_SLOT_VARIANT_EVENT, read);
    return () => window.removeEventListener(DEV_SLOT_VARIANT_EVENT, read);
  }, [pathname]);

  if (!variant) return null;
  return (
    <div
      role="note"
      aria-label="Developer override"
      className="fixed right-3 bottom-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface/95 px-3 py-1 font-mono text-[0.7rem] text-ink-muted shadow-sm"
    >
      <span>
        slot forced: <span className="font-semibold text-ink">{variant}</span>
      </span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={clearDevSlotOverride}
        className="rounded underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-learn-500"
      >
        clear
      </button>
    </div>
  );
}

/** Renders nothing in production (NODE_ENV is inlined, so the pill is dead code there). */
export const DevSlotBadge: () => React.ReactNode =
  process.env.NODE_ENV === "production" ? () => null : DevSlotBadgeImpl;
