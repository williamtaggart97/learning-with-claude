// The concept catalog lives in src/lib/concept-catalog.ts so app code (router
// context, suggested topics) can import it; re-exported here for the seed.
export { CONCEPT_CATALOG, CONCEPTS_BY_SLUG, conceptCatalogForPrompt } from "../../src/lib/concept-catalog";
export type { CatalogConcept } from "../../src/lib/concept-catalog";
