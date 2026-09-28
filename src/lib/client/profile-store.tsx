"use client";
// Client profile store (R12, X7).
//
//   const { profile, refresh, lastUnlock, clearUnlock } = useProfile();
//   useTierUnlocked((u) => showCelebration(u.tier));   // Phase 4
//
// The chat session drives it:
//   const turn = beginTurn();          // before sending: snapshot tier + lastAssessedAt
//   applyProgress(progressEvent);      // `progress` stream event → immediate unlock signal
//   afterAnswer(turn);                 // after `done`: poll GET /api/profile at
//                                      // ~1.5s/4s/8s/12s, stop once lastAssessedAt changes;
//                                      // a tier increase not already signalled → unlock
//                                      // signal with source "assessor"
//
// Seeded from the server-rendered ProfileDTO; the provider is remounted when
// the session user changes (persona switch / reset), so it never mixes users.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { TIER_THRESHOLDS } from "@/config";
import { API_ROUTES, type ProgressEvent } from "@/lib/api-contract";
import type { ProfileDTO, Tier } from "@/lib/types";
import { apiJson } from "./api";

export interface TierUnlock {
  tier: Tier;
  /** "progress" = the framing-answer stream said so; "assessor" = seen while polling. */
  source: "progress" | "assessor";
  /** Date.now() when signalled. */
  at: number;
}

export interface TurnSnapshot {
  tier: Tier;
  lastAssessedAt: string | null;
}

type UnlockListener = (unlock: TierUnlock) => void;

interface ProfileContextValue {
  profile: ProfileDTO;
  /** Refetch GET /api/profile now. Resolves to the fresh profile (or the current one on failure). */
  refresh: () => Promise<ProfileDTO>;
  /** Adopt a ProfileDTO the server just returned (e.g. from PATCH /api/profile). */
  replaceProfile: (next: ProfileDTO) => void;
  /** Apply a local change to the latest profile (optimistic/confirmed updates before a refresh). */
  updateProfile: (fn: (current: ProfileDTO) => ProfileDTO) => void;
  /** Most recent unlock signal, until clearUnlock(). */
  lastUnlock: TierUnlock | null;
  clearUnlock: () => void;
  /** Subscribe to unlock signals; returns an unsubscribe fn. Prefer useTierUnlocked(). */
  subscribeUnlock: (listener: UnlockListener) => () => void;
  // ── Used by the chat session ──
  beginTurn: () => TurnSnapshot;
  applyProgress: (event: ProgressEvent) => void;
  afterAnswer: (turn: TurnSnapshot) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Poll offsets after `done` (R12: ~1.5s/4s/8s/12s), plus one late fallback.
 * The 20s poll is deliberately beyond R12's schedule: a long answer can keep
 * the assessor busy past 12s, and without it an assessor-driven Tier unlock
 * (e.g. 8 concepts) would go unnoticed until the next turn. It stops early
 * like the others once lastAssessedAt changes, so it usually never fires.
 */
const POLL_SCHEDULE_MS = [1500, 4000, 8000, 12000, 20000];

export function ProfileProvider({ initialProfile, children }: { initialProfile: ProfileDTO; children: React.ReactNode }) {
  const [profile, setProfile] = useState(initialProfile);
  const [lastUnlock, setLastUnlock] = useState<TierUnlock | null>(null);
  const profileRef = useRef(profile);
  const listeners = useRef(new Set<UnlockListener>());
  /** Highest tier already announced, so polling never re-announces a `progress` unlock. */
  const celebratedTier = useRef<Tier>(initialProfile.tier);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const commit = useCallback((next: ProfileDTO) => {
    profileRef.current = next;
    setProfile(next);
  }, []);

  const updateProfile = useCallback(
    (fn: (current: ProfileDTO) => ProfileDTO) => commit(fn(profileRef.current)),
    [commit],
  );

  const signalUnlock = useCallback((tier: Tier, source: TierUnlock["source"]) => {
    if (tier <= celebratedTier.current) return;
    celebratedTier.current = tier;
    const unlock: TierUnlock = { tier, source, at: Date.now() };
    setLastUnlock(unlock);
    console.info(`[learning-mode] Tier ${tier} unlocked (${source})`);
    for (const l of listeners.current) {
      try {
        l(unlock);
      } catch (err) {
        console.error("tierUnlocked listener failed", err);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await apiJson<ProfileDTO>(API_ROUTES.profile);
      commit(next);
      return next;
    } catch (err) {
      console.warn("Profile refresh failed", err);
      return profileRef.current;
    }
  }, [commit]);

  const beginTurn = useCallback(
    (): TurnSnapshot => ({ tier: profileRef.current.tier, lastAssessedAt: profileRef.current.lastAssessedAt }),
    [],
  );

  const applyProgress = useCallback(
    (event: ProgressEvent) => {
      const current = profileRef.current;
      // The meter reports framing rounds only while that is the closest path;
      // at Tier 1 it may switch to concepts. Keep answeredFramingCount
      // consistent with the tier either way: Tier 1 (unlike Tier 2, which 8
      // concepts alone can reach) implies at
      // least the Tier 1 threshold (so the celebration never shows a stale
      // "4 framing rounds"). A later refresh() replaces it with the exact count.
      let answeredFramingCount =
        event.progress.metric === "framing_exchanges" ? event.progress.current : current.answeredFramingCount;
      if (event.progress.tier === 1 || event.unlocked === 1) {
        answeredFramingCount = Math.max(answeredFramingCount, TIER_THRESHOLDS.tier1.framingExchanges);
      }
      commit({
        ...current,
        tier: event.progress.tier,
        progress: event.progress,
        answeredFramingCount,
      });
      if (event.unlocked !== null) signalUnlock(event.unlocked, "progress");
    },
    [commit, signalUnlock],
  );

  const afterAnswer = useCallback(
    (turn: TurnSnapshot) => {
      let settled = false;
      const own: ReturnType<typeof setTimeout>[] = [];
      const stop = () => {
        settled = true;
        for (const t of own) {
          clearTimeout(t);
          timers.current.delete(t);
        }
      };
      for (const delay of POLL_SCHEDULE_MS) {
        const t = setTimeout(async () => {
          timers.current.delete(t);
          if (settled) return;
          const next = await refresh();
          if (settled) return;
          if (next.tier > turn.tier) signalUnlock(next.tier, "assessor");
          if (next.lastAssessedAt !== turn.lastAssessedAt) stop();
        }, delay);
        own.push(t);
        timers.current.add(t);
      }
    },
    [refresh, signalUnlock],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);

  const subscribeUnlock = useCallback((listener: UnlockListener) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);

  const clearUnlock = useCallback(() => setLastUnlock(null), []);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      refresh,
      replaceProfile: commit,
      updateProfile,
      lastUnlock,
      clearUnlock,
      subscribeUnlock,
      beginTurn,
      applyProgress,
      afterAnswer,
    }),
    [
      profile,
      refresh,
      commit,
      updateProfile,
      lastUnlock,
      clearUnlock,
      subscribeUnlock,
      beginTurn,
      applyProgress,
      afterAnswer,
    ],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside <ProfileProvider>");
  return ctx;
}

/** Run `handler` whenever a tier unlock is signalled (Phase 4: celebration). */
export function useTierUnlocked(handler: UnlockListener): void {
  const { subscribeUnlock } = useProfile();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => subscribeUnlock((u) => ref.current(u)), [subscribeUnlock]);
}
