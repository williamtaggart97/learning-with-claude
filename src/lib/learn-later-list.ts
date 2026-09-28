// Pure Learn It Later list moves for the client's optimistic profile updates
// (dismiss, restore, dig in). Mirrors GET /api/profile's ordering so a card
// lands where the refetch will put it. No I/O; unit-tested.
import type { LearnLaterItemDTO, ProfileDTO } from "@/lib/types";

/** Dismissed items listed in the profile, most recently dismissed first (same cap as GET /api/profile). */
export const MAX_DISMISSED_LEARN_LATER = 50;

const STATUS_ORDER = { queued: 0, dug_in: 1, dismissed: 2 } as const;

/** Same order as GET /api/profile: queued first, then dug in; newest first within a status, then id. */
export function compareLearnLater(a: LearnLaterItemDTO, b: LearnLaterItemDTO): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * The profile with `item` (in its new state) moved to the right list: the live
 * queue (queued / dug in) or the front of the dismissed list, which is capped
 * at MAX_DISMISSED_LEARN_LATER. The item is removed from wherever it was.
 */
export function withLearnLaterItem<P extends Pick<ProfileDTO, "learnLater" | "dismissedLearnLater">>(
  profile: P,
  item: LearnLaterItemDTO,
): P {
  const rest = profile.learnLater.filter((i) => i.id !== item.id);
  const restDismissed = profile.dismissedLearnLater.filter((i) => i.id !== item.id);
  return item.status === "dismissed"
    ? { ...profile, learnLater: rest, dismissedLearnLater: [item, ...restDismissed].slice(0, MAX_DISMISSED_LEARN_LATER) }
    : { ...profile, learnLater: [...rest, item].sort(compareLearnLater), dismissedLearnLater: restDismissed };
}

/**
 * The freshest known state of `item`: the profile's copy when it lists the
 * item (e.g. dismissed from the queue panel since the answer loaded), else
 * `item` itself.
 */
export function liveLearnLaterItem(
  profile: Pick<ProfileDTO, "learnLater" | "dismissedLearnLater">,
  item: LearnLaterItemDTO,
): LearnLaterItemDTO {
  return profile.learnLater.find((i) => i.id === item.id) ?? profile.dismissedLearnLater.find((i) => i.id === item.id) ?? item;
}
