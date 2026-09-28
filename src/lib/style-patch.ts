// Learning-style corrections (P3, PATCH /api/profile). Pure — no DB, no
// server-only import — so tests can exercise it directly.
//
// Setting a dimension: value as given, confidence 1 ("the user told us"; 0
// for entryPoint = null, i.e. "no preference"), `*Overridden = true`. The
// assessor never touches overridden dimensions.
//
// Resetting a dimension ("Let Claude infer this again", resetLearningStyle):
// the override is cleared so the assessor infers it again. Claude's earlier
// estimate is NOT restored: the assessor stops updating a dimension once it
// is overridden and the edit overwrote the inferred value, so there is no
// stored estimate to go back to. Instead the dimension is re-derived
// conservatively: it keeps its current value as a weak starting point (the
// user's own setting is still a decent prior) with confidence
// RESET_CONFIDENCE, which the UI shows as "Still figuring this out" and which
// the assessor's confidence-weighted smoothing moves away from quickly as new
// signals arrive (for entryPoint, below 0.3 the next differing signal simply
// replaces it). Resetting a dimension that isn't overridden is a no-op.
import type { EntryPoint, ProfilePatch, StyleDimension } from "@/lib/types";

/** Confidence after a reset: below LOW_CONFIDENCE (0.3), so it reads as "still figuring this out". */
export const RESET_CONFIDENCE = 0.15;

/** The LearningStyle columns a patch can change. */
export interface StyleFields {
  intuitionVsFormal: number;
  intuitionVsFormalConfidence: number;
  intuitionVsFormalOverridden: boolean;
  entryPoint: EntryPoint | null;
  entryPointConfidence: number;
  entryPointOverridden: boolean;
  briefVsThorough: number;
  briefVsThoroughConfidence: number;
  briefVsThoroughOverridden: boolean;
}

const overriddenKey = (d: StyleDimension) => `${d}Overridden` as const;
const confidenceKey = (d: StyleDimension) => `${d}Confidence` as const;

/**
 * The column updates for a patch's `learningStyle` edits and
 * `resetLearningStyle` resets, given the current row (null when the user has
 * no LearningStyle row yet). Returns only the columns that change; an empty
 * object means nothing to write.
 */
export function stylePatchData(
  current: StyleFields | null,
  patch: Pick<ProfilePatch, "learningStyle" | "resetLearningStyle">,
): Partial<StyleFields> {
  const data: Partial<StyleFields> = {};
  const ls = patch.learningStyle ?? {};

  if (ls.intuitionVsFormal !== undefined) {
    Object.assign(data, {
      intuitionVsFormal: ls.intuitionVsFormal,
      intuitionVsFormalConfidence: 1,
      intuitionVsFormalOverridden: true,
    });
  }
  if (ls.entryPoint !== undefined) {
    // Clearing the entry point (null) means "no preference": nothing to be confident about.
    Object.assign(data, {
      entryPoint: ls.entryPoint,
      entryPointConfidence: ls.entryPoint === null ? 0 : 1,
      entryPointOverridden: true,
    });
  }
  if (ls.briefVsThorough !== undefined) {
    Object.assign(data, {
      briefVsThorough: ls.briefVsThorough,
      briefVsThoroughConfidence: 1,
      briefVsThoroughOverridden: true,
    });
  }

  for (const dim of new Set(patch.resetLearningStyle ?? [])) {
    if (!current?.[overriddenKey(dim)]) continue; // nothing to hand back
    data[overriddenKey(dim)] = false;
    data[confidenceKey(dim)] = Math.min(current[confidenceKey(dim)], RESET_CONFIDENCE);
  }
  return data;
}
