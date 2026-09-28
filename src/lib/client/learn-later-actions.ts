"use client";
// Learn It Later actions (Q3). Shared by the inline callouts (Phase 3) and
// the queue view (Phase 4).
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { API_ROUTES, type DigInResponse } from "@/lib/api-contract";
import type { LearnLaterItemDTO } from "@/lib/types";
import { ApiRequestError, apiJson } from "./api";
import { useConversations } from "./conversations-store";
import { useProfile } from "./profile-store";

export function useLearnLaterActions() {
  const router = useRouter();
  const { upsert } = useConversations();
  const { refresh } = useProfile();

  /**
   * POST dig-in, then open the new conversation. The /c/[id] page derives the
   * kickoff server-side and auto-sends it once (see src/lib/ui/kickoff.ts).
   */
  const digIn = useCallback(
    async (item: LearnLaterItemDTO) => {
      const res = await apiJson<DigInResponse>(API_ROUTES.learnLaterDigIn(item.id), { method: "POST" });
      const now = new Date().toISOString();
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
    [refresh, router, upsert],
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
        void refresh();
        return updated;
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 409) return null;
        throw err;
      }
    },
    [refresh],
  );

  return { digIn, setStatus };
}
