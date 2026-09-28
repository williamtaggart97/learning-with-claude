// Maya — marketing associate ~10 months into her first marketing job, at
// Quillhaven (a fictional DTC home-textiles brand: towels, bedding, table
// linen; Shopify store). Owns email, helps with paid social. Not a coder —
// Klaviyo, Meta Ads Manager, GA4 and Google Sheets (Tier 2 "super user", X4).
//
// Realism rules for this file (the seeded turns must look like live output):
//   - Claude only uses what it could see: the current conversation plus the
//     profile (context.notes carries the standing "key numbers"). Anything
//     else an answer relies on is stated by Maya in that conversation.
//   - Framing questions follow FRAMING_QUESTION_RULES (src/lib/claude/prompts.ts).
//   - Framed exchanges in one conversation never share a concept slug:
//     planRoute (L9) would have answered the later one immediately.
//   - Lookup answers never mention Learn It Later (the answerer can't know).
//   - A concept's first evidence delta includes the 0.3 new-concept baseline
//     (the assessor's own delta stays ≤ 0.25); score = sum of deltas.
//
// Facts used consistently across conversations:
//   Klaviyo "90-day engaged" segment ~22,000 · "opened in 180 days" segment
//   ~29,000 · ~60% of opens come from Apple Mail.
//   Welcome email 1 subject-line test (4 weeks): 1,150 per variant · opens A
//   599 (52.1%) vs B 647 (56.3%) · clicks 81 (7.0%) vs 87 (7.6%) · orders 32
//   vs 35. ~2,300 new subscribers per 4 weeks.
//   Email campaigns — July: 5 sends, 110,000 recipients, 2.3% click rate,
//   344 orders, $31,900 (AOV ≈ $93), revenue per recipient $0.29. August: 6
//   sends, 174,300 recipients, 3,137 clicks (1.8%), 436 orders (placed order
//   rate 0.25%), $41,420, AOV $95, RPR $0.24. Flows in August: $38,600.
//   Store (Shopify): ~2,150 first-time customers a month · AOV $96 · ~58,000
//   customers all-time · gross margin ~60% (break-even ROAS 1.67) · median
//   118 days between 1st and 2nd order · 28% reorder within 12 months (~1.4
//   orders per customer in year one).
//   Paid media $60,000/month: Meta $42,000 (Meta-reported ROAS 3.1, 7-day
//   click / 1-day view, ≈ $31 per purchase; GA4 credits Meta ~$61,000 ≈ 1.45)
//   · Google $18,000 (Google Ads-reported ROAS 4.6; ~40% of it branded
//   search). Blended paid CAC ≈ $28. Manager: Dana, Head of Growth.
//
// Tier 2 via BOTH paths: 15 answered framing exchanges (+1 skipped) and 15
// concepts. Dollar signs in markdown answers are escaped (\$); a single "$"
// is literal in the renderer either way (inline math is $$…$$ only).
import { md, type SeedPersona } from "./types";

