// Offline checks for PATCH /api/profile learning-style edits and
// "Let Claude infer this again" (resetLearningStyle). No network, no database.
//
// Run: node --conditions=react-server --import tsx --test tests/*.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ProfilePatchSchema } from "@/lib/schemas";
import { RESET_CONFIDENCE, stylePatchData, type StyleFields } from "@/lib/style-patch";
import { LOW_CONFIDENCE } from "@/lib/ui/profile-format";

const inferred: StyleFields = {
  intuitionVsFormal: -0.4,
  intuitionVsFormalConfidence: 0.7,
  intuitionVsFormalOverridden: false,
  entryPoint: "worked_example",
  entryPointConfidence: 0.6,
  entryPointOverridden: false,
  briefVsThorough: 0.3,
  briefVsThoroughConfidence: 0.5,
  briefVsThoroughOverridden: false,
};

test("setting a dimension overrides it with confidence 1", () => {
  assert.deepEqual(stylePatchData(inferred, { learningStyle: { briefVsThorough: -0.8 } }), {
    briefVsThorough: -0.8,
    briefVsThoroughConfidence: 1,
    briefVsThoroughOverridden: true,
  });
  // entryPoint null = "no preference": nothing to be confident about.
  assert.deepEqual(stylePatchData(null, { learningStyle: { entryPoint: null } }), {
    entryPoint: null,
    entryPointConfidence: 0,
    entryPointOverridden: true,
  });
});

test("reset clears the override, keeps the value as a weak prior at low confidence", () => {
  const edited: StyleFields = { ...inferred, briefVsThorough: -0.8, briefVsThoroughConfidence: 1, briefVsThoroughOverridden: true };
  const data = stylePatchData(edited, { resetLearningStyle: ["briefVsThorough"] });
  assert.deepEqual(data, { briefVsThoroughOverridden: false, briefVsThoroughConfidence: RESET_CONFIDENCE });
  assert.ok(RESET_CONFIDENCE < LOW_CONFIDENCE, "reads as 'still figuring this out' (below LOW_CONFIDENCE)");
  assert.equal("briefVsThorough" in data, false, "value untouched");
});

test("reset of an entry point the user cleared to 'no preference' keeps confidence 0", () => {
  const cleared: StyleFields = { ...inferred, entryPoint: null, entryPointConfidence: 0, entryPointOverridden: true };
  assert.deepEqual(stylePatchData(cleared, { resetLearningStyle: ["entryPoint"] }), {
    entryPointOverridden: false,
    entryPointConfidence: 0,
  });
});

test("reset is a no-op for dimensions that aren't overridden, or without a row", () => {
  assert.deepEqual(stylePatchData(inferred, { resetLearningStyle: ["intuitionVsFormal", "entryPoint"] }), {});
  assert.deepEqual(stylePatchData(null, { resetLearningStyle: ["briefVsThorough"] }), {});
});

test("edits and resets of different dimensions combine; duplicates are harmless", () => {
  const edited: StyleFields = { ...inferred, intuitionVsFormalOverridden: true, intuitionVsFormalConfidence: 1 };
  assert.deepEqual(
    stylePatchData(edited, {
      learningStyle: { entryPoint: "code" },
      resetLearningStyle: ["intuitionVsFormal", "intuitionVsFormal"],
    }),
    {
      entryPoint: "code",
      entryPointConfidence: 1,
      entryPointOverridden: true,
      intuitionVsFormalOverridden: false,
      intuitionVsFormalConfidence: RESET_CONFIDENCE,
    },
  );
});

test("ProfilePatchSchema: resetLearningStyle is validated and can't overlap edits", () => {
  assert.ok(ProfilePatchSchema.safeParse({ resetLearningStyle: ["briefVsThorough"] }).success);
  assert.ok(ProfilePatchSchema.safeParse({ resetLearningStyle: [] }).success);
  assert.equal(ProfilePatchSchema.safeParse({ resetLearningStyle: ["tone"] }).success, false);
  const overlap = ProfilePatchSchema.safeParse({
    learningStyle: { briefVsThorough: 0.5 },
    resetLearningStyle: ["briefVsThorough"],
  });
  assert.equal(overlap.success, false);
  // entryPoint: null is an edit ("no preference"), so it also overlaps a reset.
  assert.equal(
    ProfilePatchSchema.safeParse({ learningStyle: { entryPoint: null }, resetLearningStyle: ["entryPoint"] }).success,
    false,
  );
  assert.ok(
    ProfilePatchSchema.safeParse({ learningStyle: { entryPoint: null }, resetLearningStyle: ["briefVsThorough"] }).success,
  );
});
