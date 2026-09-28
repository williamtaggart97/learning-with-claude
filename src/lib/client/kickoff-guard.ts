// Dig-in kickoff guard (R9). Module-level so it survives React strict-mode's
// double effect invocation and remounts within the same tab. Refresh safety
// comes from the server: the kickoff is only offered while the conversation
// has zero messages (see src/lib/ui/kickoff.ts).
const kickedOff = new Set<string>();

/** Returns true exactly once per conversation id (per tab), until released. */
export function claimKickoff(conversationId: string): boolean {
  if (kickedOff.has(conversationId)) return false;
  kickedOff.add(conversationId);
  return true;
}

/** The kickoff failed before streaming: allow it to be sent again. */
export function releaseKickoff(conversationId: string): void {
  kickedOff.delete(conversationId);
}
