// /results — readout for the end-of-answer slot experiment (E5). Behind the
// passcode gate like every page (src/proxy.ts matches all non-asset paths).
// Aggregates across ALL demo sessions; shows counts and rates only.
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { getSlotResults, type MeanCell, type RateCell } from "@/lib/slot/results";
import type { SlotVariant } from "@/lib/types";

export const metadata: Metadata = { title: "Slot experiment results · Learning mode" };

const VARIANT_LABEL: Record<SlotVariant, string> = {
  card: "A · Learn It Later card",
  walkthrough: "B · Walk me through it",
  quickcheck: "C · Quick check",
  apply: "D · Apply it to your project",
  none: "E · Nothing (control)",
};

function pct(c: RateCell | null): string {
  if (!c || c.rate === null) return "—";
  return `${Math.round(c.rate * 100)}%`;
}

function Rate({ c }: { c: RateCell | null }) {
  if (!c) return <span className="text-ink-faint">n/a</span>;
  return (
    <span>
      {pct(c)} <span className="text-ink-faint">({c.count}/{c.n})</span>
    </span>
  );
}

function Mean({ m }: { m: MeanCell }) {
  if (m.mean === null) return <span>—</span>;
  return (
    <span>
      {m.mean >= 0 ? "+" : ""}
      {m.mean.toFixed(3)} <span className="text-ink-faint">(n={m.n})</span>
    </span>
  );
}

