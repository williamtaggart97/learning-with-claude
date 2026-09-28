import type { PersonaStateResponse } from "@/lib/api-contract";
import { parseJsonBody, withErrors } from "@/lib/http";
import { PERSONA_LIST, PERSONAS } from "@/lib/personas";
import { PersonaSwitchRequestSchema } from "@/lib/schemas";
import { getPersonaKey, getSessionId, getUserFor, setPersonaCookie } from "@/lib/session";

/** GET /api/persona — current persona + switcher list. */
export const GET = withErrors(async () => {
  const body: PersonaStateResponse = { current: PERSONAS[await getPersonaKey()], personas: PERSONA_LIST };
  return Response.json(body);
});

/** POST /api/persona — switch persona: set the cookie and ensure this session's clone exists. */
export const POST = withErrors(async (request: Request) => {
  const body = await parseJsonBody(request, PersonaSwitchRequestSchema);
  if (!body.ok) return body.response;
  const { personaKey } = body.data;
  await getUserFor(await getSessionId(), personaKey);
  await setPersonaCookie(personaKey);
  const res: PersonaStateResponse = { current: PERSONAS[personaKey], personas: PERSONA_LIST };
  return Response.json(res);
});