export const maya: SeedPersona = {
  key: "maya",
  displayName: "Maya",
  createdDaysAgo: 26,

  context: {
    field: "Marketing associate, DTC e-commerce (email + paid social)",
    projects: [
      "Welcome series: A/B testing subject lines on the first email",
      "Monthly report: campaign performance summary for her manager",
      "Budget case: how to split paid spend between Meta and Google (learning attribution)",
    ],
    dataTypes: [
      "Klaviyo campaign and flow metrics",
      "Meta Ads Manager reporting",
      "GA4 traffic and conversions",
      "Shopify orders export (in Google Sheets)",
    ],
    notes:
      "Works at Quillhaven, a DTC home-textiles brand (towels, bedding, table linen) on Shopify. Uses Klaviyo, Meta Ads Manager, GA4 and Google Sheets (formulas, no code). Her manager Dana (Head of Growth) wants revenue before opens and reads reports on her phone — short summaries, clear \"so what\". Key numbers: gross margin ~60%; paid spend ~$60k/month (Meta $42k, Google $18k; ~40% of Google is branded search); ~2,150 new customers a month; AOV ~$96; median 118 days between first and second order; 28% reorder within 12 months (~1.4 orders per customer in year one); ~60% of email opens are Apple Mail; Klaviyo segments: 90-day engaged ~22k, opened in last 180 days ~29k.",
  },

  style: {
    intuitionVsFormal: -0.7,
    intuitionVsFormalConfidence: 0.76,
    entryPoint: "worked_example",
    entryPointConfidence: 0.72,
    briefVsThorough: -0.35,
    briefVsThoroughConfidence: 0.68,
    evidence: [
      {
        dimension: "intuitionVsFormal",
        ref: "c1.x3",
        note: "Asked for the sample-size answer in \"plain English please\" because she's \"not a stats person.\"",
      },
      {
        dimension: "intuitionVsFormal",
        ref: "c3.x2",
        note: "Worked out break-even ROAS by reasoning through a single dollar of spend (\"if we spend 1 and get 1.67 back\") rather than from a formula.",
      },
      {
        dimension: "entryPoint",
        ref: "c2.x2",
        note: "Brought her own July and August numbers to explain the drop in revenue per recipient rather than asking for the general rule.",
      },
      {
        dimension: "entryPoint",
        ref: "c4.x2",
        note: "Brought two concrete customers (R2-F5-M5 vs. R5-F1-M5) to understand RFM scores — learns from cases more than definitions.",
      },
      {
        dimension: "briefVsThorough",
        ref: "c2.l1",
        note: "Asked for a four-sentence summary her manager can read on her phone.",
      },
      {
        dimension: "briefVsThorough",
        ref: "c3.l2",
        note: "Asked for \"just the formula\" mid-spreadsheet — wants short, usable answers while working.",
      },
    ],
  },

  masteries: [
    {
      slug: "ab-testing-basics",
      evidence: [
        { ref: "c1.x1", delta: 0.45, note: "Knew unprompted that two identical subject lines would still get slightly different open rates by chance, and picked orders as the result that matters." },
        { ref: "c1.x3", delta: 0.1, note: "Picked the smallest lift worth acting on (7% → 8% click rate) herself before asking about sample size." },
        { ref: "c5.x4", delta: -0.1, note: "Assumed two ads in one Meta ad set are shown evenly at random — delivery shifts toward the early leader." },
      ],
    },
    {
      slug: "p-values",
      evidence: [
        { ref: "c1.x1", delta: 0.2, note: "Thought a significance test starts by assuming B is better; it starts from \"A and B perform the same\" and asks how surprising the gap would be." },
      ],
    },
    {
      slug: "statistical-power",
      evidence: [
        { ref: "c1.x3", delta: 0.45, note: "Knew a rate from 100 sends wobbles more than one from 10,000; the ~10,900-per-version figure for a 1-point lift was new." },
        { ref: "c5.x4", delta: 0.15, note: "Recalled that ~30 orders per version told her nothing and asked for 100+ purchases per ad before calling a winner." },
      ],
    },
    {
      slug: "open-rate-caveats",
      evidence: [
        { ref: "c1.x2", delta: 0.3, note: "Didn't know how Klaviyo detects an open; saw that open rate depends on opens but missed that click-to-open rate does too." },
        { ref: "c2.x3", delta: -0.1, note: "Defined an engaged subscriber as \"opened in the last 90 days\" — an open-based definition that Apple machine opens inflate." },
      ],
    },
    {
      slug: "funnel-metrics",
      evidence: [
        { ref: "c2.x1", delta: 0.4, note: "Laid out the steps from receiving a campaign to buying; didn't know the difference between click rate and click-to-open rate." },
        { ref: "c2.x2", delta: 0.1, note: "Knew that revenue per recipient divides revenue by emails delivered." },
        { ref: "c2.l1", delta: 0.05, note: "Chose revenue, revenue per recipient, placed order rate and AOV — not open rate — as the numbers for her manager's summary." },
      ],
    },
    {
      slug: "average-order-value",
      evidence: [
        { ref: "c2.x1", delta: 0.45, note: "Computed AOV (≈ $95) from August's campaign orders and revenue without help." },
      ],
    },
    {
      slug: "customer-segmentation",
      evidence: [
        { ref: "c2.x2", delta: 0.45, note: "Traced the change to her own segment switch (90-day engaged → everyone who opened in 180 days)." },
        { ref: "c4.x1", delta: 0.15, note: "Judged a customer who's been quiet for 90 days against the 118-day repeat gap as most likely just between orders." },
        { ref: "c5.x3", delta: 0.1, note: "Picked past bedding buyers as the likeliest first-week buyers and saw that never-purchased subscribers still need proof the quality is worth it." },
      ],
    },
    {
      slug: "email-deliverability",
      evidence: [
        { ref: "c2.x3", delta: 0.45, note: "Knew that when many recipients ignore or delete your emails, Gmail sends more of your next campaign to spam." },
      ],
    },
    {
      slug: "rfm-segmentation",
      evidence: [
        { ref: "c4.x1", delta: 0.45, note: "Knew what recency, frequency and monetary mean before the explanation." },
        { ref: "c4.x2", delta: 0.1, note: "Worked out that 10 months without an order is about 2.5 of her customers' usual gaps." },
      ],
    },
    {
      slug: "cohort-retention",
      evidence: [
        { ref: "c4.x3", delta: 0.45, note: "Knew customers usually take about 4 months to reorder and that someone who first bought in August has had only about a month." },
      ],
    },
    {
      slug: "marketing-attribution-models",
      evidence: [
        { ref: "c3.x1", delta: 0.45, note: "Knew last-click gives the sale to the final touch (Google) and that Meta counts 7-day click / 1-day view; thought GA4 can see ad views when cookies are accepted." },
        { ref: "c3.l1", delta: 0.05, note: "Asked how GA4's data-driven model assigns credit — a sensible next question after seeing last-click's bias." },
        { ref: "c5.x4", delta: 0.05, note: "Asked on her own whether attribution inflation undermines comparing two Meta ads." },
      ],
    },
    {
      slug: "roas",
      evidence: [
        { ref: "c3.x2", delta: 0.45, note: "Derived break-even ROAS at 60% margin (≈ 1.67) herself by reasoning through one dollar of spend." },
        { ref: "c3.x2", delta: -0.1, note: "Thought Meta's ROAS splits new from returning customers by default — the standard column doesn't." },
      ],
    },
    {
      slug: "customer-acquisition-cost",
      evidence: [
        { ref: "c3.x2", delta: 0.25, note: "Answered \"I don't know\" on what it cost to win one new customer in August — she'd never worked it out." },
        { ref: "c4.x2", delta: 0.15, note: "Recalled the ~$28 cost of a new customer from her budget work and used it to compare win-back with acquisition." },
      ],
    },
    {
      slug: "positioning",
      evidence: [
        { ref: "c5.x1", delta: 0.4, note: "Told benefits from features and named what customers would buy instead; described the target customer by demographics rather than situation." },
        { ref: "c5.x2", delta: 0.05, note: "Recognized that launch-email readers already know the brand, unlike cold ad audiences." },
      ],
    },
    {
      slug: "copywriting-frameworks",
      evidence: [
        { ref: "c5.x2", delta: 0.4, note: "Knew AIDA from a course; saw that a cold scroller only stops for something that bugs them — the starting point of problem-first copy." },
        { ref: "c5.l1", delta: 0.1, note: "Asked for PAS-structured ad copy with a first line sized for Meta's truncation — applying the framework right away." },
      ],
    },
  ],

  learnLater: [
    {
      ref: "ll-incrementality",
      conceptSlug: "incrementality-testing",
      title: "Incrementality: what ads actually cause",
      preview:
        "Attribution tells you which ads touched a sale, not whether the sale would have happened without them. Holdout and geo-lift tests withhold ads from a random group or region and compare sales — the only way to measure what a channel adds.",
      appliedContext:
        "You wanted to split the Meta vs. Google budget using GA4's numbers. About 40% of Google spend is branded search, which mostly catches people who were already looking for Quillhaven.",
      origin: "skipped",
      status: "queued",
      source: { turnRef: "c3.x3", message: "user" },
    },
    {
      ref: "ll-peeking",
      conceptSlug: "multiple-comparisons",
      title: "Peeking: why you can't stop a test the moment it looks significant",
      preview:
        "Every time you check an A/B test and ask \"is it significant yet?\" you run another test. Stopping the first time it crosses p < 0.05 makes false winners far more likely than 5%. Fix the sample size in advance, or use a method built for continuous monitoring.",
      appliedContext:
        "Your welcome-series test needs ~10,900 subscribers per version to detect a 1-point click lift — months of traffic, which makes checking early very tempting.",
      origin: "flagged",
      status: "queued",
      source: { turnRef: "c1.x3", message: "answer" },
    },
    {
      ref: "ll-email-attribution",
      conceptSlug: "marketing-attribution-models",
      title: "What \"attributed\" email revenue counts",
      preview:
        "Klaviyo credits an order to an email when it happens within its attribution window after an open or click. Some of those buyers would have ordered anyway, and opens-based credit is inflated by Apple Mail, so attributed revenue overstates what email caused.",
      appliedContext: "Your summary for Dana leads with 80,020 dollars in attributed email revenue.",
      origin: "flagged",
      status: "queued",
      source: { turnRef: "c2.l1", message: "answer" },
    },
    {
      ref: "ll-ltv",
      conceptSlug: "customer-lifetime-value",
      title: "Customer lifetime value beyond the first year",
      preview:
        "A 12-month gross-profit estimate is a solid start. Lifetime value models go further — projecting how many customers keep buying, and how often — which changes how much you can afford to pay for a new customer.",
      appliedContext:
        "Your 12-month estimate (~1.4 orders, roughly 81 dollars of gross profit per customer) against a ~28-dollar CAC is the core of the Meta vs. Google budget case.",
      origin: "flagged",
      status: "queued",
      source: { turnRef: "c3.x2", message: "answer" },
    },
    {
      ref: "ll-cohort",
      conceptSlug: "survival-analysis",
      title: "Retention curves that use every customer",
      preview:
        "A fixed-window repeat rate has to leave out customers who haven't had the full window yet. A retention (survival) curve counts each customer for as long as you've actually observed them, so recent cohorts contribute too, and it shows where repeat buying drops off.",
      appliedContext:
        "Your 90-day cohort table has to wait on 2026 Q2 and leave out Q3; a retention curve by months since first order would include them.",
      origin: "flagged",
      status: "queued",
      source: { turnRef: "c4.x3", message: "answer" },
    },
  ],

  conversations: [
    // ── C1 ──────────────────────────────────────────────────────────────────
    {
      ref: "c1",
      title: "Is my welcome-email subject line test real?",
      daysAgo: 24,
      startHour: 19.5,
      turns: [
        {
          kind: "exchange",
          ref: "c1.x1",
          user: "We A/B tested the subject line on email 1 of our welcome series for four weeks. A (\"Welcome to Quillhaven — here's 10% off\") got a 52.1% open rate and B (\"Your 10% off is inside (plus our best-selling towel)\") got 56.3%. 1,150 people got each one. Klaviyo marked B the winner. Can I tell my manager B wins?",
          framingIntro: "Before calling it, three quick questions about what a test like this can tell you.",
          conceptSlugs: ["ab-testing-basics", "p-values"],
          questions: [
            {
              id: "q1",
              format: "short_answer",
              prompt: "If A and B were secretly the exact same subject line, would you expect them to get exactly the same open rate? Why or why not?",
            },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "Klaviyo's significance check starts from an assumption about A and B. Which one?",
              options: ["B performs better than A", "A and B perform the same", "A performs better than B"],
            },
            {
              id: "q3",
              format: "multiple_choice",
              prompt: "Which result from this test would Dana care about most?",
              options: ["Opens per email sent", "Clicks per email sent", "Orders per email sent"],
            },
          ],
          responses: [
            {
              questionId: "q1",
              answer: "No — even with the same subject line each version gets a slightly different mix of people, so the rates would wobble a bit.",
              dontKnow: false,
            },
            { questionId: "q2", answer: "B performs better than A", dontKnow: false },
            { questionId: "q3", answer: "Orders per email sent", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Is an A/B test result real?",
            preview: "Two identical emails still get different results by chance; a test asks whether the gap is bigger than that noise.",
            appliedContext: "You were about to report subject line B as the winner of your welcome-email test.",
            conceptSlug: "ab-testing-basics",
          },
          thinkMinutes: 3,
          answer: md`
            You've got the core idea exactly right: even two identical subject lines would come out a little different, because each version goes to a different random slice of new subscribers. An A/B test asks whether B's lead is **bigger than that wobble**.

            ### What the significance check assumes
            This is the one to correct. The check starts from the opposite of what you picked: it assumes **A and B perform the same**, then asks how often chance alone would produce a gap as big as yours. That "how often" is the p-value.

            | | A | B |
            |---|---|---|
            | Recipients | 1,150 | 1,150 |
            | Opens | 599 (52.1%) | 647 (56.3%) |

            - **p ≈ 0.04**: if the subject lines were identical, a gap this large would show up about 4% of the time. That's somewhat surprising, so Klaviyo calls it significant.
            - It is **not** a 96% chance that B is better. The plausible range for B's true lift is about **+0.1 to +8.2 points** (the 95% confidence interval), so B probably gets more opens, but the real advantage could be almost nothing.

            ### Judge it on what Dana cares about
            You're right that orders matter most, and opens are the weakest measure here for another reason: Apple Mail can record an "open" for an email nobody read. Before you call B the winner, check clicks and orders for each version. If B leads there too, you have a much stronger story.
          `,
        },
        {
          kind: "exchange",
          ref: "c1.x2",
          user: "Wait, Apple can create opens that aren't real?? Klaviyo shows open rate first on every report. Clicks were 81 (A) vs 87 (B), and orders 32 vs 35.",
          framingIntro: "Yes, and it changes which number you should trust. Two questions:",
          conceptSlugs: ["open-rate-caveats"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "How does Klaviyo know that someone opened an email?",
              options: ["The reader clicks any link in it", "The inbox app reports every read", "A hidden image in it gets loaded"],
            },
            {
              id: "q2",
              format: "multi_select",
              prompt: "Which of these metrics use opens in their calculation?",
              options: ["Open rate", "Click rate", "Click-to-open rate", "Placed order rate"],
            },
          ],
          responses: [
            { questionId: "q1", answer: null, dontKnow: true },
            { questionId: "q2", answer: ["Open rate"], dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Why open rates are inflated",
            preview: "Apple Mail Privacy Protection pre-loads emails, so many recorded opens never happened. Clicks and orders aren't affected.",
            appliedContext: "Your subject-line test was judged on open rate.",
            conceptSlug: "open-rate-caveats",
          },
          thinkMinutes: 2,
          answer: md`
            Start with the "I don't know": every marketing email carries a tiny invisible image (a **tracking pixel**). When it loads, Klaviyo records an open. Nobody reports reads directly.

            ### Where Apple comes in
            Since iOS 15 (September 2021), Apple Mail users with **Mail Privacy Protection** on get their emails pre-loaded by Apple's servers, pixel included. Klaviyo sees the pixel load and records an open whether or not the person ever looked. With roughly 60% of your opens coming from Apple Mail, a large share of them are machine opens, and they happen no matter what the subject line says.

            Open rate is affected, as you said. So is **click-to-open rate**: it's clicks ÷ opens, so machine opens inflate its denominator. Click rate (clicks ÷ delivered) and placed order rate don't touch opens at all.

            ### Your test on clicks and orders

            | | A | B |
            |---|---|---|
            | Click rate | 81 / 1,150 = 7.0% | 87 / 1,150 = 7.6% |
            | Orders | 32 (2.8%) | 35 (3.0%) |

            On clicks, **p ≈ 0.63**, with B's true lift anywhere from about −1.6 to +2.6 points: no detectable difference. Orders are too few (30-ish per version) to say anything.

            ### What to tell Dana
            > "B got more opens, but opens are inflated by Apple Mail. On clicks and orders there's no measurable difference yet, so I'm keeping the test running rather than calling a winner."
          `,
        },
        {
          kind: "exchange",
          ref: "c1.x3",
          user: "Ok that's deflating. How many people would I need for the test to actually tell me something about clicks? Plain English please, I'm not a stats person.",
          framingIntro: "It mostly comes down to one number only you can pick. Two questions:",
          conceptSlugs: ["statistical-power"],
          questions: [
            {
              id: "q1",
              format: "short_answer",
              prompt: "What's the smallest improvement in click rate that would actually be worth switching subject lines for? (Your baseline is about 7%.)",
            },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "Which click rate would wobble more by chance from send to send?",
              options: ["One from 100 sends", "One from 10,000 sends", "Both about the same"],
            },
          ],
          responses: [
            { questionId: "q1", answer: "Probably 1 point, so 7% to 8%. Anything smaller isn't worth the effort.", dontKnow: false },
            { questionId: "q2", answer: "One from 100 sends", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Sample size for A/B tests",
            preview: "How many people a test needs depends on your baseline rate and the smallest lift worth detecting.",
            appliedContext: "Your welcome-email test had 1,150 people per version.",
            conceptSlug: "statistical-power",
          },
          thinkMinutes: 2,
          answer: md`
            Both answers are the whole story. Small groups wobble a lot, so a real 1-point lift can hide inside the noise; the test needs enough people that the wobble shrinks below the lift you care about. And picking that lift (you chose 7% → 8%) is the most important decision in planning a test.

            ### Your numbers
            With the usual settings (95% significance, and an 80% chance of catching a real lift of that size), which is what any online sample-size calculator uses:

            | Lift to detect | Subscribers per version | At ~2,300 new subscribers / 4 weeks |
            |---|---|---|
            | 7% → 8% (+1 pt) | ~10,900 | ~9 months |
            | 7% → 9% (+2 pts) | ~2,900 | ~10 weeks |

            The rule of thumb: **halving the lift you want to detect roughly quadruples the people you need.**

            ### Practical options
            1. **Test bigger swings.** Subject lines that differ by one word rarely move clicks by 2 points. Test genuinely different ideas (offer-first vs. product-first vs. curiosity) so a real difference is more likely to be big enough to see.
            2. **Test on campaigns instead.** One campaign to your 180-day segment (~29,000) gives ~14,500 per version in a single send. If your campaigns click at around 2%, that's enough to detect roughly 2.0% → 2.5%.
            3. **Decide the sample size before you start**, and don't stop the moment it looks like a winner: checking daily and stopping early produces a lot of false winners.

            For the welcome series, option 1 plus patience is realistic: ~10 weeks for a bold variant is a fair ask to bring to Dana.
          `,
        },
      ],
    },

    // ── C2 ──────────────────────────────────────────────────────────────────
    {
      ref: "c2",
      title: "August email report: which numbers to lead with",
      daysAgo: 19,
      startHour: 14.5,
      turns: [
        {
          kind: "exchange",
          ref: "c2.x1",
          user: "Doing my August email report for Dana (my manager). Last month I led with open rate and she asked \"ok but what did it make us?\" What should I lead with? August campaigns: 6 sends, 174,300 recipients, 3,137 clicks, 436 orders, $41,420. Flows made another $38,600. Klaviyo gives me like 20 metrics.",
          framingIntro: "Good instinct to rethink the top line. Three quick questions to sort the metrics.",
          conceptSlugs: ["funnel-metrics", "average-order-value"],
          questions: [
            {
              id: "q1",
              format: "short_answer",
              prompt: "Between someone receiving a campaign and Quillhaven getting paid, what steps does that person go through?",
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "What's the difference between click rate (CTR) and click-to-open rate (CTOR)?",
            },
            {
              id: "q3",
              format: "multiple_choice",
              prompt: "August campaigns brought in 436 orders and $41,420. What was the average order value?",
              options: ["About $41", "About $95", "About $0.24"],
            },
          ],
          responses: [
            { questionId: "q1", answer: "They get the email, open it, click through to the site, and buy something.", dontKnow: false },
            { questionId: "q2", answer: null, dontKnow: true },
            { questionId: "q3", answer: "About $95", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Email funnel metrics",
            preview: "Delivered, clicked, ordered, revenue: each step answers a different question, and revenue per recipient ties them together.",
            appliedContext: "You were choosing the headline numbers for your monthly email report.",
            conceptSlug: "funnel-metrics",
          },
          thinkMinutes: 3,
          answer: md`
            Your steps are the funnel, and your AOV is right: \$41,420 ÷ 436 ≈ **\$95**. One step to drop from the report: the open. With about 60% of your opens coming from Apple Mail, which records machine opens, it's the one step you can't measure reliably.

            ### Your August campaigns as a funnel
            Each metric is one step, measured against everyone you sent to:

            | Step | August campaigns | Metric |
            |---|---|---|
            | Delivered | 174,300 | — |
            | Clicked | 3,137 | **Click rate** 1.8% |
            | Ordered | 436 | **Placed order rate** 0.25% |
            | Revenue | \$41,420 | **Revenue per recipient** \$0.24 · **AOV** \$95 |

            **Revenue per recipient (RPR)** summarizes the whole funnel: it rewards getting people to click, to buy, *and* to spend more, and it's fair across sends of different sizes.

            ### CTR vs. CTOR
            - **Click rate (CTR)** = clicks ÷ delivered. "Of everyone we emailed, how many clicked?"
            - **Click-to-open rate (CTOR)** = clicks ÷ opens. "Of the people who opened, how many clicked?"

            CTOR's denominator is opens, so machine opens distort it. Stick with CTR.

            ### Suggested top of the report
            1. **Email revenue: \$80,020** (\$41,420 campaigns + \$38,600 flows)
            2. **Revenue per recipient** for campaigns, vs. last month
            3. **Placed order rate**, with click rate as supporting detail

            Worth a footnote: Klaviyo credits an order to an email if it happens within its attribution window after an open or click, so treat email revenue as "influenced by email," not "caused by email."
          `,
        },
        {
          kind: "exchange",
          ref: "c2.x2",
          user: "Revenue per recipient went from $0.29 in July to $0.24 in August, but campaign revenue went up ($31,900 → $41,420). How can both be true? July was 5 sends to 110,000 recipients, 2.3% click rate, 344 orders. Dana's going to ask what it means.",
          framingIntro: "Both can be true at once. Two questions to find which lever moved.",
          conceptSlugs: ["customer-segmentation"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "In Klaviyo, revenue per recipient is revenue divided by what?",
              options: ["Emails delivered", "Emails opened", "Orders placed"],
            },
            { id: "q2", format: "short_answer", prompt: "Did anything change about who you sent campaigns to in August?" },
          ],
          responses: [
            { questionId: "q1", answer: "Emails delivered", dontKnow: false },
            {
              questionId: "q2",
              answer: "Yes — I switched from the 90-day engaged segment (~22k) to everyone who opened in the last 180 days (~29k) to reach more people. And one extra campaign.",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Why revenue per recipient can fall while revenue rises",
            preview: "A larger, less engaged audience brings more total revenue but less per person.",
            appliedContext: "Your campaign RPR fell from July to August while campaign revenue grew.",
            conceptSlug: "customer-segmentation",
          },
          thinkMinutes: 3,
          answer: md`
            Put your two answers together and you have it: RPR divides by everyone delivered, and in August "everyone" grew to include people who were less interested. Here's how to show it with your numbers.

            ### Break RPR into its three levers
            **RPR = click rate × orders per click × AOV**

            | | Click rate | Orders per click | AOV | RPR |
            |---|---|---|---|---|
            | July (110,000 recipients) | 2.3% | 13.6% | \$93 | **\$0.29** |
            | August (174,300 recipients) | 1.8% | 13.9% | \$95 | **\$0.24** |

            The whole drop is at the **click** step. Once people clicked, they bought at the same rate and spent slightly more. That's the fingerprint of adding less-interested people: they click less, but the ones who do click behave like everyone else.

            ### Was the wider segment worth it?
            You sent ~64,300 more emails and made ~\$9,500 more: roughly **\$0.15 per extra email**. Well below your July average of \$0.29, but not zero. So "more revenue, lower efficiency" is the honest summary.

            Two things to weigh before keeping it:
            - "Opened in the last 180 days" includes plenty of Apple machine-openers who haven't read an email in months.
            - Mailing less-engaged people has a cost the revenue column doesn't show.
          `,
        },
        {
          kind: "exchange",
          ref: "c2.x3",
          user: "So should I go back to only sending to the engaged segment? More revenue seems good though.",
          framingIntro: "There's a trade-off you can't see in Klaviyo's revenue column. Two questions:",
          conceptSlugs: ["email-deliverability"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "When many recipients ignore or delete your emails unread, what does Gmail do with your next campaign?",
              options: ["Delivers it as usual", "Sends more of it to spam", "Delays it by a few hours"],
            },
            { id: "q2", format: "short_answer", prompt: "How would you define an \"engaged\" subscriber for your list?" },
          ],
          responses: [
            { questionId: "q1", answer: "Sends more of it to spam", dontKnow: false },
            { questionId: "q2", answer: "Someone who opened an email in the last 90 days.", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Deliverability and list hygiene",
            preview: "Inbox placement depends on how recipients engage. Mailing lots of unengaged people can push everyone's email toward spam.",
            appliedContext: "You widened campaigns to a less engaged segment to grow revenue.",
            conceptSlug: "email-deliverability",
          },
          thinkMinutes: 3,
          answer: md`
            Right on the first one. Gmail, Yahoo and Outlook watch how your recipients treat your mail and use it to judge your **sender reputation**. Lots of ignored or deleted emails, and especially spam complaints, push future sends toward spam for *everyone* on your list, including your best customers.

            ### The rules to know
            Since 2024, Gmail and Yahoo require bulk senders to authenticate their domain (SPF, DKIM, DMARC — usually already set up with Klaviyo), offer one-click unsubscribe, and keep the **spam complaint rate under 0.3%** (aim for under 0.1%). Klaviyo shows spam complaints per campaign; that's the number to watch now that you're mailing a wider group.

            ### Your definition of "engaged": one tweak
            "Opened in the last 90 days" was the standard definition a few years ago, but with ~60% of your opens coming from Apple Mail, machine opens count too. Someone who hasn't looked at an email since spring can still look engaged. Better signals:
            - **Clicked** an email in the last 90 days
            - **Visited the site** (Klaviyo's "Active on Site") or **placed an order**
            - Recently **subscribed** (new people haven't had a chance to engage yet)

            ### Not all-or-nothing

            | Tier | Who | How often |
            |---|---|---|
            | Core | Clicked, visited or bought in 90 days | Every campaign |
            | Warm | Last engaged 90–180 days ago | Your 2 strongest campaigns a month |
            | Cold | Nothing in 180+ days | A re-engagement flow, then stop mailing |

            That keeps most of the extra revenue you found in August while protecting inbox placement for the core list.
          `,
        },
        {
          kind: "lookup",
          ref: "c2.l1",
          user: "Ok can you write the summary paragraph for Dana? She reads it on her phone so 4 sentences max. Campaigns $41,420 (July $31,900), flows $38,600, 436 orders, RPR $0.24 (July $0.29), placed order rate 0.25%, AOV $95.",
          calloutRefs: ["ll-email-attribution"],
          answer: md`
            **August email: \$80,020 in attributed revenue** — \$41,420 from six campaigns (up 30% from July's \$31,900) plus \$38,600 from automated flows. Campaign revenue grew because we mailed a wider audience (anyone who opened in the last 180 days, not just 90), so revenue per recipient dipped from \$0.29 to \$0.24: the newly added subscribers click less, but those who click buy at the same rate, and AOV held at \$95. Placed order rate was 0.25%. For September I'll keep the wider group on our strongest sends only and watch spam complaints, so we keep the extra revenue without hurting inbox placement.

            If she asks why RPR fell: click rate went from 2.3% to 1.8%, while orders per click and AOV held steady or rose.
          `,
        },
      ],
    },

    // ── C3 ──────────────────────────────────────────────────────────────────
    {
      ref: "c3",
      title: "Meta vs. GA4: which ROAS do I believe?",
      daysAgo: 13,
      startHour: 10,
      turns: [
        {
          kind: "exchange",
          ref: "c3.x1",
          user: "Prepping for the Meta vs Google budget conversation. Meta Ads Manager says our August ROAS was 3.1 on $42k spend. But GA4 only gives Meta (paid social) about $61k in revenue, which is like 1.45. Google Ads says its own ROAS is 4.6 on $18k. Which one is right??",
          framingIntro: "Short version: they're answering different questions. Three quick ones to see why.",
          conceptSlugs: ["marketing-attribution-models"],
          questions: [
            {
              id: "q1",
              format: "short_answer",
              prompt: "How many days after someone clicks or sees a Meta ad does Meta still count their purchase?",
            },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "Someone clicks your Meta ad on Monday, then on Thursday searches \"Quillhaven towels\" on Google, clicks your search ad and buys. In a last-click model, who gets the credit?",
              options: ["Meta", "Google", "Split between them"],
            },
            {
              id: "q3",
              format: "multiple_choice",
              prompt: "Can GA4 see that someone scrolled past your Meta ad without clicking?",
              options: ["Yes, through the Meta pixel", "Only if they accepted cookies", "No, it only sees site visits"],
            },
          ],
          responses: [
            { questionId: "q1", answer: "I think our setting is 7 days after a click and 1 day after a view.", dontKnow: false },
            { questionId: "q2", answer: "Google", dontKnow: false },
            { questionId: "q3", answer: "Only if they accepted cookies", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Why ad platforms and GA4 disagree",
            preview: "Each tool credits sales with its own rules and its own view of the customer journey, so their revenue numbers never match.",
            appliedContext: "Meta reported ROAS 3.1 while GA4's numbers implied about 1.45.",
            conceptSlug: "marketing-attribution-models",
          },
          thinkMinutes: 4,
          answer: md`
            You have the two rules right: Meta counts 7 days after a click and 1 day after a view, and last-click hands the sale to Google. The one to correct: GA4 never sees ad views, cookies or not. It only sees visits that land on your site. Put those together and neither number is "right"; each tool answers *"which sales did I touch?"* with its own rules.

            - **Meta (3.1)** counts anyone who clicked or merely saw an ad in that window, across devices where they're logged in, plus modeled conversions for people who opted out of tracking.
            - **GA4 (1.45)** only credits visits it can track. Someone who scrolled past your ad on Tuesday and bought through a Google search on Wednesday counts for Meta (1-day view), while GA4 gives Google all the credit. Declined cookie banners and phone-to-laptop journeys cut Meta's share further.
            - The same order can be claimed by **Meta, Klaviyo and Google Ads at once**, so platform revenue isn't additive.

            For the budget conversation:
            - Use **each platform's ROAS to compare campaigns within it**; the bias is similar across its own campaigns.
            - **Don't use it to split money between platforms.** Meta's 3.1 and Google's 4.6 are graded on different curves.
            - The honest answer for Meta is "somewhere between 1.45 and 3.1," and narrowing that takes a different kind of evidence than attribution.
          `,
        },
        {
          kind: "exchange",
          ref: "c3.x2",
          user: "Ok so is 3.1 good at least? Dana says anything over 3 is great.",
          framingIntro: "\"Good\" depends on your margin and what a new customer costs. Three questions:",
          conceptSlugs: ["roas", "customer-acquisition-cost"],
          questions: [
            {
              id: "q1",
              format: "short_answer",
              prompt: "Your gross margin is about 60%. What ROAS would you need just to break even on a single order?",
            },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "Does Meta's ROAS separate new customers from people who already buy from you?",
              options: ["Yes, it splits them by default", "No, it lumps them together", "Only for retargeting campaigns"],
            },
            {
              id: "q3",
              format: "short_answer",
              prompt: "Roughly what did it cost to win one new customer in August?",
            },
          ],
          responses: [
            {
              questionId: "q1",
              answer: "If we spend 1 and get 1.67 back, 60% of 1.67 is about 1, so we'd just cover the ad. So ~1.67?",
              dontKnow: false,
            },
            { questionId: "q2", answer: "Yes, it splits them by default", dontKnow: false },
            { questionId: "q3", answer: null, dontKnow: true },
          ],
          status: "answered",
          skipCallout: {
            title: "ROAS vs. CAC and customer value",
            preview: "ROAS ignores margin, repeat purchases and whether buyers were new. CAC compared with what a customer is worth answers whether acquisition pays.",
            appliedContext: "Your manager uses \"ROAS over 3\" as the bar for Meta.",
            conceptSlug: "customer-acquisition-cost",
          },
          thinkMinutes: 4,
          answer: md`
            Your break-even math is exactly right: at 60% margin each dollar of revenue leaves 60 cents to pay for the ad, so you need 1 ÷ 0.6 ≈ **1.67**. That alone says a lot: **at GA4's 1.45, Meta loses money on first orders; at Meta's 3.1, it's comfortably profitable.**

            One correction: the standard ROAS column **doesn't** split new from returning customers. It includes people who already buy from you, some of whom would have bought anyway. (Advantage+ shopping campaigns can report new vs. existing customers if you give Meta a customer list, but that's a separate view.)

            ### A better test: what a new customer costs vs. what they're worth
            **Customer acquisition cost (CAC)** = marketing spend ÷ new customers: \$60,000 ÷ 2,150 ≈ **\$28**. That's *blended*: it divides paid spend by every new customer, including those who came through organic search, email or word of mouth, so it understates what paid really pays per customer it brings in.

            **Gross profit per new customer:** first order \$96 × 60% ≈ \$58; over 12 months (~1.4 orders) ≈ \$134 revenue → **~\$81**.

            So about **\$81 back for \$28**, roughly 2.9 : 1 over a year. That's respectable rather than spectacular, and paid's true CAC is higher than \$28, so the real ratio is lower. Still a stronger argument for Dana than "ROAS is over 3," because it doesn't depend on which platform's attribution you believe.
          `,
        },
        {
          kind: "lookup",
          ref: "c3.l1",
          user: "GA4 says it uses \"data-driven\" attribution. Is that better than last click? How does it even decide?",
          answer: md`
            Better than last-click, but still not proof that an ad caused a sale.

            - **How it decides:** GA4 compares paths that ended in a purchase with paths that didn't, and gives more credit to touchpoints whose presence goes with more purchases. It's GA4's default model; last-click is the main alternative.
            - **Why it's better:** early touches like a Meta click can earn a share instead of nothing.
            - **What it can't do:** it only sees what GA4 tracks (site visits, not ad views), so it still under-credits Meta. And it measures association: people who were going to buy anyway click more ads and search your brand, so those touchpoints look valuable even if removing them wouldn't lose a sale.
          `,
        },
        {
          kind: "exchange",
          ref: "c3.x3",
          user: "So for the budget case can I just use GA4's numbers and move money to whichever channel has the better ROAS there?",
          framingIntro: "This is the crux of the budget question, so worth a moment:",
          conceptSlugs: ["incrementality-testing"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "Who mostly searches for \"Quillhaven\" by name on Google?",
              options: ["People who already know you", "People new to home textiles", "People comparing towel brands"],
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "If you paused your branded search ads for two weeks, what would those searchers do instead?",
            },
          ],
          status: "skipped",
          skipItemRef: "ll-incrementality",
          skipCallout: {
            title: "Incrementality: what ads actually cause",
            preview:
              "Attribution tells you which ads touched a sale, not whether the sale would have happened without them. Holdout and geo-lift tests measure what a channel adds.",
            appliedContext: "You wanted to split the Meta vs. Google budget using GA4's attributed ROAS.",
            conceptSlug: "incrementality-testing",
          },
          thinkMinutes: 0.5,
          answer: md`
            Short answer: GA4 is fine for a directional first pass, but not for the decision itself.

            - Attribution tells you **which channel touched the sale**, not which channel **caused** it. About 40% of your Google spend is branded search, which mostly catches people who were already coming, so GA4 will make it look better than it is.
            - The way to measure cause is an **incrementality test**: withhold ads from a random group (or a set of matched regions) for a few weeks and compare sales against the group that saw them. Meta offers Conversion Lift studies; a simpler version is pausing branded search for two weeks and watching whether total sales dip.

            For the conversation with Dana, the strongest framing is: *"Attribution can't settle the split; here's a small test that can."*
          `,
        },
        {
          kind: "lookup",
          ref: "c3.l2",
          user: "Quick one — Sheets formula for ROAS per campaign? Spend is column B, revenue column C, and some rows have 0 spend. Just the formula.",
          answer: md`
            In D2, filled down:

            ~~~
            =IF(B2>0, C2/B2, "")
            ~~~

            For overall ROAS, divide the totals (\`=SUM(C:C)/SUM(B:B)\`) rather than averaging this column.
          `,
        },
      ],
    },

    // ── C4 ──────────────────────────────────────────────────────────────────
    {
      ref: "c4",
      title: "Win-back campaign: who counts as lapsed?",
      daysAgo: 6,
      startHour: 16.5,
      turns: [
        {
          kind: "exchange",
          ref: "c4.x1",
          user: "Dana wants a win-back campaign for lapsed customers. I exported all our Shopify orders to Sheets (about 58,000 customers). How do I decide who counts as \"lapsed\"? I've heard of RFM.",
          framingIntro: "RFM is a good fit here. Two questions to set it up:",
          conceptSlugs: ["rfm-segmentation", "customer-segmentation"],
          questions: [
            { id: "q1", format: "short_answer", prompt: "What do you think R, F and M stand for?" },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "Your median gap between a first and second order is about 118 days. A customer last ordered 90 days ago. They're:",
              options: ["Most likely gone for good", "Most likely between orders", "Most likely a one-off buyer"],
            },
          ],
          responses: [
            {
              questionId: "q1",
              answer: "Recency, frequency, monetary — how recently they bought, how often, and how much they've spent.",
              dontKnow: false,
            },
            { questionId: "q2", answer: "Most likely between orders", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "RFM segmentation",
            preview: "Score customers on recency, frequency and monetary value to find your best, at-risk and lapsed customers.",
            appliedContext: "You were deciding who should get a win-back campaign.",
            conceptSlug: "rfm-segmentation",
          },
          thinkMinutes: 3,
          answer: md`
            Both right, and the second is the key to "lapsed": define it by **your customers' buying rhythm**, not a round number. At 90 days, someone is still inside the usual 118-day gap. At ~240 days (about twice the gap) they've probably drifted. That's your line.

            ### Building it in Sheets
            **1. Fix the dates.** Shopify's "Created at" looks like \`2026-03-14 10:22:05 -0400\`; the timezone offset makes Sheets treat it as text. Assuming it's in column D of your Orders tab, put this in H2 of an empty column (header "Order date") and format the column as a date:

            ~~~
            =ARRAYFORMULA(IF(D2:D="", , DATEVALUE(LEFT(D2:D, 10))))
            ~~~

            **2. One row per customer with a pivot table** (Insert → Pivot table): Rows = Email; Values = Order date as **MAX**, Name as **COUNTUNIQUE**, Total as **SUM**. That gives last order, number of orders and total spent. The export has one row per line item, hence COUNTUNIQUE on the order name; Total is only filled on each order's first row, so SUM is safe. A pivot handles 58,000 customers much faster than a MAXIFS or SUMIFS per row over full columns.

            **3. Score.** Paste the pivot as values on a Customers tab (email A, last order B, orders C, spent D). Recency in fixed bands tied to your rhythm:

            ~~~
            =IFS(TODAY()-B2<60, 5, TODAY()-B2<120, 4, TODAY()-B2<240, 3, TODAY()-B2<365, 2, TRUE, 1)
            ~~~

            Frequency and spend in fifths (shown for orders in C; same with D):

            ~~~
            =MIN(5, 1 + INT(PERCENTRANK.INC(C$2:C$58001, C2) * 5))
            ~~~

            Most customers have one order, so they all tie at F=1; that's expected.

            ### Who gets the win-back

            | Segment | Scores | What to do |
            |---|---|---|
            | Champions | R 4–5, F 4–5 | No discount needed |
            | **At risk** | R 1–2, F 4–5, M 4–5 | **Win-back list** (240+ days quiet) |
            | New big spenders | R 5, F 1, M 4–5 | Second-order nurture |
            | Lost one-timers | R 1, F 1 | One light-touch email at most |
          `,
        },
        {
          kind: "exchange",
          ref: "c4.x2",
          user: "Scored everyone. Two customers I'm unsure about: one is R=2, F=5, M=5 (7 orders, last one 10 months ago), the other is R=5, F=1, M=5 (one big order last month). Which one should get the win-back email?",
          framingIntro: "Good pair to compare. Two questions:",
          conceptSlugs: ["customer-acquisition-cost", "customer-lifetime-value"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "Your median gap between orders is about 118 days. How many of those gaps is 10 months?",
              options: ["About 1", "About 2.5", "About 4"],
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "Roughly what does it cost Quillhaven in ads to win one brand-new customer?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "About 2.5", dontKnow: false },
            {
              questionId: "q2",
              answer: "About 28 dollars — we worked that out for the budget case.",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Winning back vs. acquiring customers",
            preview: "A lapsed regular has already shown they value you; reactivating them usually costs far less than acquiring a new customer.",
            appliedContext: "You had two high-value customers with opposite recency and frequency scores.",
            conceptSlug: "customer-acquisition-cost",
          },
          thinkMinutes: 2,
          answer: md`
            Both right, and together they answer it: the **R=2, F=5, M=5 regular** gets the win-back email.

            ### Customer 1: R=2, F=5, M=5
            Seven orders means they genuinely liked Quillhaven. Ten months of silence is about 2.5 of their usual gaps, so something changed: their needs are covered, they moved, or a competitor got them. This is exactly who win-back is for.
            - Lead with **recognition**: "It's been a while — here's what's new since your last order."
            - Keep the offer light; a lapsed regular often just needs a reminder.

            ### Customer 2: R=5, F=1, M=5: not lapsed
            One big order last month makes them a **new, high-value customer**, and "we miss you" would be odd. The job is getting a **second order**, which is where most customers are lost. That belongs in a post-purchase flow (care tips, a "complete the set" suggestion around day 30–60).

            ### Why the \$28 matters
            Reactivating a regular costs roughly an email; replacing them with a new customer costs ~\$28 in ads before they've bought anything. And a regular with seven orders behind them is worth more over time than an average new customer.
          `,
        },
        {
          kind: "exchange",
          ref: "c4.x3",
          user: "Dana also asked if the customers we got this year are \"worse\" than last year's — she thinks fewer are coming back. How do I even answer that?",
          framingIntro: "There's a trap in this one. Two questions:",
          conceptSlugs: ["cohort-retention"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "After a first order, how long do your customers usually take to order again?",
              options: ["About 1 month", "About 4 months", "About 1 year"],
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "Someone who first ordered in August 2026 has had how long, so far, to order again?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "About 4 months", dontKnow: false },
            { questionId: "q2", answer: "Only about a month.", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Cohort analysis",
            preview: "Compare customers acquired at the same time at the same age, so recent customers aren't judged on less time to come back.",
            appliedContext: "Your manager asked whether this year's customers are worse than last year's.",
            conceptSlug: "cohort-retention",
          },
          thinkMinutes: 3,
          answer: md`
            Put your two answers side by side and that's the trap: customers usually take about 4 months to reorder, and August's new customers have had one. Someone from March 2025 has had eighteen. Comparing "all 2026 vs. all 2025" makes this year look worse even if the customers are identical.

            The fair comparison is a **cohort analysis**: group customers by when they first bought, and compare each group over the **same window**, say "reordered within 90 days."

            | First-order quarter | Customers | Reordered within 90 days |
            |---|---|---|
            | 2025 Q1 | 5,400 | 14% |
            | 2025 Q2 | 5,900 | 13% |
            | 2025 Q3 | 6,100 | 15% |
            | 2025 Q4 | 8,800 | 11% |
            | 2026 Q1 | 5,700 | 12% |

            *(Illustrative; your numbers will differ.)* 2026 Q2 finishes its 90 days at the end of September, and Q3 isn't ready yet. Compare Q4 with Q4: holiday gift buyers often never return.

            ### In Sheets
            Add **MIN of Order date** to your customer pivot (first order, say column H). Then:

            ~~~
            Cohort:            =YEAR(H2) & "-Q" & ROUNDUP(MONTH(H2)/3, 0)
            Reordered in 90d:  =IF(COUNTIFS(Orders!B:B, A2, Orders!H:H, ">"&H2, Orders!H:H, "<="&(H2+90))>0, 1, 0)
            ~~~

            The second one is slow over 58,000 rows, so paste it as values once it's calculated. A pivot with rows = Cohort, values = COUNTA of email and AVERAGE of "Reordered in 90d" gives the table.
          `,
        },
        {
          kind: "lookup",
          ref: "c4.l1",
          user: "Can you draft the win-back email for the at-risk regulars (about 1,900 people)? Subject line + short body. We're offering free shipping, not a discount — Dana doesn't want to train people to wait for sales. We can mention the new towel colors and the stonewashed linen bedding launching next month.",
          answer: md`
            **Subject line options**
            1. It's been a while — here's what's new at Quillhaven
            2. Your favorites, plus a few new ones (and free shipping)
            3. We saved you a spot (free shipping inside)

            **Preview text:** Free shipping on your next order, until [end date].

            ---

            Hi {{ first_name|default:"there" }},

            It's been a little while since your last order, and a lot has changed around here.

            We've added new colors to the towels you already know, and next month we're launching **stonewashed linen bedding**, soft from the very first night.

            As a thank-you for being one of our regulars, your next order ships **free** until [end date].

            **[Take a look →]**

            Warmly,
            The Quillhaven team

            ---

            A couple of notes:
            - The first-name tag uses Klaviyo's fallback syntax, so profiles without a name read "Hi there."
            - With ~1,900 people, an A/B test on clicks won't find anything but a huge difference — pick the subject line you like best and save testing for bigger sends.
          `,
        },
      ],
    },

    // ── C5 ──────────────────────────────────────────────────────────────────
    {
      ref: "c5",
      title: "Linen launch: positioning, copy and ad tests",
      daysAgo: 1,
      startHour: 9.5,
      turns: [
        {
          kind: "exchange",
          ref: "c5.x1",
          user: "We're launching stonewashed linen bedding next month (queen sheet set is $189). I'm writing the launch email and Meta ads. Dana says our copy always sounds like everyone else's. Where do I even start?",
          framingIntro: "Copy that sounds like everyone else's is usually a positioning problem before it's a writing problem. Three questions:",
          conceptSlugs: ["positioning"],
          questions: [
            {
              id: "q1",
              format: "short_answer",
              prompt: "If Quillhaven linen didn't exist, what would your customer buy instead?",
            },
            {
              id: "q2",
              format: "multi_select",
              prompt: "Which of these are benefits rather than features?",
              options: ["Stonewashed before shipping", "Soft from the first night", "Woven from linen", "Cool on hot nights"],
            },
            {
              id: "q3",
              format: "short_answer",
              prompt: "Describe the person who'd get the most out of these sheets.",
            },
          ],
          responses: [
            {
              questionId: "q1",
              answer: "Cotton sheets from a department store, or from one of the big online sheet brands.",
              dontKnow: false,
            },
            {
              questionId: "q2",
              answer: ["Soft from the first night", "Cool on hot nights"],
              dontKnow: false,
            },
            {
              questionId: "q3",
              answer: "Probably people in their 30s who care about their bedroom and like nice things.",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Positioning before copy",
            preview: "Decide who the product is for, what it replaces and why it wins; distinctive copy follows from that.",
            appliedContext: "You were starting the launch email and ads for the linen bedding line.",
            conceptSlug: "positioning",
          },
          thinkMinutes: 4,
          answer: md`
            Your first two answers are the foundation. Cotton sheets are the real alternative, and "soft from the first night" and "cool on hot nights" are the benefits; stonewashing and linen are the features that make them true.

            The third is the one to sharpen. "People in their 30s who care about their bedroom" describes almost every bedding brand's customer, which is exactly why the copy ends up sounding like everyone else's. Positioning gets distinctive when you describe a **situation**, not a demographic.

            ### A quick positioning draft

            | Question | Draft answer |
            |---|---|
            | What would they use instead? | Cotton sheets; linen that stays stiff for months |
            | What do we have that they don't? | Stonewashed before it ships; linen's open weave |
            | What does that do for them? | Soft on night one; sleeps cool |
            | Who cares most? | Hot sleepers; people who tried linen and found it scratchy |

            Put together: *"For hot sleepers who find cotton stuffy and linen scratchy, Quillhaven linen is soft from the first night because it's stonewashed before it ships."* Your copy lives in the benefits; the features are the proof. At \$189 the set is premium next to cotton, so the copy has to earn that price with a problem the reader actually has.
          `,
        },
        {
          kind: "exchange",
          ref: "c5.x2",
          user: "That helps a lot. For the actual copy — I know AIDA from a course. Is that what I should use for both the email and the ads?",
          framingIntro: "AIDA works, but the two audiences are in different places. Two questions:",
          conceptSlugs: ["copywriting-frameworks"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "How well does the typical reader of your launch email know Quillhaven?",
              options: ["They've never heard of it", "They know it and signed up", "They've seen one ad before"],
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "What's on a stranger's mind when your ad appears in their Instagram feed?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "They know it and signed up", dontKnow: false },
            {
              questionId: "q2",
              answer: "Not us, whatever they're scrolling for. They'd only stop if it was about something that bugs them.",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Choosing a copywriting framework",
            preview: "AIDA suits warm audiences; PAS (Problem–Agitate–Solution) suits cold audiences who need a reason to care.",
            appliedContext: "You were writing both a launch email and cold Meta ads.",
            conceptSlug: "copywriting-frameworks",
          },
          thinkMinutes: 2,
          answer: md`
            Both right, and that difference decides the framework: subscribers already know you, while a stranger only stops for something that bugs them.

            ### AIDA for the launch email (warm audience)
            **Attention → Interest → Desire → Action.** Your subscribers trust Quillhaven, so lead with the news:
            - **A:** "Our first linen bedding is here."
            - **I:** What makes it different: stonewashed, soft on night one.
            - **D:** Cool sheets on a warm night, no breaking in.
            - **A:** One clear button: "Shop the linen collection."

            ### PAS for cold Meta ads
            **Problem → Agitate → Solution.** It starts exactly where you said a stranger's attention is: their problem.
            - **Problem:** "Waking up hot at 3 a.m.?"
            - **Agitate:** "Cotton sateen traps heat, and most linen feels like burlap for months."
            - **Solution:** "Quillhaven linen is stonewashed before it ships: cool, and soft from the first night."

            It maps straight onto your positioning: the problem is the alternative's weakness, the solution is what only you have.
          `,
        },
        {
          kind: "exchange",
          ref: "c5.x3",
          user: "For the launch email: should everyone on the list get the same version? Some subscribers have bought bedding from us before, some only towels, and a lot haven't bought anything yet.",
          framingIntro: "Two questions about who's on the other end:",
          conceptSlugs: ["customer-segmentation"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "Which group is most likely to buy linen sheets in launch week?",
              options: ["Past bedding buyers", "Towel-only buyers", "Never-purchased subscribers"],
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "What does a subscriber who has never ordered still need to believe before paying $189 for sheets?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "Past bedding buyers", dontKnow: false },
            {
              questionId: "q2",
              answer: "That the quality is worth it. They've never actually touched our stuff.",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Segmenting a launch email",
            preview: "People who already own your products, people who own something else from you, and people who've never bought need different reasons to act.",
            appliedContext: "Your launch email goes to past bedding buyers, towel-only buyers and never-purchased subscribers.",
            conceptSlug: "customer-segmentation",
          },
          thinkMinutes: 2,
          answer: md`
            Both right, and they point to three versions of one email. The product and the button stay the same; the opening and the proof change.

            | Group | What they need | Opening idea |
            |---|---|---|
            | Past bedding buyers | Nothing to prove; they know the quality | "First look: linen for the bed you already love" |
            | Towel-only buyers | A bridge from what they own | "The softness you know from our towels, now for your bed" |
            | Never purchased | Proof, as you said | Lead with the problem, then reviews and how stonewashing works |

            In Klaviyo, that's three segments built on "Placed Order" (at least once, filtered to your bedding products; at least once overall; zero times), with the email cloned per segment.

            Send bedding buyers first, a day or two ahead, as early access: they're your likeliest launch-week buyers and the cheapest sales you'll make.
          `,
        },
        {
          kind: "exchange",
          ref: "c5.x4",
          user: "I want to test two ad angles on Meta: \"soft from night one\" vs \"sleeps cool\". Meta's numbers are inflated by attribution though, right? So can I even trust them to pick a winner? We pay about $31 per purchase according to Ads Manager.",
          framingIntro: "Good that you're asking before launching. Two questions:",
          conceptSlugs: ["ab-testing-basics", "statistical-power"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "If both ads sit in one ad set, how does Meta split delivery between them?",
              options: ["Evenly, at random", "Toward the early leader", "By alternating each day"],
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "Roughly how many purchases per ad would you want before calling a winner?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "Evenly, at random", dontKnow: false },
            {
              questionId: "q2",
              answer: "More than I'd think — my welcome email test had ~30 orders each and told us nothing. Maybe 100+ each?",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Testing ad creative fairly",
            preview: "Ads in the same ad set aren't randomly split; use Meta's A/B test tool and plan for enough purchases per version.",
            appliedContext: "You wanted to compare two ad angles for the linen launch.",
            conceptSlug: "ab-testing-basics",
          },
          thinkMinutes: 3,
          answer: md`
            Good instinct carrying the welcome-test lesson over: ~100 purchases per ad is a sensible floor. The first answer is the one to correct, and it matters more than attribution here.

            ### Attribution is the smaller problem
            When you compare two ads *inside* Meta, attribution inflation affects both about equally, so the **ranking** is usually trustworthy even if the absolute numbers aren't.

            ### An ad set isn't a random split
            Meta's delivery shifts spend toward whichever ad gets early traction, and shows each ad to the people it predicts will respond. After a few days one ad may have most of the spend and a different audience, so you're no longer comparing like with like.

            **Use Meta's A/B test feature** (in Experiments, or "A/B test" when creating the campaign). It splits your audience into non-overlapping random groups, so each angle gets a fair shot.

            ### How much data
            At about \$31 per purchase, 100 purchases per angle is roughly **\$3,100 per angle**. That can reliably catch a big gap, one angle getting about 50% more purchases for the same spend, but not a 10–20% one. So:
            - Keep the angles genuinely different (comfort vs. temperature is a real contrast).
            - Use **add-to-cart rate** as an early read, but let purchases decide.

            Whether Meta as a whole earns its \$42,000 a month is a different question, and only a holdout or lift test can answer it.
          `,
        },
        {
          kind: "lookup",
          ref: "c5.l1",
          user: "Write me 3 Meta primary text options for the \"sleeps cool\" angle using PAS. Keep the first line under 125 characters since that's what shows before \"See more\".",
          answer: md`
            **Option 1: direct problem**
            > Kicking off the covers at 3 a.m. again?
            >
            > Cotton sateen traps heat, and most linen feels stiff for months. Quillhaven linen is stonewashed before it ships, so it's breathable and soft from the very first night.
            >
            > Queen sheet set, \$189.

            **Option 2: the flipped-pillow moment**
            > If you flip your pillow to find the cool side, your sheets are the problem.
            >
            > Tightly woven cotton holds onto body heat all night. Linen lets air through — and ours is pre-softened, so there's no scratchy breaking-in period. Sleep cool from night one.

            **Option 3: myth-busting**
            > Linen doesn't have to feel like burlap.
            >
            > Hot sleepers love linen for how cool it stays, but most sets take months to soften. We stonewash ours before it ships: cool, soft, and ready on night one.

            Every opening line is well under 125 characters, so the problem lands before "See more." Suggested headlines: "Sleep cool from night one" · "Linen, pre-softened" · "Meet your coolest sheets."

            If you test these, test **one against another inside the A/B test tool**, not all three in one ad set.
          `,
        },
      ],
    },
  ],
};
