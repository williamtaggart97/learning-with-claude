// Demo persona metadata (X4). Pure data — safe on server and client. The
// seed (prisma/seed-data) writes displayName onto template users; the
// persona switcher shows displayName + tagline.
import type { PersonaKey, PersonaSummary } from "./types";

export const PERSONAS: Record<PersonaKey, PersonaSummary> = {
  maya: {
    key: "maya",
    displayName: "Maya",
    tagline: "Junior marketer · email & paid social · profile unlocked",
  },
  dev: {
    key: "dev",
    displayName: "Dev",
    tagline: "MS data science · churn capstone · one exchange from unlocking",
  },
  sam: {
    key: "sam",
    displayName: "Sam",
    tagline: "Brand new · no history yet",
  },
};

export const PERSONA_LIST: PersonaSummary[] = [PERSONAS.maya, PERSONAS.dev, PERSONAS.sam];
