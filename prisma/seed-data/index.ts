import { dev } from "./dev";
import { maya } from "./maya";
import { sam } from "./sam";
import type { SeedPersona } from "./types";

export { CONCEPT_CATALOG } from "./concepts";
export const SEED_PERSONAS: SeedPersona[] = [maya, dev, sam];
