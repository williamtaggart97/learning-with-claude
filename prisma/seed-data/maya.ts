// Maya — MPH epidemiology student, thesis on 30-day readmission after
// heart-failure hospitalization (Tier 2 "super user", X4).
//
// Cohort facts used consistently across conversations:
//   21,400 index heart-failure admissions · 43 hospitals · 30-day
//   readmission 18.2% · ~6% die within 30 days without readmission ·
//   ~3,900 discharged to a skilled nursing facility (SNF) · works in R.
//
// Tier 2 via BOTH paths: 15 answered framing exchanges and 12 concepts.
import { md, type SeedPersona } from "./types";

export const maya: SeedPersona = {
  key: "maya",
  displayName: "Maya",
  createdDaysAgo: 26,

  context: {
    field: "MPH, epidemiology (thesis track)",
    projects: [
      "Thesis: predictors of 30-day readmission after heart-failure hospitalization",
      "Aim 3: does discharge to a skilled nursing facility reduce readmission? (propensity-score analysis)",
      "Secondary aim: readmissions per person-year in the year after discharge",
    ],
    dataTypes: [
      "EHR extracts (encounters, diagnoses, labs, ejection fraction)",
      "Medicare fee-for-service claims",
      "Hospital-level characteristics (43 hospitals)",
    ],
    notes: "Works in R (tidyverse, lme4, survival, MatchIt). Advisor is an epidemiologist who prefers risk ratios to odds ratios.",
  },

  style: {
    intuitionVsFormal: -0.6,
    intuitionVsFormalConfidence: 0.78,
    entryPoint: "worked_example",
    entryPointConfidence: 0.74,
    briefVsThorough: 0.35,
    briefVsThoroughConfidence: 0.71,
    evidence: [
      {
        dimension: "intuitionVsFormal",
        ref: "c1.x1",
        note: "Engaged most with the worked variance example (α ≈ 1.5 from her own mean and variance); follow-ups were about interpretation, not derivations.",
      },
      {
        dimension: "intuitionVsFormal",
        ref: "c3.x2",
        note: "Asked \"is that big?\" about a random-intercept variance of 0.12 — wanted a feel for the number (median odds ratio) before the formula.",
      },
      {
        dimension: "entryPoint",
        ref: "c2.x1",
        note: "Her next question built directly on the OR → RR worked example with her own 18.2% baseline risk.",
      },
      {
        dimension: "entryPoint",
        ref: "c4.x1",
        note: "The 100-patient toy example resolved her confusion about censoring deaths where the definition alone hadn't.",
      },
      {
        dimension: "briefVsThorough",
        ref: "c3.x1",
        note: "Read the long clustering answer closely enough to ask two detailed follow-ups (ICC, random slopes).",
      },
      {
        dimension: "briefVsThorough",
        ref: "c5.l1",
        note: "Asked for \"just the table\" before an advisor meeting — prefers thorough explanations, but wants brevity under deadline.",
      },
    ],
  },

  masteries: [
    {
      slug: "logistic-regression",
      evidence: [
        { ref: "c2.x1", delta: 0.35, note: "Read her adjusted logistic model fluently and knew odds ratios come from exponentiated coefficients." },
        { ref: "c2.x2", delta: 0.25, note: "Recognized without prompting that baseline risk varies with covariates in an adjusted logistic model." },
        { ref: "c5.x1", delta: 0.28, note: "Set up the propensity model as a logistic regression of SNF discharge on pre-discharge covariates without being told." },
      ],
    },
    {
      slug: "confounding",
      evidence: [
        { ref: "c2.x2", delta: 0.45, note: "Explained that adjustment compares patients with the same covariates, and that those covariates also set each patient's baseline risk." },
        { ref: "c3.x1", delta: 0.25, note: "Named hospital case mix and discharge programs as reasons hospitals differ — thinks about clustering in causal terms." },
        { ref: "c5.x1", delta: 0.24, note: "Correctly chose age, comorbidity and living alone as common causes of SNF discharge and readmission." },
        { ref: "c5.x1", delta: -0.1, note: "Also put post-discharge outpatient visits in the propensity model — a post-treatment variable that can bias the estimate." },
      ],
    },
    {
      slug: "poisson-regression",
      evidence: [
        { ref: "c1.x1", delta: 0.45, note: "Knew without prompting that a Poisson model forces the variance to equal the mean." },
        { ref: "c1.x3", delta: 0.2, note: "Read exp(β) from a log-link model as a multiplicative change in the expected count." },
        { ref: "c2.x3", delta: 0.15, note: "Worked out why log-binomial models fail to converge (fitted probabilities above 1) and accepted modified Poisson as the fix." },
      ],
    },
    {
      slug: "overdispersion",
      evidence: [
        { ref: "c1.x1", delta: 0.4, note: "Correctly identified that readmission counts are overdispersed (variance well above the mean of 0.9) before being told." },
        { ref: "c1.x2", delta: 0.36, note: "Computed the Pearson dispersion statistic herself (2.6) and connected it to standard errors that are too small." },
      ],
    },
    {
      slug: "negative-binomial-regression",
      evidence: [
        { ref: "c1.x1", delta: 0.25, note: "Followed the Var = μ + αμ² parameterization through a worked example with her own numbers." },
        { ref: "c1.x2", delta: 0.22, note: "Knew NB reduces to Poisson at α = 0; chose AIC and a likelihood ratio test but missed observed-vs-predicted count checks." },
        { ref: "c1.x3", delta: 0.15, note: "Interpreted NB coefficients as incidence rate ratios because of the person-time offset." },
      ],
    },
    {
      slug: "odds-ratio-vs-risk-ratio",
      evidence: [
        { ref: "c2.x1", delta: 0.35, note: "Knew odds ratios approximate risk ratios only for rare outcomes, and that an 18.2% readmission rate isn't rare." },
        { ref: "c2.x2", delta: -0.05, note: "Wants a group-level risk ratio but hadn't realized an adjusted OR is a patient-level comparison — non-collapsibility was new." },
        { ref: "c2.x3", delta: 0.25, note: "Chose to estimate risk ratios directly (modified Poisson) rather than converting adjusted odds ratios." },
      ],
    },
    {
      slug: "mixed-effects-models",
      evidence: [
        { ref: "c3.x1", delta: 0.2, note: "Understood that clustering shrinks the effective sample size; answered \"I don't know\" on conditional vs. population-averaged effects." },
        { ref: "c3.x3", delta: 0.24, note: "Described a random slope as letting the disposition effect vary by hospital and gave a plausible mechanism (transitional-care programs)." },
      ],
    },
    {
      slug: "intraclass-correlation",
      evidence: [
        { ref: "c3.x1", delta: 0.22, note: "Followed the design-effect calculation (≈ 498 patients per hospital) and saw why a small ICC still matters." },
        { ref: "c3.x2", delta: 0.3, note: "Recalled the π²/3 latent-scale variance and knew an ICC is the between-hospital share of the variation." },
      ],
    },
    {
      slug: "competing-risks",
      evidence: [
        { ref: "c4.x1", delta: 0.12, note: "Saw that dropping deaths removes the sickest patients, but thought censoring treats deaths as never at risk of readmission." },
        { ref: "c4.x2", delta: 0.18, note: "Correctly said deaths are censored in a cause-specific Cox model; still unsure when Fine–Gray is the right tool." },
      ],
    },
    {
      slug: "cox-proportional-hazards",
      evidence: [
        { ref: "c4.x2", delta: 0.2, note: "Set up cause-specific Cox models for readmission and death once the censoring logic was clear." },
        { ref: "c4.x3", delta: 0.28, note: "Stated the proportional hazards assumption correctly and saw that a difference in early deaths alone can make cumulative incidence curves cross." },
      ],
    },
    {
      slug: "propensity-score-matching",
      evidence: [
        { ref: "c5.x1", delta: 0.15, note: "Picked sensible confounders but included a post-treatment variable, and didn't know what propensity scores near 1 imply (positivity)." },
        { ref: "c5.x2", delta: 0.12, note: "Identified which SNF patients were hardest to match and that she wants the effect for SNF patients generally, but hadn't connected the two." },
        { ref: "c5.l1", delta: 0.08, note: "Knows to check covariate balance after matching (asked for the cobalt balance table)." },
      ],
    },
    {
      slug: "multiple-imputation",
      evidence: [
        { ref: "c5.x3", delta: 0.2, note: "Correctly classified hospital-driven missingness in the frailty score as missing at random given hospital." },
        { ref: "c5.x3", delta: 0.11, note: "Spotted that the six hospitals differ (rural, lower SNF use); linking that to complete-case bias under MAR was new." },
      ],
    },
  ],

  learnLater: [
    {
      ref: "ll-fixed-random",
      conceptSlug: "fixed-vs-random-effects",
      title: "Fixed vs. random effects for hospitals",
      preview:
        "Hospital dummies control for everything about a hospital but can't estimate hospital-level effects; random intercepts can, and they shrink small hospitals toward the average.",
      appliedContext:
        "You asked whether to replace the random intercept in your readmission GLMM with 42 hospital dummy variables.",
      origin: "skipped",
      status: "queued",
      source: { turnRef: "c3.x4", message: "user" },
    },
    {
      ref: "ll-zero-inflation",
      conceptSlug: "zero-inflated-models",
      title: "Zero-inflated vs. hurdle models",
      preview:
        "If some patients are never really at risk of readmission (e.g. moved to hospice), zeros pile up beyond what even a negative binomial expects. Zero-inflated and hurdle models give those structural zeros their own process.",
      appliedContext:
        "Came up when you checked the negative binomial fit for readmissions per person-year — the rootogram's zero bar is where it would show.",
      origin: "flagged",
      status: "queued",
      source: { turnRef: "c1.x2", message: "answer" },
    },
    {
      ref: "ll-missingness",
      conceptSlug: "missing-data-mechanisms",
      title: "Missing at random vs. missing not at random",
      preview:
        "Multiple imputation assumes missingness depends only on what you observed (MAR). If unassessed patients are frailer than their data suggest (MNAR), estimates can be biased — and no test on the data can tell you which is true.",
      appliedContext:
        "Frailty is missing for 12% of your aim 3 cohort, mostly at six hospitals. You're imputing under MAR, so a delta-adjusted sensitivity analysis would show how much that assumption matters.",
      origin: "flagged",
      status: "queued",
      source: { turnRef: "c5.x3", message: "answer" },
    },
    {
      ref: "ll-caliper",
      conceptSlug: "propensity-score-matching",
      title: "Choosing a matching caliper",
      preview:
        "A caliper caps how far apart matched propensity scores can be. 0.2 standard deviations of the logit propensity score is a common default; tighter calipers buy balance at the cost of dropping treated patients.",
      appliedContext:
        "Your matchit call uses caliper = 0.2 and dropped 31% of SNF patients — the caliper is the dial behind that trade-off.",
      origin: "flagged",
      status: "queued",
      source: { turnRef: "c5.l1", message: "answer" },
    },
    {
      ref: "ll-smd",
      conceptSlug: "standardized-mean-difference",
      title: "Why |SMD| < 0.1?",
      preview:
        "The 0.1 cutoff for standardized mean differences is a convention, not a test. Balance is about the size of leftover differences — p-values shrink as n grows, SMDs don't.",
      appliedContext:
        "Your balance table flags covariates above 0.1. Worth knowing what that line does and doesn't guarantee before your advisor asks.",
      origin: "flagged",
      status: "queued",
      source: { turnRef: "c5.l1", message: "answer" },
    },
  ],

  conversations: [
    // ── C1 ──────────────────────────────────────────────────────────────────
    {
      ref: "c1",
      title: "Poisson vs. negative binomial for readmission counts",
      daysAgo: 24,
      startHour: 20.5,
      turns: [
        {
          kind: "exchange",
          ref: "c1.x1",
          user: "For a secondary aim I'm modeling the number of readmissions each patient has in the year after their index heart-failure discharge. It's a count, so Poisson regression, right? The mean is 0.9 readmissions per patient.",
          framingIntro: "Poisson is the right family to start from. Before we decide whether it's the right *model*, three quick questions to line up the pieces.",
          conceptSlugs: ["poisson-regression", "overdispersion", "negative-binomial-regression", "offsets-and-exposure"],
          questions: [
            { id: "q1", format: "short_answer", prompt: "What does a Poisson model assume about how the variance of the counts relates to their mean?" },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "Roughly how does the variance of your readmission counts compare to the mean of 0.9?",
              options: ["About the same (around 0.9)", "Noticeably larger than the mean", "Smaller than the mean"],
            },
            {
              id: "q3",
              format: "short_answer",
              prompt: "Some patients die or leave the health system before the year is up. How would you account for them having less time to be readmitted?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "They're equal — variance = mean", dontKnow: false },
            { questionId: "q2", answer: "Noticeably larger than the mean", dontKnow: false },
            { questionId: "q3", answer: null, dontKnow: true },
          ],
          status: "answered",
          skipCallout: {
            title: "Overdispersion in count models",
            preview: "Poisson forces the variance to equal the mean; real counts are usually more spread out, which makes Poisson standard errors too small.",
            appliedContext: "You were about to model readmissions per patient with a Poisson regression.",
            conceptSlug: "overdispersion",
          },
          thinkMinutes: 3,
          answer: md`
            You've got the key assumption exactly right: Poisson forces $\operatorname{Var}(Y) = \mu$. And you've already spotted the problem — your counts are more spread out than that. That's **overdispersion**, and it's the norm for readmissions: a handful of very sick patients bounce back four or five times while most never return.

            ### Why it matters
            Under overdispersion the Poisson coefficients are still reasonable, but the **standard errors are too small**, so intervals are too narrow and p-values too optimistic. A quick check after fitting:

            $$\hat\phi = \frac{\sum_i r_i^2}{n - p}$$

            where $r_i$ are Pearson residuals. Values near 1 are fine; readmission data commonly land between 2 and 4.

            ### The negative binomial
            The negative binomial (NB) adds one parameter, $\alpha$, that lets the variance grow faster than the mean:

            $$\operatorname{Var}(Y) = \mu + \alpha\mu^2$$

            Worked with your numbers: if the observed variance were 2.1, then $2.1 = 0.9 + \alpha(0.9)^2$, so $\alpha = 1.2 / 0.81 \approx 1.5$ — a lot of extra spread. As $\alpha \to 0$ you're back to Poisson.

            ### Unequal follow-up (your "I don't know" — a good one to flag)
            A patient who died at day 60 had two months to be readmitted, not twelve. Put follow-up time in as an **offset**:

            $$\log \mu_i = \log(t_i) + \beta_0 + \beta_1 x_{1i} + \dots$$

            The $\log(t_i)$ term has its coefficient fixed at 1, so the model is really about the *rate* $\mu_i / t_i$ — readmissions per person-year.

            ~~~r
            library(MASS)

            fit_pois <- glm(n_readmit ~ age + ef_reduced + ckd + offset(log(followup_years)),
                            family = poisson, data = hf)
            sum(residuals(fit_pois, type = "pearson")^2) / df.residual(fit_pois)  # dispersion

            fit_nb <- glm.nb(n_readmit ~ age + ef_reduced + ckd + offset(log(followup_years)),
                             data = hf)
            summary(fit_nb)
            ~~~

            One R gotcha: \`glm.nb\` reports $\theta = 1/\alpha$, so a *small* theta means *more* overdispersion.
          `,
        },
        {
          kind: "exchange",
          ref: "c1.x2",
          user: "Dispersion came out at 2.6 and the NB gives theta = 0.71. How do I show my committee the NB is actually better than Poisson — is comparing AIC enough?",
          framingIntro: "AIC will point the right way here, but let's make sure the comparison shows what you want it to.",
          conceptSlugs: ["negative-binomial-regression", "overdispersion", "likelihood-ratio-test"],
          questions: [
            { id: "q1", format: "short_answer", prompt: "What value of the NB's dispersion parameter α turns it back into a Poisson model?" },
            {
              id: "q2",
              format: "multi_select",
              prompt: "Which of these tell you something about how well a count model fits?",
              options: [
                "AIC or BIC for each model",
                "R² from each fitted model",
                "A likelihood ratio test, NB vs. Poisson",
                "Observed vs. predicted counts of 0, 1, 2, …",
              ],
            },
          ],
          responses: [
            { questionId: "q1", answer: "α = 0 (so theta goes to infinity)", dontKnow: false },
            { questionId: "q2", answer: ["AIC or BIC for each model", "A likelihood ratio test, NB vs. Poisson"], dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Comparing Poisson and negative binomial fits",
            preview: "The two models are nested, so a likelihood ratio test works — with a boundary correction — and rootograms show whether either fits.",
            appliedContext: "You wanted to justify the negative binomial model to your committee.",
            conceptSlug: "negative-binomial-regression",
          },
          thinkMinutes: 2,
          answer: md`
            Right — Poisson is the NB with $\alpha = 0$, so the models are **nested**, and that's what makes a likelihood ratio test possible. Both of your picks are valid; there's one subtlety with the LRT and one check worth adding.

            **The LRT has a boundary catch.** $\alpha$ can't be negative, so under $H_0\!: \alpha = 0$ the null value sits on the edge of the parameter space. The statistic $2(\ell_{NB} - \ell_{P})$ then follows a 50:50 mix of a point mass at 0 and $\chi^2_1$, which in practice means **halve the usual $\chi^2_1$ p-value**. With dispersion at 2.6 the p-value will be tiny either way, but committees like to see that you know.

            ~~~r
            lr <- 2 * (logLik(fit_nb) - logLik(fit_pois))
            pchisq(as.numeric(lr), df = 1, lower.tail = FALSE) / 2
            AIC(fit_pois, fit_nb)
            ~~~

            **Add a rootogram.** AIC and the LRT say NB beats Poisson; they don't say NB is *good*. A rootogram compares observed and expected counts at 0, 1, 2, …:

            ~~~r
            # install.packages("topmodels", repos = "https://R-Forge.R-project.org")
            topmodels::rootogram(fit_nb)
            ~~~

            A bar hanging below the zero line means the model under-predicts that count. Watch the zero bar especially: if NB still under-predicts zeros, some patients were probably never at risk (e.g. transitioned to hospice) — a zero-inflation question.

            **Skip R².** Count GLMs have no single R², and the pseudo-R² variants don't answer "is the variance structure right?"
          `,
        },
        {
          kind: "exchange",
          ref: "c1.x3",
          user: "Last one — my advisor wants the NB results \"as rate ratios\". The coefficient for reduced ejection fraction is 0.31 (SE 0.07). Is 0.31 the rate ratio?",
          framingIntro: "One step away. Two quick questions:",
          conceptSlugs: ["negative-binomial-regression", "poisson-regression", "offsets-and-exposure"],
          questions: [
            { id: "q1", format: "short_answer", prompt: "In a model with a log link, what does exponentiating a coefficient give you?" },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "Because you included log(follow-up years) as an offset, the expected count is being modeled as…",
              options: [
                "Readmissions per patient, ignoring follow-up",
                "The probability of any readmission at all",
                "Readmissions per person-year of follow-up",
              ],
            },
          ],
          responses: [
            { questionId: "q1", answer: "The multiplicative change in the expected count for a one-unit increase", dontKnow: false },
            { questionId: "q2", answer: "Readmissions per person-year of follow-up", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Incidence rate ratios",
            preview: "Exponentiated coefficients from a log-link count model with an offset are rate ratios.",
            appliedContext: "You needed to report negative binomial results as rate ratios.",
            conceptSlug: "negative-binomial-regression",
          },
          thinkMinutes: 2,
          answer: md`
            Both right, so you've essentially answered it: $e^{0.31} \approx 1.36$. Patients with reduced ejection fraction have a readmission **rate** about 36% higher than patients with preserved EF, holding age and CKD constant. Because of the offset that rate is per person-year — an *incidence rate ratio* (IRR).

            For the confidence interval, exponentiate the endpoints, not the SE:

            $$e^{\hat\beta \pm 1.96\,\widehat{SE}} = e^{0.31 \pm 1.96(0.07)} = (1.19,\ 1.56)$$

            ~~~r
            exp(cbind(IRR = coef(fit_nb), confint(fit_nb)))
            ~~~

            (\`confint\` on a \`glm.nb\` fit gives profile-likelihood intervals; with your sample size they'll be very close to the Wald interval above.)

            One sentence worth adding to the thesis: the IRR is **multiplicative**. "36% higher" means 1.36 × the baseline rate — a bigger absolute difference for older patients with CKD, whose baseline rate is already high.
          `,
        },
      ],
    },

    // ── C2 ──────────────────────────────────────────────────────────────────
    {
      ref: "c2",
      title: "Why my odds ratio \"overstates\" the effect",
      daysAgo: 19,
      startHour: 14.25,
      turns: [
        {
          kind: "exchange",
          ref: "c2.x1",
          user: "My advisor wrote \"this OR overstates the effect\" next to my table. The adjusted OR for discharge home without services (vs. home health) is 1.9 for 30-day readmission. Why would an odds ratio overstate anything?",
          framingIntro: "Your advisor is pointing at a real property of odds ratios. Two questions first:",
          conceptSlugs: ["odds-ratio-vs-risk-ratio", "logistic-regression"],
          questions: [
            { id: "q1", format: "short_answer", prompt: "What's the overall 30-day readmission rate in your cohort?" },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "When an outcome is rare (say under 10%), an odds ratio approximates which quantity?",
              options: ["The hazard ratio", "The risk difference", "The risk ratio"],
            },
          ],
          responses: [
            { questionId: "q1", answer: "18.2%", dontKnow: false },
            { questionId: "q2", answer: "The risk ratio", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Odds ratios vs. risk ratios",
            preview: "When an outcome is common, odds ratios sit further from 1 than the risk ratios readers think they're seeing.",
            appliedContext: "Your advisor flagged an OR of 1.9 for 30-day readmission as overstating the effect.",
            conceptSlug: "odds-ratio-vs-risk-ratio",
          },
          thinkMinutes: 2,
          answer: md`
            That's the whole story in two answers: the OR approximates the RR only when the outcome is rare, and **18.2% isn't rare**.

            Odds are $p/(1-p)$, and when $p$ is not small the odds grow much faster than the risk. So the OR always sits *further from 1* than the RR, and the gap widens as the baseline risk rises.

            ### Worked example
            Say patients discharged with home health have a 30-day risk of $p_0 = 0.15$.

            - Their odds: $0.15 / 0.85 = 0.176$
            - An OR of 1.9 gives odds of $1.9 \times 0.176 = 0.335$ in the no-services group
            - Converting back: $p_1 = 0.335 / 1.335 = 0.251$

            So the risk ratio is $0.251 / 0.15 \approx 1.67$ — not 1.9. The shortcut version (Zhang & Yu):

            $$RR = \frac{OR}{1 - p_0 + p_0 \cdot OR}$$

            | Baseline risk $p_0$ | RR implied by OR = 1.9 |
            |---|---|
            | 1% | 1.88 |
            | 5% | 1.82 |
            | 18% | 1.64 |
            | 30% | 1.50 |

            Your OR isn't *wrong* — it's a correct odds ratio. The problem is that readers (and reviewers) read "1.9" as "almost twice the risk", and at your baseline risk that overstates it by about a third of the excess.
          `,
        },
        {
          kind: "exchange",
          ref: "c2.x2",
          user: "Can I just plug my adjusted OR into that formula to get an adjusted RR?",
          framingIntro: "Tempting — here's what to think through first:",
          conceptSlugs: ["odds-ratio-vs-risk-ratio", "confounding", "logistic-regression"],
          questions: [
            {
              id: "q1",
              format: "short_answer",
              prompt: "The formula uses a single baseline risk p₀. In an adjusted model, does every patient in the reference group have the same baseline risk?",
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "Your adjusted OR compares two patients with the same age, CKD, EF and prior admissions. When your advisor asks for a risk ratio, does she want that patient-to-patient comparison, or a comparison of the two discharge groups as a whole?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "No — it depends on their covariates. Older, sicker patients have a higher baseline risk.", dontKnow: false },
            {
              questionId: "q2",
              answer: "The groups as a whole, I think — how much higher the readmission risk is for patients sent home without services than with home health.",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Converting adjusted odds ratios",
            preview: "The OR-to-RR formula assumes one baseline risk; adjusted models have many, so the conversion is biased.",
            appliedContext: "You wanted an adjusted risk ratio for discharge disposition from your adjusted OR.",
            conceptSlug: "odds-ratio-vs-risk-ratio",
          },
          thinkMinutes: 3,
          answer: md`
            Your first answer is exactly why the conversion breaks: in an adjusted model there is no single $p_0$. Plugging in the crude 18.2% gives a biased RR, and the bias grows with how much baseline risk varies across patients.

            Your second answer names what you're actually after: a **group-level** (marginal) risk ratio. That's a second reason the conversion can't work. Your adjusted OR is a *patient-level* (conditional) comparison — two patients with identical covariates — and for odds ratios the patient-level and group-level numbers genuinely differ, even with no confounding at all. Averaging patients' risks and then taking odds doesn't give back the same OR. That's **non-collapsibility**: the "adjusted OR" shifts whenever you add any strong predictor of readmission, confounder or not. Risk ratios and risk differences don't do this.

            So estimate the group-level RR directly. Two good options:

            **1. Modified Poisson** — Poisson regression on the binary outcome with robust standard errors. The coefficients are log risk ratios.

            ~~~r
            library(sandwich); library(lmtest)
            fit_mp <- glm(readmit30 ~ disposition + age + ckd + ef_reduced + prior_admits,
                          family = poisson(link = "log"), data = hf)
            coeftest(fit_mp, vcov = vcovHC(fit_mp, type = "HC0"))
            ~~~

            **2. Marginal standardization (g-computation)** — keep your logistic model, predict every patient's risk under each disposition, and take the ratio of the averages.

            ~~~r
            library(marginaleffects)
            fit_lr <- glm(readmit30 ~ disposition + age + ckd + ef_reduced + prior_admits,
                          family = binomial, data = hf)
            avg_comparisons(fit_lr,
                            variables = list(disposition = c("home_health", "home_no_services")),
                            comparison = "lnratioavg", transform = exp)
            ~~~

            Option 2 is literally the comparison you described: the average risk if everyone went home without services vs. if everyone went home with home health. Option 1 gives a covariate-adjusted RR, but because the RR is collapsible the two usually agree closely (unless the effect varies a lot across patients). Option 2 also gives your advisor the risk difference for free.
          `,
        },
        {
          kind: "exchange",
          ref: "c2.x3",
          user: "I tried a log-binomial model first (glm with binomial(link = \"log\")) and it won't converge. Did I do something wrong?",
          framingIntro: "Not your fault — it's a known quirk. One question to see why:",
          conceptSlugs: ["odds-ratio-vs-risk-ratio", "poisson-regression"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "A log-binomial model says p = exp(Xβ). Which constraint on a probability does exp(Xβ) NOT respect automatically?",
              options: ["It must be at most 1", "It must be positive", "It must sum to 1 over patients"],
            },
          ],
          responses: [{ questionId: "q1", answer: "It must be at most 1", dontKnow: false }],
          status: "answered",
          skipCallout: {
            title: "Log-binomial convergence",
            preview: "exp(Xβ) can exceed 1, so the maximum likelihood estimate often sits on a boundary and the fit fails.",
            appliedContext: "Your log-binomial model for 30-day readmission wouldn't converge.",
            conceptSlug: "odds-ratio-vs-risk-ratio",
          },
          thinkMinutes: 1,
          answer: md`
            Exactly. $e^{X\beta}$ is always positive but nothing stops it going above 1. For your highest-risk covariate patterns (older, CKD, several prior admissions) the likelihood pushes predicted risks toward 1, the estimate ends up on the boundary of the allowed space, and the optimizer gives up.

            Two fixes:

            - **Give it starting values** from the modified Poisson fit: \`glm(..., family = binomial(link = "log"), start = coef(fit_mp))\`. Sometimes that's enough.
            - **Just use modified Poisson.** It estimates the same risk ratio, always converges, and the robust SEs fix its wrong variance assumption. Its only flaw is that a few predicted risks can exceed 1 — irrelevant when you're reporting RRs.

            In the thesis: "Risk ratios were estimated with modified Poisson regression (Zou, 2004) with robust standard errors because log-binomial models failed to converge."
          `,
        },
      ],
    },

    // ── C3 ──────────────────────────────────────────────────────────────────
    {
      ref: "c3",
      title: "Clustering by hospital: mixed models, ICC, random slopes",
      daysAgo: 13,
      startHour: 10,
      turns: [
        {
          kind: "exchange",
          ref: "c3.x1",
          user: "My 21,400 patients come from 43 hospitals. A reviewer on my proposal said I \"ignored clustering\". Do I need a mixed model, and what does it actually change?",
          framingIntro: "Good catch by the reviewer. Let's pin down what clustering does before choosing the fix.",
          conceptSlugs: ["mixed-effects-models", "intraclass-correlation", "generalized-estimating-equations"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "Why does clustering by hospital matter for your analysis?",
              options: [
                "It biases every coefficient toward zero, like measurement error",
                "It only matters when hospitals have very different patient counts",
                "Same-hospital patients are alike, so there's less independent information",
              ],
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "Do you want the effect for a patient at a given hospital, or the effect averaged over the whole population of patients?",
            },
            { id: "q3", format: "short_answer", prompt: "What makes hospitals different from one another in ways that could affect readmission?" },
          ],
          responses: [
            {
              questionId: "q1",
              answer: "Same-hospital patients are alike, so there's less independent information",
              dontKnow: false,
            },
            { questionId: "q2", answer: null, dontKnow: true },
            {
              questionId: "q3",
              answer: "Discharge planning programs, how sick their patients are, whether they have a heart failure clinic, rural vs urban",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Clustered data",
            preview: "Patients within a hospital are correlated; ignoring it makes standard errors too small.",
            appliedContext: "A reviewer said your readmission analysis ignored clustering by hospital.",
            conceptSlug: "mixed-effects-models",
          },
          thinkMinutes: 4,
          answer: md`
            Your first answer is the core of it. Patients at the same hospital share discharge practices, case mix and follow-up programs (your third answer lists exactly these), so they're correlated. Ignoring that makes standard errors **too small** — the coefficients aren't biased toward zero, you're just more confident than you should be.

            ### How much?
            The **design effect** for a cluster-level comparison is

            $$\text{DEFF} = 1 + (\bar m - 1)\,\rho$$

            with $\bar m$ the average cluster size and $\rho$ the intraclass correlation. You have $\bar m = 21{,}400 / 43 \approx 498$. Even a small $\rho = 0.02$ gives $\text{DEFF} = 1 + 497 \times 0.02 \approx 10.9$: for hospital-level variables your 21,400 patients carry about as much information as ~2,000 independent ones. (Patient-level predictors that vary *within* hospitals, like age, are hit much less.)

            ### Your "I don't know" is the real fork
            - **Conditional** (mixed model / GLMM): the effect for a patient *at a given hospital*.
            - **Marginal** (GEE): the effect averaged over the population of patients.

            For a logistic model these differ — the conditional OR is further from 1, the same non-collapsibility you met with adjusted ORs. Since hospital variation is itself interesting to you, I'd make the GLMM primary:

            ~~~r
            library(lme4)
            fit_glmm <- glmer(readmit30 ~ disposition + age + ckd + ef_reduced + prior_admits +
                                (1 | hospital_id),
                              family = binomial, data = hf,
                              control = glmerControl(optimizer = "bobyqa"))
            summary(fit_glmm)
            ~~~

            If a committee member wants population-averaged effects, GEE is the complement:

            ~~~r
            library(geepack)
            hf <- hf[order(hf$hospital_id), ]   # geeglm expects each cluster's rows together
            fit_gee <- geeglm(readmit30 ~ disposition + age + ckd + ef_reduced + prior_admits,
                              id = hospital_id, family = binomial, corstr = "exchangeable", data = hf)
            ~~~

            With 43 clusters, GEE's robust standard errors are usable but slightly optimistic; a small-sample correction is worth a footnote.
          `,
        },
        {
          kind: "exchange",
          ref: "c3.x2",
          user: "glmer says the hospital random intercept variance is 0.12. Is that big? My advisor asked for an ICC.",
          framingIntro: "Let's turn 0.12 into something you can feel. Two questions:",
          conceptSlugs: ["intraclass-correlation", "mixed-effects-models"],
          questions: [
            {
              id: "q1",
              format: "short_answer",
              prompt: "In the latent-variable view of logistic regression, the patient-level error follows a standard logistic distribution. What's its variance?",
            },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "An ICC is a share. A share of what?",
              options: [
                "Of the variation in readmission propensity: the part between hospitals",
                "Of all readmissions: the ones caused by the hospital a patient was in",
                "Of the discharge-disposition effect: the part explained by hospital",
              ],
            },
          ],
          responses: [
            { questionId: "q1", answer: "π²/3? About 3.29", dontKnow: false },
            { questionId: "q2", answer: "Of the variation in readmission propensity: the part between hospitals", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "ICC for logistic mixed models",
            preview: "On the latent scale the ICC is σ²ᵤ / (σ²ᵤ + π²/3).",
            appliedContext: "Your advisor asked for an ICC from the hospital random intercept.",
            conceptSlug: "intraclass-correlation",
          },
          thinkMinutes: 2,
          answer: md`
            Both right, and together they're the whole formula. The ICC is the between-hospital share of the total latent variance, and your 3.29 is the within-hospital (patient-level) part:

            $$\rho = \frac{\sigma^2_u}{\sigma^2_u + \pi^2/3} = \frac{0.12}{0.12 + 3.29} \approx 0.035$$

            So about 3.5% of the variation in underlying readmission propensity is between hospitals. Small as a share — but remember the design effect: with ~498 patients per hospital, 0.035 still matters a lot for inference.

            ### A number your advisor will like more: the median odds ratio
            The MOR asks: take two *identical* patients at two randomly chosen hospitals; what's the median odds ratio between the higher-risk and lower-risk hospital?

            $$\text{MOR} = \exp\!\left(\sqrt{2\sigma^2_u}\;\Phi^{-1}(0.75)\right) = \exp\!\left(\sqrt{0.24} \times 0.674\right) \approx 1.39$$

            So which hospital you're discharged from is worth a median 39% increase in odds — on the same scale as your covariate ORs, which makes it easy to compare with the disposition effect.

            ~~~r
            sigma2_u <- as.numeric(VarCorr(fit_glmm)$hospital_id)
            icc <- sigma2_u / (sigma2_u + pi^2 / 3)
            mor <- exp(sqrt(2 * sigma2_u) * qnorm(0.75))
            c(icc = icc, mor = mor)
            ~~~
          `,
        },
        {
          kind: "exchange",
          ref: "c3.x4",
          user: "Wait — why not just put hospital in as a fixed effect, with 42 dummy variables?",
          framingIntro: "Worth thinking through, since it changes what you can estimate:",
          conceptSlugs: ["fixed-vs-random-effects", "mixed-effects-models"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "What do you give up by estimating a separate intercept for every hospital?",
              options: [
                "Nothing: dummies and a random intercept are the same model",
                "Estimates for hospital-level variables like teaching status",
                "Control of confounding by patient-level variables like age",
              ],
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "Are these 43 hospitals the ones you care about, or a sample standing in for hospitals in general?",
            },
          ],
          status: "skipped",
          skipItemRef: "ll-fixed-random",
          skipCallout: {
            title: "Fixed vs. random effects for hospitals",
            preview:
              "Hospital dummies control for everything about a hospital but can't estimate hospital-level effects; random intercepts can, and they shrink small hospitals toward the average.",
            appliedContext: "You asked whether to replace the random intercept in your readmission GLMM with 42 hospital dummy variables.",
            conceptSlug: "fixed-vs-random-effects",
          },
          thinkMinutes: 0.5,
          answer: md`
            Short answer: you can, and it's a good **sensitivity analysis**, but it changes what you can estimate.

            - **Fixed effects** (hospital dummies) absorb *everything* about each hospital, measured or not. That's great for patient-level effects like disposition. But you can no longer estimate hospital-level variables such as teaching status or having a heart-failure clinic — they're perfectly collinear with the dummies — and small hospitals get noisy intercepts.
            - **Random intercepts** keep hospital-level covariates estimable and partially pool small hospitals toward the average. The price is an assumption: hospital effects are uncorrelated with your covariates.

            For the thesis: keep the GLMM as primary and report the fixed-effects model for the disposition effect as a sensitivity analysis. If the two agree, that assumption isn't doing much work.

            I saved the fuller comparison to Learn It Later so it doesn't derail you now.
          `,
        },
        {
          kind: "exchange",
          ref: "c3.x3",
          user: "The reviewer also asked whether the effect of discharge disposition differs across hospitals. Is that a random slope?",
          framingIntro: "It is. Two quick questions to make sure the model matches the question:",
          conceptSlugs: ["mixed-effects-models", "likelihood-ratio-test"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "A random slope for disposition lets what vary across hospitals?",
              options: ["The effect of discharge disposition", "The baseline readmission risk", "The number of patients per hospital"],
            },
            { id: "q2", format: "short_answer", prompt: "Why might going home without services be riskier at some hospitals than others?" },
          ],
          responses: [
            { questionId: "q1", answer: "The effect of discharge disposition", dontKnow: false },
            {
              questionId: "q2",
              answer: "Some hospitals do follow-up phone calls or have transitional care programs, so going home without services is less risky there",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Random slopes",
            preview: "A random slope lets a covariate's effect vary across clusters.",
            appliedContext: "A reviewer asked whether the disposition effect differs across hospitals.",
            conceptSlug: "mixed-effects-models",
          },
          thinkMinutes: 3,
          answer: md`
            Yes on both — and your mechanism is a good one to name in the discussion. The model:

            ~~~r
            fit_slope <- glmer(readmit30 ~ disposition + age + ckd + ef_reduced + prior_admits +
                                 (1 + disposition | hospital_id),
                               family = binomial, data = hf,
                               control = glmerControl(optimizer = "bobyqa"))
            anova(fit_glmm, fit_slope)   # LRT: does the slope variance matter?
            ~~~

            Three things to know:

            1. **The LRT is conservative here.** Same boundary issue as the NB test: a variance can't be negative. The slope model adds a variance *and* a covariance, so the correct reference is a mixture of $\chi^2_1$ and $\chi^2_2$. The naive p-value is too big — if it's already significant, you're fine.
            2. **Interpret the slope SD, not just the test.** If the fixed effect is $\hat\beta = 0.64$ (OR 1.9) and the slope SD is $\hat\tau = 0.25$, then about 95% of hospitals have a log-OR within $0.64 \pm 1.96(0.25)$, i.e. hospital-specific ORs from about **1.16 to 3.1**. That range is the answer to the reviewer's question.
            3. **Singular fits are common** with 43 hospitals. If glmer warns about a singular fit, the data can't support the slope variance — report that honestly rather than forcing it.
          `,
        },
      ],
    },

    // ── C4 ──────────────────────────────────────────────────────────────────
    {
      ref: "c4",
      title: "Death as a competing risk for readmission",
      daysAgo: 6,
      startHour: 16.5,
      turns: [
        {
          kind: "exchange",
          ref: "c4.x1",
          user: "About 6% of my cohort dies within 30 days without being readmitted. Right now I'm just dropping them. My advisor said that's \"not ideal\" but didn't elaborate — what's wrong with dropping them?",
          framingIntro: "Your advisor is being diplomatic. Three questions that make the issue concrete:",
          conceptSlugs: ["competing-risks", "survival-analysis"],
          questions: [
            { id: "q1", format: "short_answer", prompt: "If you drop patients who died, which kind of patient are you preferentially removing?" },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "Suppose you instead censored deaths in a Kaplan–Meier analysis of time to readmission. What does censoring assume about a patient who died on day 10?",
              options: [
                "That they were never at risk of readmission in the first place",
                "That they count as readmitted on day 10, when follow-up ended",
                "That they stay at risk afterwards, like similar patients still followed",
              ],
            },
            {
              id: "q3",
              format: "short_answer",
              prompt: "Does everyone who survives have the full 30 days of follow-up in your data, or were some discharged too close to the end of your data window?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "The sickest ones — probably the ones most likely to be readmitted", dontKnow: false },
            { questionId: "q2", answer: "That they were never at risk of readmission in the first place", dontKnow: false },
            {
              questionId: "q3",
              answer: "Almost everyone. The extract runs through June 30, 2025, so only patients discharged in June have less than 30 days.",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Competing risks",
            preview: "Death prevents readmission; dropping or censoring deaths both distort readmission estimates.",
            appliedContext: "You were dropping the 6% of patients who died within 30 days.",
            conceptSlug: "competing-risks",
          },
          thinkMinutes: 5,
          answer: md`
            Your first answer is exactly the problem: dropping deaths removes the sickest patients, and the patients left behind are a healthier, selected group. The denominator no longer describes "patients discharged after heart failure".

            On censoring, it's actually the reverse of "never at risk" — and that's precisely why censoring deaths is wrong here. Censoring assumes the patient **could still be readmitted later, at the same risk as similar patients still being followed**. That's fine for someone who moved away. A patient who died can never be readmitted, so Kaplan–Meier keeps "expecting" readmissions from people who can't have them.

            ### A 100-patient example
            100 patients, all followed for 30 days. 10 die on day 5; 20 are readmitted on day 15.

            - **True proportion readmitted:** $20/100 = 20\%$.
            - **1 − KM, censoring deaths:** at day 15 the risk set is 90, so $\hat S = 1 - 20/90 = 0.778$ and $1 - \hat S = 22.2\%$ — **too high**, because the 10 dead patients were quietly treated as future readmission candidates.
            - **Drop the deaths:** $20/90 = 22.2\%$ — the same inflation.
            - **Cumulative incidence (Aalen–Johansen):** 20%. It treats death as its own outcome, so the dead leave the risk set *without* being counted as censored.

            ### What that means for your data
            Your third answer settles the practical side. For patients with the full 30 days, the simple proportion — readmissions ÷ everyone discharged alive, deaths kept in the denominator — *is* the cumulative incidence. It's only your June discharges, with less than 30 days, that need the survival machinery, and there the cumulative incidence function handles the incomplete follow-up and the deaths at once. Using it for the whole cohort gives the same number as the simple proportion where follow-up is complete, so it's the one estimator to report:

            ~~~r
            library(survival)
            # status: 0 = censored, 1 = readmitted, 2 = died. A factor whose first level is censoring
            # makes survfit() compute Aalen–Johansen cumulative incidence.
            hf$status <- factor(hf$status, levels = 0:2, labels = c("censored", "readmit", "death"))
            cif <- survfit(Surv(days, status) ~ disposition, data = hf)
            summary(cif, times = 30)
            ~~~
          `,
        },
        {
          kind: "exchange",
          ref: "c4.x2",
          user: "OK, that makes sense. For the regression part I've seen both \"cause-specific Cox\" and \"Fine–Gray\". Which one do I report?",
          framingIntro: "It depends on the question you're asking. Two quick ones:",
          conceptSlugs: ["competing-risks", "cox-proportional-hazards"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "What's the main question for this part of the thesis?",
              options: [
                "Etiology: does discharge disposition change the rate at which patients are readmitted?",
                "Prediction: what fraction of patients like this will be readmitted by day 30?",
                "Both: the rate for etiology and the fraction for prediction",
              ],
            },
            { id: "q2", format: "short_answer", prompt: "In a cause-specific Cox model for readmission, what happens to a patient when they die?" },
          ],
          responses: [
            { questionId: "q1", answer: "Both: the rate for etiology and the fraction for prediction", dontKnow: false },
            { questionId: "q2", answer: "They're censored at death?", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Cause-specific vs. Fine–Gray models",
            preview: "Cause-specific hazards answer etiologic questions; Fine–Gray models the cumulative incidence directly.",
            appliedContext: "You needed to choose a regression model for readmission with death as a competing risk.",
            conceptSlug: "competing-risks",
          },
          thinkMinutes: 3,
          answer: md`
            Yes — in a cause-specific model, deaths are censored. That's legitimate *there* (unlike 1 − KM) because the cause-specific hazard only asks: among patients still alive and not yet readmitted, how fast are readmissions happening? It never claims to be a proportion.

            Since your answer to the first question was "both", report both kinds of model — the standard recommendation (Austin & Fine, 2017):

            | Question | Model | Reports |
            |---|---|---|
            | Does disposition change the *rate* of readmission? | Cause-specific Cox, **for both readmission and death** | Hazard ratios |
            | What *share* of patients get readmitted? | Cumulative incidence curves; Fine–Gray if you need covariates | Subdistribution HRs, predicted CIFs |

            Why model death too? An exposure can lower the cumulative incidence of readmission simply by **raising mortality** — dead patients can't come back. Only looking at both cause-specific hazards tells those apart.

            ~~~r
            # Cause-specific hazards: one Cox model per event, censoring the other
            cs_readmit <- coxph(Surv(days, status == "readmit") ~ disposition + age + ckd + ef_reduced +
                                  cluster(hospital_id), data = hf)
            cs_death   <- coxph(Surv(days, status == "death") ~ disposition + age + ckd + ef_reduced +
                                  cluster(hospital_id), data = hf)

            # Fine–Gray subdistribution hazard for readmission
            fg_data <- finegray(Surv(days, status) ~ ., data = hf, etype = "readmit")
            fg <- coxph(Surv(fgstart, fgstop, fgstatus) ~ disposition + age + ckd + ef_reduced,
                        weights = fgwt, data = fg_data)
            ~~~

            Interpretation tip: a Fine–Gray HR of 1.3 means disposition is associated with a higher *cumulative incidence* of readmission — don't describe it as a 30% higher readmission rate.
          `,
        },
        {
          kind: "exchange",
          ref: "c4.x3",
          user: "How do I check proportional hazards for the cause-specific readmission model? The cumulative incidence curves by disposition cross around day 5.",
          framingIntro: "Crossing curves are worth following up. Two questions first:",
          conceptSlugs: ["cox-proportional-hazards", "proportional-hazards-assumption"],
          questions: [
            { id: "q1", format: "short_answer", prompt: "In words, what does the proportional hazards assumption say about the disposition hazard ratio over the 30 days?" },
            {
              id: "q2",
              format: "short_answer",
              prompt: "A cumulative incidence curve for readmission depends on more than how fast patients are readmitted. What else could differ between your disposition groups and shape those curves?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "That it stays constant over time", dontKnow: false },
            {
              questionId: "q2",
              answer: "Deaths? If one group has more deaths in the first few days, fewer of them are left to be readmitted.",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Checking proportional hazards",
            preview: "Schoenfeld residuals test whether a hazard ratio is constant over follow-up.",
            appliedContext: "Your readmission curves by disposition cross around day 5.",
            conceptSlug: "proportional-hazards-assumption",
          },
          thinkMinutes: 2,
          answer: md`
            Both right, and your second answer is why the crossing is a reason to check rather than proof. A cumulative incidence curve blends two hazards: how fast patients are readmitted *and* how fast they die. A group with more early deaths has fewer patients left to be readmitted, so its curve can fall behind — and the curves can cross — even when the readmission hazard ratio is perfectly constant.

            So look at the readmission hazard on its own, which is what the cause-specific model and its assumption are about:

            - **Plot it:** Kaplan–Meier curves for readmission with deaths censored. That's the wrong tool for a *proportion* (as before), but it's exactly the cause-specific picture. Curves that cross here, or log(−log) curves that aren't parallel, point at non-proportional hazards.
            - **Plot deaths too:** if the death curves split early, that alone can explain the crossing cumulative incidence.
            - **Test it** with scaled Schoenfeld residuals:

            ~~~r
            zph <- cox.zph(cs_readmit)
            zph                         # per-covariate and global tests
            plot(zph["disposition"])    # smoothed log-HR over time; a flat line = PH holds
            ~~~

            **If it fails, model the change** instead of hiding it. A plausible story: patients sent home without services are readmitted *early* (the first week, when discharge plans fail) and the difference fades later. Splitting follow-up at day 7 gives an early and a late hazard ratio:

            ~~~r
            hf$readmit_event <- as.integer(hf$status == "readmit")
            hf_split <- survSplit(Surv(days, readmit_event) ~ ., data = hf,
                                  cut = 7, episode = "period")
            cs_split <- coxph(Surv(tstart, days, readmit_event) ~ disposition:strata(period) +
                                age + ckd + ef_reduced, data = hf_split)
            ~~~

            With 21,400 patients, \`cox.zph\` will flag tiny, clinically meaningless departures too — so judge by the plot, not just the p-value.
          `,
        },
      ],
    },

    // ── C5 ──────────────────────────────────────────────────────────────────
    {
      ref: "c5",
      title: "Aim 3: SNF discharge, propensity scores and missing frailty",
      daysAgo: 1,
      startHour: 9.5,
      turns: [
        {
          kind: "exchange",
          ref: "c5.x1",
          user: "New analysis for aim 3: does discharge to a skilled nursing facility (vs. home with home health) reduce 30-day readmission? About 3,900 SNF patients. I'm planning propensity score matching with MatchIt. How do I build the propensity model?",
          framingIntro: "Good design for this question. Two checks on the propensity model before we build it:",
          conceptSlugs: ["propensity-score-matching", "confounding", "logistic-regression"],
          questions: [
            {
              id: "q1",
              format: "multi_select",
              prompt: "Which of these belong in the propensity score model?",
              options: [
                "Age and Charlson comorbidity index at admission",
                "Length of the index hospital stay",
                "Number of outpatient visits in the 30 days after discharge",
                "Whether the patient lived alone before admission",
              ],
            },
            { id: "q2", format: "short_answer", prompt: "What would it tell you if many SNF patients had propensity scores above 0.95?" },
          ],
          responses: [
            {
              questionId: "q1",
              answer: [
                "Age and Charlson comorbidity index at admission",
                "Length of the index hospital stay",
                "Number of outpatient visits in the 30 days after discharge",
                "Whether the patient lived alone before admission",
              ],
              dontKnow: false,
            },
            { questionId: "q2", answer: null, dontKnow: true },
          ],
          status: "answered",
          skipCallout: {
            title: "Building a propensity score model",
            preview: "Include pre-treatment common causes of treatment and outcome; never post-treatment variables.",
            appliedContext: "You're estimating the effect of SNF discharge on 30-day readmission with MatchIt.",
            conceptSlug: "propensity-score-matching",
          },
          thinkMinutes: 4,
          answer: md`
            Three of your four belong — one with a caveat. The propensity model's job is to capture **pre-treatment common causes** of the discharge decision and of readmission.

            - **Age and Charlson** ✓ — classic confounders.
            - **Lived alone** ✓ — one of the strongest drivers of SNF placement, and it predicts readmission. Good instinct.
            - **Length of stay** ✓, with a caveat — it marks severity, but it isn't cleanly pre-treatment: patients waiting for a SNF bed stay longer *because* of the discharge plan. If your EHR extract has it, count days only up to the discharge-decision date (or the date the patient was medically ready to leave), and define \`los_days\` that way.
            - **Outpatient visits after discharge** ✗ — this happens *after* treatment and is likely *affected* by it (SNF patients see physicians inside the facility). Adjusting for a post-treatment variable blocks part of the effect you're trying to estimate and can introduce bias. Rule of thumb: if it's measured after the discharge decision, it stays out.

            Also: don't choose variables by p-values or by how well the model predicts treatment. The goal is **balance**, not a high c-statistic.

            ### Your "I don't know": scores near 1
            A propensity score of 0.97 means patients like this almost always go to a SNF — there are essentially no comparable home-health patients. That's a **positivity** (overlap) problem: the data can't tell you what would have happened to them at home. Matching will quietly drop them, which changes *who* your estimate describes. Always look at the overlap first:

            ~~~r
            library(MatchIt)
            m_out <- matchit(snf ~ age + charlson + los_days + lived_alone + adl_dependent +
                               prior_admits + ef_reduced + payer,
                             data = aim3, method = "nearest", distance = "glm",
                             link = "linear.logit", caliper = 0.2, std.caliper = TRUE)
            summary(m_out)
            plot(m_out, type = "jitter")   # overlap of propensity scores
            ~~~

            \`link = "linear.logit"\` with \`std.caliper = TRUE\` sets the caliper at 0.2 SD of the *logit* of the propensity score, the usual recommendation.
          `,
        },
        {
          kind: "exchange",
          ref: "c5.x2",
          user: "Matching dropped 31% of the SNF patients — no match within the caliper. Is that a problem, or just how matching works?",
          framingIntro: "It's how matching works, and it can still be a problem. Two questions:",
          conceptSlugs: ["propensity-score-matching"],
          questions: [
            { id: "q1", format: "short_answer", prompt: "Which SNF patients do you think were hardest to match?" },
            {
              id: "q2",
              format: "short_answer",
              prompt: "When you report the effect of SNF discharge, which patients do you want that effect to describe?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "The oldest, most dependent ones — basically nobody like them goes home", dontKnow: false },
            { questionId: "q2", answer: "SNF patients in general — the people clinicians are actually sending to SNFs.", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Estimands after matching",
            preview: "Dropping unmatched treated patients changes the population your estimate describes.",
            appliedContext: "Your caliper matching dropped 31% of SNF patients.",
            conceptSlug: "propensity-score-matching",
          },
          thinkMinutes: 3,
          answer: md`
            Put your two answers side by side and you have the problem. You want the effect for SNF patients in general (the ATT). But the patients hardest to match — the oldest, most dependent ones — are exactly the ones the caliper dropped. Once they're gone, the estimate describes **SNF patients who had comparable home-health patients**: a younger, less dependent subgroup, not SNF patients in general.

            That matters for your question: the patients SNF care might help most are the ones you dropped. A null result in the matched sample wouldn't show SNF is useless for them.

            What to do:

            1. **Describe who was dropped.** A table of matched vs. unmatched SNF patients (age, ADL dependence, Charlson). Reviewers respect this.
            2. **Name the estimand honestly**, e.g. "the effect among SNF patients with comparable home-discharged patients".
            3. **Try a method that keeps everyone** as a sensitivity analysis. Full matching keeps all treated patients:

            ~~~r
            m_full <- matchit(snf ~ age + charlson + los_days + lived_alone + adl_dependent +
                                prior_admits + ef_reduced + payer,
                              data = aim3, method = "full", distance = "glm", estimand = "ATT")
            md_full <- match.data(m_full)

            library(marginaleffects)
            fit <- glm(readmit30 ~ snf, data = md_full, weights = weights, family = quasibinomial)
            avg_comparisons(fit, variables = "snf", vcov = ~subclass, newdata = subset(md_full, snf == 1),
                            wts = "weights", comparison = "lnratioavg", transform = exp)
            ~~~

            If full matching and caliper matching tell the same story, the dropped patients weren't driving the result. If they don't, that difference *is* a finding.
          `,
        },
        {
          kind: "exchange",
          ref: "c5.x3",
          user: "The frailty score is missing for 12% of patients, mostly from 6 hospitals that didn't use the assessment tool. Can I just drop those patients before matching?",
          framingIntro: "Depends on *why* it's missing. Two questions:",
          conceptSlugs: ["multiple-imputation", "missing-data-mechanisms"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "Whether a patient's frailty score is missing depends on…",
              options: [
                "Nothing in particular, like a lab analyzer failing on random days",
                "Things you observe, such as which hospital the patient was in",
                "Frailty itself: frailer patients were less likely to be assessed",
              ],
            },
            {
              id: "q2",
              format: "short_answer",
              prompt: "Do those six hospitals differ from the other 37 — in case mix, size, or how often they discharge patients to a SNF?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "Things you observe, such as which hospital the patient was in", dontKnow: false },
            {
              questionId: "q2",
              answer: "Somewhat. Four of them are small rural hospitals, and together they send fewer patients to SNFs (about 12% vs. 19%).",
              dontKnow: false,
            },
          ],
          status: "answered",
          skipCallout: {
            title: "Handling missing covariates",
            preview: "Why data are missing decides whether dropping incomplete cases is safe.",
            appliedContext: "Frailty is missing for 12% of your aim 3 cohort.",
            conceptSlug: "multiple-imputation",
          },
          thinkMinutes: 3,
          answer: md`
            Your first answer is the right classification: missingness driven by *which hospital* is **missing at random (MAR)** — it depends on something you observe.

            Your second answer shows why that matters. Dropping incomplete cases is only guaranteed to be harmless when data are missing *completely* at random:

            - **MCAR** (completely at random): complete-case analysis is unbiased, just less powerful.
            - **MAR** (depends on observed data): complete-case analysis can be **biased**.

            Here, dropping 12% means dropping mostly six hospitals that are smaller, more rural and send fewer patients to SNFs. Your matched sample would under-represent exactly those settings, and if SNF discharge works differently there, the estimate shifts. So: **multiple imputation**, with hospital in the imputation model.

            Two rules people get wrong:
            1. **Include the outcome** (readmit30) in the imputation model. It feels like cheating; leaving it out biases the frailty–readmission relationship toward zero.
            2. **Match within each imputed dataset**, then pool — don't average the imputations into one dataset.

            Pooling uses Rubin's rules. With $m$ imputations, estimates $\hat Q_j$ and variances $U_j$:

            $$\bar Q = \frac{1}{m}\sum_{j=1}^m \hat Q_j, \qquad T = \bar U + \left(1 + \frac{1}{m}\right) B$$

            where $B$ is the between-imputation variance of the $\hat Q_j$. The $B$ term is the honest cost of not knowing the missing values.

            ~~~r
            library(mice); library(MatchThem)
            imp <- mice(aim3, m = 20, seed = 2026, printFlag = FALSE)   # includes readmit30, hospital_id
            mt  <- matchthem(snf ~ age + charlson + los_days + lived_alone + frailty + prior_admits,
                             datasets = imp, approach = "within",
                             method = "nearest", link = "linear.logit", caliper = 0.2)
            fits <- with(mt, glm(readmit30 ~ snf, family = quasipoisson(link = "log")))
            summary(pool(fits), conf.int = TRUE, exponentiate = TRUE)
            ~~~

            MI assumes MAR, and nothing in the data can confirm that. If frailer patients at the *other* hospitals were also less likely to be assessed, you're in MNAR territory — I've flagged that for later.
          `,
        },
        {
          kind: "lookup",
          ref: "c5.l1",
          user: "Quick one before my advisor meeting — what's the R code for the covariate balance table after matchit? I just need the table.",
          calloutRefs: ["ll-caliper", "ll-smd"],
          answer: md`
            ~~~r
            library(cobalt)
            bal.tab(m_out, un = TRUE, stats = c("m", "v"), thresholds = c(m = 0.1))

            love.plot(m_out, stats = "m", abs = TRUE, thresholds = c(m = 0.1),
                      var.order = "unadjusted")
            ~~~

            - \`un = TRUE\` shows balance before and after matching side by side.
            - \`stats = c("m", "v")\` gives standardized mean differences and variance ratios.
            - \`thresholds = c(m = 0.1)\` flags any covariate with |SMD| above 0.1.

            The Love plot is usually what advisors want to see. For a thesis table, \`bal.tab(...)$Balance\` is a data frame you can pass to \`gt\` or \`kableExtra\`.
          `,
        },
      ],
    },
  ],
};
