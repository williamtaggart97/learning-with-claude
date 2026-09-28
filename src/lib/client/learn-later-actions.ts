"use client";
// Learn It Later actions (Q3). Shared by the inline callouts (Phase 3) and
// the queue view (Phase 4).
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { API_ROUTES, type DigInResponse } from "@/lib/api-contract";
import { withLearnLaterItem as withItem } from "@/lib/learn-later-list";
import type { LearnLaterItemDTO } from "@/lib/types";
import { ApiRequestError, apiJson } from "./api";
import { useConversations } from "./conversations-store";
import { useProfile } from "./profile-store";

export function useLearnLaterActions() {
  const router = useRouter();
  const { upsert } = useConversations();
  const { refresh, updateProfile } = useProfile();

  /**
   * POST dig-in, then open the new conversation. The /c/[id] page derives the
   * kickoff server-side and auto-sends it once (see src/lib/ui/kickoff.ts).
   * `endpoint` defaults to the Learn It Later dig-in; the end-of-answer slot
   * passes POST /api/slot/[id]/dig-in (same response, also logs the
   * engagement, R15). `onStarted` runs just before navigating (e.g. to mark
   * the slot "Dug in" for when the user comes back).
   */
  const digIn = useCallback(
    async (item: LearnLaterItemDTO, opts?: { endpoint?: string; onStarted?: (res: DigInResponse, item: LearnLaterItemDTO) => void }) => {
      const res = await apiJson<DigInResponse>(opts?.endpoint ?? API_ROUTES.learnLaterDigIn(item.id), { method: "POST" });
      const now = new Date().toISOString();
      const dugIn: LearnLaterItemDTO = { ...item, status: "dug_in" };
      opts?.onStarted?.(res, dugIn);
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
    [refresh, router, updateProfile, upsert],
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
        updateProfile((p) => (updated.id === item.id ? withItem(p, updated) : withItem(withItem(p, self), updated)));
        void refresh();
        return updated;
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 409) return null;
        throw err;
      }
    },
    [refresh, updateProfile],
  );

  return { digIn, setStatus };
}