const th = "px-3 py-2 text-left font-medium text-ink-muted whitespace-nowrap";
const td = "px-3 py-2 align-top whitespace-nowrap tabular-nums";

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-surface-muted/60">
          <tr>
            {head.map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const rowCls = "border-b border-line last:border-0";

export default async function ResultsPage({ searchParams }: PageProps<"/results">) {
  await connection(); // request-time: always fresh data
  const { forced } = await searchParams;
  const includeForced = forced === "1";
  const r = await getSlotResults({ includeForced });
  const totalWeight = Object.entries(r.weights)
    .filter(([v]) => r.enabled[v as SlotVariant])
    .reduce((a, [, w]) => a + w, 0);
  const na = <span className="text-ink-faint">n/a</span>;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <p className="text-sm text-ink-muted">
        <Link href="/" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
          Back to chat
        </Link>
      </p>
      <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight sm:text-4xl">End-of-answer slot: results</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Every lookup and task answer ends with at most one box, drawn at random per answer (E1, E4). The featured
        hidden decision is always saved to Learn It Later (E3). Results are grouped by the variant that was{" "}
        <em>drawn</em> (intent-to-treat), so a draw whose content wasn&apos;t ready in time still counts under its own
        arm. Demo traffic is far too small to reach significance: read this as proof the instrumentation works, not as
        a verdict. With real traffic, move to a bandit (e.g. Thompson sampling).
      </p>
      {!r.active && (
        <p className="mt-3 max-w-2xl rounded-card border border-line bg-surface-muted/60 px-4 py-3 text-sm text-ink-muted">
          The experiment is currently <strong>inactive</strong> (EXPERIMENT_ACTIVE is off): new answers are not drawn or
          logged. Anything below is from earlier active periods.
        </p>
      )}
      {r.totals.truncated && (
        <p className="mt-3 max-w-2xl rounded-card border border-line bg-surface-muted/60 px-4 py-3 text-sm text-ink-muted">
          <strong>Truncated:</strong> only the newest {r.totals.maxRows.toLocaleString()} impressions are included.
        </p>
      )}

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Impressions", String(r.totals.impressions)],
          ["Demo users", String(r.totals.users)],
          ["Engaged in session", pct(r.totals.engagedInSession)],
          ["Ended right after", pct(r.totals.endedAfter)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-card border border-line bg-surface px-4 py-3">
            <div className="text-xs text-ink-muted">{label}</div>
            <div className="mt-1 font-serif text-2xl">{value}</div>
          </div>
        ))}
      </section>
      <p className="mt-2 text-xs text-ink-faint">
        Engaged = the box was used within {r.sessionWindowMinutes} minutes (control excluded). Generated{" "}
        {new Date(r.generatedAt).toUTCString()}.
        {includeForced
          ? " Including dev-forced impressions (debug view)."
          : r.totals.forcedExcluded > 0 && ` ${r.totals.forcedExcluded} dev-forced impression(s) excluded.`}
        {r.totals.censored > 0 &&
          ` ${r.totals.censored} impression(s) younger than ${r.sessionWindowMinutes} minutes are left out of the guardrail.`}
        {r.totals.userGone > 0 &&
          ` ${r.totals.userGone} impression(s) belong to demo users that were since reset: they keep their primary metric but drop out of the secondary metrics and the guardrail.`}
      </p>

      <h2 className="mt-10 font-serif text-xl font-medium">By drawn variant (intent-to-treat)</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Primary: engaged in the same session. Secondary: dig-ins on the featured item within 7 days, walk-throughs
        completed, quick checks correct (among answered ones), mastery change on the featured concept. Guardrail: the
        conversation ended right after the answer.
      </p>
      <Table
        head={[
          "Drawn variant",
          "Weight",
          "Drawn",
          "Engaged (session)",
          "Dig-in ≤ 7d",
          "Walk-through done",
          "Quick check correct",
          "Mastery Δ ≤ 7d",
          "Ended after (guardrail)",
        ]}
      >
        {r.byVariant.map((v) => (
          <tr key={v.variant} className={rowCls}>
            <td className={`${td} font-medium`}>{VARIANT_LABEL[v.variant]}</td>
            <td className={td}>
              {r.enabled[v.variant]
                ? `${r.weights[v.variant]}${totalWeight ? ` (${Math.round((r.weights[v.variant] / totalWeight) * 100)}%)` : ""}`
                : "off"}
            </td>
            <td className={td}>
              {v.impressions} <span className="text-ink-faint">/ {v.eligibleImpressions} eligible</span>
            </td>
            <td className={td}>{v.variant === "none" ? na : <Rate c={v.engagedInSession} />}</td>
            <td className={td}>
              <Rate c={v.digIn7d} />
            </td>
            <td className={td}>
              <Rate c={v.framingCompleted} />
            </td>
            <td className={td}>
              <Rate c={v.quickcheckCorrect} />
            </td>
            <td className={td}>
              <Mean m={v.masteryDelta7d} />
            </td>
            <td className={td}>
              <Rate c={v.endedAfter} />
            </td>
          </tr>
        ))}
      </Table>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-faint">
        <li>
          Walk-through needs a concept not yet framed in the conversation; apply needs known projects or data. Because
          eligibility differs, compare those arms with the eligibility-conditional table below, not this one.
        </li>
        <li>
          Dig-in ≤ 7d: a dig-in (from the slot or the Learn It Later queue) is credited only to the latest impression of
          that item before it, and only once the dig-in chat has a message.
        </li>
        <li>
          Mastery Δ ≤ 7d: sum of assessor evidence on the featured concept in the 7 days after the impression; quick-check
          evidence is excluded so arm C isn&apos;t credited for its own measurement. Caveats: windows of impressions that
          feature the same concept overlap, so one mastery change can be credited to several impressions (and arms); the
          evidence log keeps the newest 30 entries (older windows fall back to the score snapshotted at impression time);
          it is an association, not a causal effect.
        </li>
        <li>
          Guardrail: ended = no engagement and no user-typed follow-up within {r.sessionWindowMinutes} minutes. Messages
          created by the slot itself (walk-through / apply) and the replies to them don&apos;t count as follow-ups.
        </li>
        <li>
          Timing: walk-through, quick-check and apply draws wait up to {(r.contentWaitMs / 1000).toFixed(1)}s after the
          answer for their generated content, so their answers finish slightly later than card / control ones.
        </li>
      </ul>

      <h2 className="mt-10 font-serif text-xl font-medium">Eligibility-conditional comparisons</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Each variant against the card and the control, only among impressions where that variant was eligible (so
        every arm saw the same kind of answers).
      </p>
      <Table head={["Eligible for", "Arm (drawn)", "Drawn", "Engaged (session)", "Dig-in ≤ 7d", "Ended after"]}>
        {r.conditional.flatMap((c) =>
          c.arms.map((a, i) => (
            <tr key={`${c.variant}-${a.arm}`} className={i === c.arms.length - 1 ? rowCls : "border-b border-line/50"}>
              <td className={`${td} font-medium`}>
                {i === 0 ? (
                  <>
                    {VARIANT_LABEL[c.variant]} <span className="text-ink-faint">({c.eligibleImpressions})</span>
                  </>
                ) : null}
              </td>
              <td className={td}>{VARIANT_LABEL[a.arm]}</td>
              <td className={td}>{a.impressions}</td>
              <td className={td}>{a.engagedInSession ? <Rate c={a.engagedInSession} /> : na}</td>
              <td className={td}>
                <Rate c={a.digIn7d} />
              </td>
              <td className={td}>
                <Rate c={a.endedAfter} />
              </td>
            </tr>
          )),
        )}
      </Table>

      <h2 className="mt-10 font-serif text-xl font-medium">Shown variant and fallbacks</h2>
      <p className="mt-1 text-sm text-ink-muted">
        What users actually saw. A walk-through, quick-check or apply draw whose generated content wasn&apos;t ready
        (or failed) falls back to the card; the fallback rate is per drawn variant. Engagement by shown variant is
        descriptive only (it is not randomized).
      </p>
      <Table head={["Variant", "Drawn", "Fell back", "Shown", "Engaged (session, by shown)"]}>
        {r.byVariant.map((v) => {
          const shown = r.byShown.find((s) => s.variant === v.variant)!;
          return (
            <tr key={v.variant} className={rowCls}>
              <td className={`${td} font-medium`}>{VARIANT_LABEL[v.variant]}</td>
              <td className={td}>{v.impressions}</td>
              <td className={td}>
                <Rate c={v.fellBack} />
              </td>
              <td className={td}>{shown.impressions}</td>
              <td className={td}>{v.variant === "none" ? na : <Rate c={shown.engagedInSession} />}</td>
            </tr>
          );
        })}
      </Table>

      <h2 className="mt-10 font-serif text-xl font-medium">By featured rank (E2)</h2>
      <p className="mt-1 text-sm text-ink-muted">
        The router ranks up to 3 hidden decisions; rank 1 is featured {Math.round(r.topPickProbability * 100)}% of the
        time, otherwise a lower rank at random. If lower ranks engage as well as rank 1, the ranking isn&apos;t
        tracking what users care about. Control draws are excluded. Observed rank-1 share where the draw had a choice:{" "}
        {r.rankDraw.share === null ? "—" : `${Math.round(r.rankDraw.share * 100)}%`}{" "}
        <span className="text-ink-faint">
          ({r.rankDraw.rank1}/{r.rankDraw.randomizable})
        </span>
        .
      </p>
      <Table head={["Featured item", "Drawn", "Engaged (session)", "Dig-in ≤ 7d"]}>
        {r.byRank.map((row) => (
          <tr key={row.label} className={rowCls}>
            <td className={`${td} font-medium`}>{row.label}</td>
            <td className={td}>{row.impressions}</td>
            <td className={td}>
              <Rate c={row.engagedInSession} />
            </td>
            <td className={td}>
              <Rate c={row.digIn7d} />
            </td>
          </tr>
        ))}
      </Table>

      <h2 className="mt-10 font-serif text-xl font-medium">Engagements</h2>
      <ul className="mt-2 text-sm text-ink-muted">
        {Object.keys(r.engagementKinds).length === 0 ? (
          <li>None yet.</li>
        ) : (
          Object.entries(r.engagementKinds).map(([k, n]) => (
            <li key={k}>
              <span className="font-mono text-ink">{k}</span>: {n}
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
