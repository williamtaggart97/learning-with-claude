"use client";
// PATCH /api/profile (Tier 2 edits, P3/P4). Commits the returned ProfileDTO
// to the profile store; maps 400/403 to display-ready messages.
import { useCallback } from "react";
import { API_ROUTES } from "@/lib/api-contract";
import type { ProfileDTO, ProfilePatch } from "@/lib/types";
import { ApiRequestError, apiJson, friendlyError } from "./api";
import { useProfile } from "./profile-store";

export type PatchResult = { ok: true } | { ok: false; message: string };

export function usePatchProfile(): (patch: ProfilePatch) => Promise<PatchResult> {
  const { replaceProfile, refresh } = useProfile();
  return useCallback(
    async (patch: ProfilePatch) => {
      try {
        replaceProfile(await apiJson<ProfileDTO>(API_ROUTES.profile, { method: "PATCH", json: patch }));
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === "tier_locked") {
          void refresh();
          return { ok: false, message: "Editing unlocks at Tier 2 — your profile isn’t there yet." };
        }
        if (err instanceof ApiRequestError && err.code === "bad_request") {
          return { ok: false, message: "That value wasn’t accepted. Try something shorter or simpler." };
        }
        return { ok: false, message: friendlyError(err) };
      }
    },
    [refresh, replaceProfile],
  );
}
