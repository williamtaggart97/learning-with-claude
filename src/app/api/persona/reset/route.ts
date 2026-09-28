import type { PersonaStateResponse } from "@/lib/api-contract";
import { withErrors } from "@/lib/http";
import { resetPersona } from "@/lib/persona";
import { PERSONA_LIST, PERSONAS } from "@/lib/personas";
import { getPersonaKey, getSessionId } from "@/lib/session";

/** POST /api/persona/reset — re-seed the current persona for this session (X6). */
export const POST = withErrors(async () => {
  const [sessionId, personaKey] = await Promise.all([getSessionId(), getPersonaKey()]);
  await resetPersona(sessionId, personaKey);
  const body: PersonaStateResponse = { current: PERSONAS[personaKey], personas: PERSONA_LIST };
  return Response.json(body);
});
