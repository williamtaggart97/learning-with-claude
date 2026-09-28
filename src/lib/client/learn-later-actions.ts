"use client";
// Learn It Later actions (Q3). Shared by the inline callouts (Phase 3) and
// the queue view (Phase 4).
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { API_ROUTES, type DigInResponse } from "@/lib/api-contract";
import type { LearnLaterItemDTO, ProfileDTO } from "@/lib/types";
import { ApiRequestError, apiJson } from "./api";
import { useConversations } from "./conversations-store";
import { useProfile } from "./profile-store";

/** Same order as GET /api/profile within a status: newest first, then id. */
function byNewest(a: LearnLaterItemDTO, b: LearnLaterItemDTO): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
}

/** The profile with `item` listed (queued / dug in) or unlisted (dismissed). */
function withItem(profile: ProfileDTO, item: LearnLaterItemDTO): ProfileDTO {
  const rest = profile.learnLater.filter((i) => i.id !== item.id);
  const learnLater = item.status === "dismissed" ? rest : [...rest, item].sort(byNewest);
  return { ...profile, learnLater };
}

export function useLearnLaterActions() {
  const router = useRouter();
  const { upsert } = useConversations();
  const { refresh, noteItemStatus, updateProfile } = useProfile();

  /**
   * POST dig-in, then open the new conversation. The /c/[id] page derives the
   * kickoff server-side and auto-sends it once (see src/lib/ui/kickoff.ts).
   */
  const digIn = useCallback(
    async (item: LearnLaterItemDTO) => {
      const res = await apiJson<DigInResponse>(API_ROUTES.learnLaterDigIn(item.id), { method: "POST" });
      const now = new Date().toISOString();
      const dugIn: LearnLaterItemDTO = { ...item, status: "dug_in" };
      noteItemStatus(dugIn);
      updateProfile((p) => withItem(p, dugIn));
      upsert({
        id: res.conversationId,
        title: item.title,
        origin: "dig_in",
        learnLaterItemId: item.id,
        createdAt: now,
        updatedAt: now,
      });
      void refresh();
      router.push(`/c/${res.conversationId}`);
      return res;
    },
    [noteItemStatus, refresh, router, updateProfile, upsert],
  );

  /**
   * Dismiss or restore. Resolves to the item the server returned (on restore
   * that may be a different, already-queued item — R13), or null on 409
   * (state changed elsewhere; the caller should resync).
   */
  const setStatus = useCallback(
    async (item: LearnLaterItemDTO, status: "queued" | "dismissed") => {
      try {
        const updated = await apiJson<LearnLaterItemDTO>(API_ROUTES.learnLaterItem(item.id), {
          method: "PATCH",
          json: { status },
        });
        // Move the card right away (no "Dismissing…" → "Dismiss" flip-back
        // while waiting for the refetch), then resync in the background.
        // On a no-op restore (R13: another queued item covers it) this item
        // stays dismissed and the covering item is (still) listed.
        const self = updated.id === item.id ? updated : ({ ...item, status: "dismissed" } as LearnLaterItemDTO);
        noteItemStatus(self);
        updateProfile((p) => (updated.id === item.id ? withItem(p, updated) : withItem(withItem(p, self), updated)));
        void refresh();
        return updated;
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 409) return null;
        throw err;
      }
    },
    [noteItemStatus, refresh, updateProfile],
  );

  return { digIn, setStatus };
}
