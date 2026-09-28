import type { NextRequest } from "next/server";
import { apiError, normalizeLearnLaterTitle } from "@/lib/api-contract";
import { db, Prisma } from "@/lib/db";
import { learnLaterItemInclude, toLearnLaterItemDTO } from "@/lib/dto";
import { parseJsonBody, withErrors } from "@/lib/http";
import { LearnLaterPatchSchema } from "@/lib/schemas";
import { getSessionUser } from "@/lib/session";

function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

/**
 * PATCH /api/learn-later/[id] — dismiss or restore an item → LearnLaterItemDTO.
 *
 * Allowed transitions: queued → dismissed, dismissed → queued. Anything else
 * (e.g. an item that was dug into, or a no-op) → 409 conflict.
 *
 * Restore keeps R13's "one queued item per concept" rule: if another queued
 * item already covers the same concept (or, with no concept, the same
 * normalized title), the restore is a no-op — this item stays dismissed and
 * the EXISTING queued item is returned (200), so the UI can show that one.
 */
export const PATCH = withErrors(async (request: NextRequest, ctx: RouteContext<"/api/learn-later/[id]">) => {
  const { id } = await ctx.params;
  const body = await parseJsonBody(request, LearnLaterPatchSchema);
  if (!body.ok) return body.response;
  const user = await getSessionUser();
  const to = body.data.status;
  const from = to === "dismissed" ? "queued" : "dismissed";

  if (to === "queued") {
    const item = await db.learnLaterItem.findFirst({
      where: { id, userId: user.id },
      select: { status: true, conceptId: true, title: true },
    });
    if (!item) return apiError(404, "not_found", "Learn It Later item not found");
    if (item.status !== from) return apiError(409, "conflict", `Can't restore an item that is ${item.status}`);

    const queued = await db.learnLaterItem.findMany({
      where: { userId: user.id, status: "queued", id: { not: id }, conceptId: item.conceptId },
      include: learnLaterItemInclude,
      orderBy: { createdAt: "asc" },
    });
    const key = normalizeLearnLaterTitle(item.title);
    const existing = item.conceptId ? queued[0] : queued.find((q) => normalizeLearnLaterTitle(q.title) === key);
    if (existing) return Response.json(toLearnLaterItemDTO(existing));
  }

  try {
    // Status in the where clause makes the transition check atomic.
    const updated = await db.learnLaterItem.update({
      where: { id, userId: user.id, status: from },
      data: { status: to },
      include: learnLaterItemInclude,
    });
    return Response.json(toLearnLaterItemDTO(updated));
  } catch (err) {
    if (!isNotFound(err)) throw err;
    const current = await db.learnLaterItem.findFirst({ where: { id, userId: user.id }, select: { status: true } });
    if (!current) return apiError(404, "not_found", "Learn It Later item not found");
    return apiError(409, "conflict", `Can't change an item from ${current.status} to ${to}`);
  }
});
