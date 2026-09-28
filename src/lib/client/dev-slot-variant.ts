// Dev-only: force the end-of-answer slot variant from the page URL (R15).
// Open e.g. /?slotVariant=quickcheck and the chat forwards it to
// POST /api/chat?slotVariant=quickcheck. Remembered for the tab
// (sessionStorage) because the URL changes to /c/[id] after the first answer;
// ?slotVariant=off clears it. The server ignores the override in production
// and when the variant isn't eligible; this helper is inert in production too.
import { API_ROUTES } from "@/lib/api-contract";

const KEY = "lm-dev-slot-variant";
const VARIANTS = ["card", "walkthrough", "quickcheck", "apply", "none"] as const;
/** Window event fired when the override is set or cleared (the dev badge listens). */
export const DEV_SLOT_VARIANT_EVENT = "lm-dev-slot-variant-change";

/** The active dev override (reads ?slotVariant= into sessionStorage first), or null. Always null in production. */
export function devSlotOverride(): string | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("slotVariant");
    if (fromUrl !== null) {
      if ((VARIANTS as readonly string[]).includes(fromUrl)) sessionStorage.setItem(KEY, fromUrl);
      else sessionStorage.removeItem(KEY);
    }
    const stored = sessionStorage.getItem(KEY);
    return stored && (VARIANTS as readonly string[]).includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Drop the override for this tab (and a ?slotVariant= in the current URL). */
export function clearDevSlotOverride(): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
    const url = new URL(window.location.href);
    if (url.searchParams.has("slotVariant")) {
      url.searchParams.delete("slotVariant");
      window.history.replaceState(window.history.state, "", url);
    }
  } catch {
    /* storage blocked: nothing to clear */
  }
  window.dispatchEvent(new Event(DEV_SLOT_VARIANT_EVENT));
}

/** POST /api/chat, with the dev-only variant override when one is set. */
export function chatUrl(): string {
  const v = devSlotOverride();
  return v ? `${API_ROUTES.chat}?slotVariant=${encodeURIComponent(v)}` : API_ROUTES.chat;
}
