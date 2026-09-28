// Sam — brand new (X4). No history: the empty state with starter prompts.
// The seed still creates default (empty, zero-confidence) LearningStyle and
// UserContext rows so every user has them; the assessor can update in place.
import type { SeedPersona } from "./types";

export const sam: SeedPersona = {
  key: "sam",
  displayName: "Sam",
  createdDaysAgo: 0,
  style: null,
  context: null,
  masteries: [],
  conversations: [],
  learnLater: [],
};
