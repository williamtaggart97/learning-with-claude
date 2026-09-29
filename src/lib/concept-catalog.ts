// Shared concept catalog (Concept table seed + router context + suggested
// topics). Pure data, safe anywhere. The seed upserts these by slug; the
// assessor may add new slugs at runtime, so the DB can hold more than this.
//
// `related` is a small, hand-curated graph used by getProfile() to derive
// "suggested next topics" deterministically (no LLM). Edges are directed
// ("if you're working on X, Y is a natural next step") and should point at
// slugs in this catalog.

export interface CatalogConcept {
  /** kebab-case, stable. */
  slug: string;
  name: string;
  domain: string;
  /** One sentence, written for a learner. */
  description: string;
  related: string[];
}

export const CONCEPT_CATALOG: readonly CatalogConcept[] = [
  // ── Regression & GLMs ─────────────────────────────────────────────────────
  {
    slug: "linear-regression",
    name: "Linear regression",
    domain: "regression",
    description: "Models a continuous outcome as a linear function of predictors, estimated by least squares.",
    related: ["interaction-terms", "regularization", "logistic-regression"],
  },
  {
    slug: "logistic-regression",
    name: "Logistic regression",
    domain: "regression",
    description: "A GLM for binary outcomes that models the log-odds of the outcome as linear in the predictors.",
    related: ["odds-ratio-vs-risk-ratio", "probability-calibration", "interaction-terms"],
  },
  {
    slug: "poisson-regression",
    name: "Poisson regression",
    domain: "regression",
    description: "A log-link GLM for counts that assumes the variance equals the mean.",
    related: ["overdispersion", "offsets-and-exposure", "negative-binomial-regression"],
  },
  {
    slug: "negative-binomial-regression",
    name: "Negative binomial regression",
    domain: "regression",
    description: "A count model that adds a dispersion parameter so the variance can exceed the mean.",
    related: ["zero-inflated-models", "likelihood-ratio-test", "offsets-and-exposure"],
  },
  {
    slug: "overdispersion",
    name: "Overdispersion",
    domain: "regression",
    description: "When count data vary more than a Poisson model allows, making Poisson standard errors too small.",
    related: ["negative-binomial-regression", "zero-inflated-models"],
  },
  {
    slug: "zero-inflated-models",
    name: "Zero-inflated and hurdle models",
    domain: "regression",
    description: "Count models with a separate process for excess zeros, e.g. people who were never at risk of the event.",
    related: ["negative-binomial-regression", "overdispersion"],
  },
  {
    slug: "offsets-and-exposure",
    name: "Offsets and exposure time",
    domain: "regression",
    description: "Adding log(person-time) with a fixed coefficient of 1 so a count model estimates rates, not raw counts.",
    related: ["poisson-regression", "negative-binomial-regression"],
  },
  {
    slug: "interaction-terms",
    name: "Interaction terms and effect modification",
    domain: "regression",
    description: "Letting the effect of one predictor depend on the level of another — and why the scale (additive vs multiplicative) matters.",
    related: ["confounding", "logistic-regression"],
  },
  {
    slug: "regularization",
    name: "Regularization (ridge and lasso)",
    domain: "machine learning",
    description: "Penalizing coefficient size to trade a little bias for less variance and better out-of-sample prediction.",
    related: ["bias-variance-tradeoff", "cross-validation"],
  },
  // ── Clustered / longitudinal data ─────────────────────────────────────────
  {
    slug: "mixed-effects-models",
    name: "Mixed-effects (multilevel) models",
    domain: "clustered data",
    description: "Models with random effects for groups such as stores, schools or hospitals, giving cluster-specific (conditional) estimates.",
    related: ["intraclass-correlation", "fixed-vs-random-effects", "generalized-estimating-equations"],
  },
  {
    slug: "fixed-vs-random-effects",
    name: "Fixed vs. random effects",
    domain: "clustered data",
    description: "Whether to estimate a separate intercept for every group or treat groups as draws from a distribution.",
    related: ["mixed-effects-models", "confounding"],
  },
  {
    slug: "generalized-estimating-equations",
    name: "Generalized estimating equations (GEE)",
    domain: "clustered data",
    description: "Population-averaged (marginal) regression with robust standard errors that account for within-cluster correlation.",
    related: ["mixed-effects-models", "intraclass-correlation"],
  },
  {
    slug: "intraclass-correlation",
    name: "Intraclass correlation (ICC)",
    domain: "clustered data",
    description: "The share of outcome variance that lies between clusters; drives the design effect.",
    related: ["mixed-effects-models", "statistical-power"],
  },
  // ── Epidemiology & causal inference ───────────────────────────────────────
  {
    slug: "odds-ratio-vs-risk-ratio",
    name: "Odds ratios vs. risk ratios",
    domain: "epidemiology",
    description: "Why odds ratios exaggerate risk ratios when the outcome is common, and how to estimate risk ratios directly.",
    related: ["g-computation", "logistic-regression", "confounding"],
  },
  {
    slug: "confounding",
    name: "Confounding",
    domain: "causal inference",
    description: "A common cause of exposure and outcome that distorts their association unless it is adjusted for.",
    related: ["directed-acyclic-graphs", "propensity-score-matching", "sensitivity-analysis"],
  },
  {
    slug: "directed-acyclic-graphs",
    name: "Directed acyclic graphs (DAGs)",
    domain: "causal inference",
    description: "Causal diagrams for deciding which variables to adjust for — and which (colliders, mediators) to leave alone.",
    related: ["confounding", "propensity-score-matching"],
  },
  {
    slug: "propensity-score-matching",
    name: "Propensity score matching",
    domain: "causal inference",
    description: "Pairing treated and untreated units with similar probabilities of treatment to mimic a randomized comparison.",
    related: ["standardized-mean-difference", "inverse-probability-weighting", "sensitivity-analysis"],
  },
  {
    slug: "inverse-probability-weighting",
    name: "Inverse probability weighting (IPTW)",
    domain: "causal inference",
    description: "Weighting each unit by the inverse probability of the treatment it received to build a balanced pseudo-population.",
    related: ["propensity-score-matching", "g-computation", "standardized-mean-difference"],
  },
  {
    slug: "standardized-mean-difference",
    name: "Covariate balance (standardized mean differences)",
    domain: "causal inference",
    description: "A sample-size-free measure of how different treated and control groups are on each covariate.",
    related: ["propensity-score-matching", "inverse-probability-weighting"],
  },
  {
    slug: "g-computation",
    name: "G-computation (marginal standardization)",
    domain: "causal inference",
    description: "Predicting every unit's outcome under each exposure level and averaging, to get marginal risk ratios or differences.",
    related: ["odds-ratio-vs-risk-ratio", "inverse-probability-weighting", "bootstrap"],
  },
  {
    slug: "sensitivity-analysis",
    name: "Sensitivity analysis for unmeasured confounding",
    domain: "causal inference",
    description: "Quantifying how strong an unmeasured confounder would need to be to explain away an estimate (e.g. E-values).",
    related: ["confounding", "propensity-score-matching"],
  },
  // ── Survival analysis ─────────────────────────────────────────────────────
  {
    slug: "survival-analysis",
    name: "Survival analysis and censoring",
    domain: "survival analysis",
    description: "Time-to-event methods (Kaplan–Meier, log-rank) that use partial follow-up from censored subjects.",
    related: ["cox-proportional-hazards", "competing-risks"],
  },
  {
    slug: "cox-proportional-hazards",
    name: "Cox proportional hazards model",
    domain: "survival analysis",
    description: "Semi-parametric regression for hazard ratios that leaves the baseline hazard unspecified.",
    related: ["proportional-hazards-assumption", "competing-risks", "survival-analysis"],
  },
  {
    slug: "proportional-hazards-assumption",
    name: "Checking proportional hazards",
    domain: "survival analysis",
    description: "Testing whether hazard ratios are constant over time using Schoenfeld residuals and time interactions.",
    related: ["cox-proportional-hazards"],
  },
  {
    slug: "competing-risks",
    name: "Competing risks",
    domain: "survival analysis",
    description: "Events such as death that prevent the outcome of interest; handled with cumulative incidence and cause-specific or Fine–Gray models.",
    related: ["cox-proportional-hazards", "survival-analysis"],
  },
  // ── Missing data ──────────────────────────────────────────────────────────
  {
    slug: "missing-data-mechanisms",
    name: "Missing data mechanisms (MCAR, MAR, MNAR)",
    domain: "missing data",
    description: "Why data are missing determines whether complete-case analysis or imputation gives unbiased answers.",
    related: ["multiple-imputation", "sensitivity-analysis"],
  },
  {
    slug: "multiple-imputation",
    name: "Multiple imputation",
    domain: "missing data",
    description: "Filling in missing values several times from a predictive model and pooling results with Rubin's rules.",
    related: ["missing-data-mechanisms", "propensity-score-matching"],
  },
  // ── Inference ─────────────────────────────────────────────────────────────
  {
    slug: "p-values",
    name: "P-values",
    domain: "inference",
    description: "The probability of data at least this extreme if the null hypothesis were true — not the probability the null is true.",
    related: ["confidence-intervals", "multiple-comparisons", "statistical-power"],
  },
  {
    slug: "confidence-intervals",
    name: "Confidence intervals",
    domain: "inference",
    description: "A range produced by a procedure that captures the true parameter in a stated share of repeated samples.",
    related: ["bootstrap", "p-values"],
  },
  {
    slug: "welch-t-test",
    name: "Welch's t-test",
    domain: "hypothesis testing",
    description: "Compares two means without assuming equal variances; a sensible default over Student's t-test.",
    related: ["mann-whitney-u-test", "statistical-power"],
  },
  {
    slug: "mann-whitney-u-test",
    name: "Mann–Whitney U (Wilcoxon rank-sum) test",
    domain: "hypothesis testing",
    description: "A rank-based comparison of two groups; tests stochastic dominance, not a difference in medians.",
    related: ["welch-t-test", "bootstrap"],
  },
  {
    slug: "multiple-comparisons",
    name: "Multiple comparisons",
    domain: "hypothesis testing",
    description: "Running many tests inflates false positives; corrections like Holm or Benjamini–Hochberg control it.",
    related: ["p-values"],
  },
  {
    slug: "bootstrap",
    name: "The bootstrap",
    domain: "inference",
    description: "Resampling the data with replacement to approximate the sampling distribution of almost any statistic.",
    related: ["confidence-intervals", "g-computation"],
  },
  {
    slug: "statistical-power",
    name: "Statistical power and sample size",
    domain: "inference",
    description: "The probability a study detects an effect of a given size; drives how many subjects you need.",
    related: ["intraclass-correlation", "p-values"],
  },
  {
    slug: "likelihood-ratio-test",
    name: "Likelihood ratio test",
    domain: "inference",
    description: "Compares nested models by twice the difference in log-likelihoods, referred to a chi-squared distribution.",
    related: ["negative-binomial-regression", "p-values"],
  },
  // ── Machine learning & evaluation ─────────────────────────────────────────
  {
    slug: "cross-validation",
    name: "Cross-validation and train/test splits",
    domain: "machine learning",
    description: "Estimating out-of-sample performance by holding data out — split by time or group when rows aren't independent.",
    related: ["data-leakage", "bias-variance-tradeoff", "regularization"],
  },
  {
    slug: "data-leakage",
    name: "Data leakage",
    domain: "machine learning",
    description: "Information from the future or the label sneaking into features, producing validation scores that won't hold up.",
    related: ["cross-validation", "feature-engineering"],
  },
  {
    slug: "class-imbalance",
    name: "Class imbalance",
    domain: "machine learning",
    description: "When one class is rare, accuracy misleads; evaluation and thresholds matter more than resampling tricks.",
    related: ["precision-recall", "decision-thresholds", "probability-calibration"],
  },
  {
    slug: "precision-recall",
    name: "Precision, recall and PR curves",
    domain: "model evaluation",
    description: "How many flagged cases are real (precision) vs. how many real cases get flagged (recall).",
    related: ["decision-thresholds", "roc-auc", "class-imbalance"],
  },
  {
    slug: "roc-auc",
    name: "ROC curves and AUC (c-statistic)",
    domain: "model evaluation",
    description: "Discrimination: the probability the model ranks a random positive above a random negative.",
    related: ["precision-recall", "probability-calibration"],
  },
  {
    slug: "probability-calibration",
    name: "Probability calibration",
    domain: "model evaluation",
    description: "Whether predicted probabilities match observed frequencies — essential when decisions use the probability itself.",
    related: ["decision-thresholds", "roc-auc"],
  },
  {
    slug: "decision-thresholds",
    name: "Choosing decision thresholds",
    domain: "model evaluation",
    description: "Turning probabilities into actions using the costs of false positives and false negatives.",
    related: ["probability-calibration", "precision-recall"],
  },
  {
    slug: "bias-variance-tradeoff",
    name: "Bias–variance tradeoff",
    domain: "machine learning",
    description: "Flexible models fit training data better but vary more between samples; test error balances the two.",
    related: ["regularization", "cross-validation"],
  },
  {
    slug: "gradient-boosting",
    name: "Gradient boosting",
    domain: "machine learning",
    description: "Building an ensemble of shallow trees sequentially, each correcting the previous ones' errors.",
    related: ["model-interpretability", "cross-validation", "probability-calibration"],
  },
  {
    slug: "model-interpretability",
    name: "Model interpretability (SHAP, partial dependence)",
    domain: "machine learning",
    description: "Explaining which features drive predictions — and why that is not the same as a causal effect.",
    related: ["confounding", "gradient-boosting"],
  },
  {
    slug: "feature-engineering",
    name: "Feature engineering for tabular data",
    domain: "machine learning",
    description: "Building informative, point-in-time-correct features such as recency, frequency and trends.",
    related: ["data-leakage", "gradient-boosting"],
  },
  // ── Marketing ─────────────────────────────────────────────────────────────
  {
    slug: "ab-testing-basics",
    name: "A/B testing basics",
    domain: "marketing",
    description: "Randomly splitting an audience between two versions and checking whether the gap is bigger than chance alone would produce.",
    related: ["ad-creative-testing", "landing-page-optimization", "statistical-power", "p-values", "confidence-intervals"],
  },
  {
    slug: "open-rate-caveats",
    name: "Open rates after Apple Mail Privacy Protection",
    domain: "marketing",
    description: "Why email opens are inflated by machine opens since 2021, and why clicks and orders are the safer success metrics.",
    related: ["funnel-metrics", "email-deliverability", "ab-testing-basics"],
  },
  {
    slug: "email-deliverability",
    name: "Email deliverability and sender reputation",
    domain: "marketing",
    description: "Whether your mail reaches the inbox: authentication, spam complaints and engagement decide how mailbox providers treat you.",
    related: ["customer-segmentation", "open-rate-caveats", "email-flows"],
  },
  {
    slug: "email-flows",
    name: "Email flows vs. campaigns",
    domain: "marketing",
    description: "Automated, behavior-triggered emails (welcome, abandoned cart, post-purchase) versus one-off sends to a list.",
    related: ["customer-segmentation", "win-back-campaigns", "funnel-metrics", "customer-lifetime-value"],
  },
  {
    slug: "funnel-metrics",
    name: "Funnel metrics (CTR, conversion rate, revenue per recipient)",
    domain: "marketing",
    description: "The chain from delivered to clicked to ordered to revenue, and which link to report when you want to show impact.",
    related: ["average-order-value", "landing-page-optimization", "open-rate-caveats", "marketing-attribution-models"],
  },
  {
    slug: "average-order-value",
    name: "Average order value (AOV)",
    domain: "marketing",
    description: "Revenue divided by number of orders; one of the three levers (with traffic and conversion rate) behind revenue.",
    related: ["contribution-margin", "customer-lifetime-value", "funnel-metrics"],
  },
  {
    slug: "customer-segmentation",
    name: "Customer segmentation",
    domain: "marketing",
    description: "Grouping customers or subscribers by behavior or needs so each group gets messages and offers that fit.",
    related: ["rfm-segmentation", "email-deliverability", "positioning"],
  },
  {
    slug: "rfm-segmentation",
    name: "RFM segmentation (recency, frequency, monetary)",
    domain: "marketing",
    description: "Scoring customers on how recently, how often and how much they buy to find your best, at-risk and lapsed customers.",
    related: ["win-back-campaigns", "customer-lifetime-value", "cohort-retention", "customer-segmentation"],
  },
  {
    slug: "cohort-retention",
    name: "Cohort retention analysis",
    domain: "marketing",
    description: "Comparing groups of customers acquired at the same time at the same age, so newer customers aren't judged on less follow-up.",
    related: ["customer-lifetime-value", "win-back-campaigns", "rfm-segmentation", "survival-analysis"],
  },
  {
    slug: "customer-acquisition-cost",
    name: "Customer acquisition cost (CAC)",
    domain: "marketing",
    description: "What you spend in marketing to win one new customer — only meaningful next to what that customer is worth.",
    related: ["customer-lifetime-value", "contribution-margin", "roas", "incrementality-testing"],
  },
  {
    slug: "customer-lifetime-value",
    name: "Customer lifetime value (LTV)",
    domain: "marketing",
    description: "The gross profit a customer brings over their relationship with you, which sets how much you can afford to acquire them.",
    related: ["cohort-retention", "customer-acquisition-cost", "contribution-margin", "average-order-value"],
  },
  {
    slug: "roas",
    name: "Return on ad spend (ROAS)",
    domain: "marketing",
    description: "Attributed revenue per dollar of ad spend — easy to read, but blind to margin, repeat customers and sales that would have happened anyway.",
    related: ["contribution-margin", "customer-acquisition-cost", "marketing-attribution-models", "incrementality-testing"],
  },
  {
    slug: "marketing-attribution-models",
    name: "Marketing attribution models",
    domain: "marketing",
    description: "Rules (last-click, data-driven, platform view-through) for crediting a sale to touchpoints — and why every platform's numbers disagree.",
    related: ["incrementality-testing", "branded-search", "marketing-mix-modeling", "roas", "confounding"],
  },
  {
    slug: "incrementality-testing",
    name: "Incrementality testing (holdouts and lift tests)",
    domain: "marketing",
    description: "Withholding ads from a random group or region to measure the sales a channel actually causes, not just the sales it touched.",
    related: ["marketing-mix-modeling", "branded-search", "ab-testing-basics", "statistical-power", "confounding"],
  },
  {
    slug: "marketing-mix-modeling",
    name: "Marketing mix modeling (MMM)",
    domain: "marketing",
    description: "Estimating each channel's contribution from how sales move with weekly spend over time — no user-level tracking needed.",
    related: ["incrementality-testing", "marketing-attribution-models"],
  },
  {
    slug: "branded-search",
    name: "Branded vs. non-branded search",
    domain: "marketing",
    description: "Search ads on your own brand name mostly catch people already looking for you, so their ROAS overstates what they add.",
    related: ["incrementality-testing", "roas", "marketing-attribution-models"],
  },
  {
    slug: "contribution-margin",
    name: "Contribution margin",
    domain: "marketing",
    description: "What an order leaves after product cost, shipping, discounts and ad spend — the profit number ROAS and revenue hide.",
    related: ["roas", "customer-acquisition-cost", "average-order-value"],
  },
  {
    slug: "win-back-campaigns",
    name: "Win-back and replenishment timing",
    domain: "marketing",
    description: "Timing reminders and win-back offers to each customer's usual gap between orders, so you reach lapsing buyers before they're gone.",
    related: ["rfm-segmentation", "email-flows", "cohort-retention"],
  },
  {
    slug: "ad-creative-testing",
    name: "Ad creative testing",
    domain: "marketing",
    description: "Comparing hooks, formats and angles on paid social when the platform steers delivery toward early leaders instead of splitting evenly.",
    related: ["ab-testing-basics", "copywriting-frameworks", "statistical-power"],
  },
  {
    slug: "landing-page-optimization",
    name: "Landing page conversion",
    domain: "marketing",
    description: "Matching the page to the ad or email that sent the visitor — message, offer and friction decide how many of them buy.",
    related: ["copywriting-frameworks", "funnel-metrics", "ab-testing-basics"],
  },
  {
    slug: "positioning",
    name: "Positioning",
    domain: "marketing",
    description: "Deciding who a product is for, what it replaces and why it's the better choice — the foundation copy is written on.",
    related: ["copywriting-frameworks", "customer-segmentation"],
  },
  {
    slug: "copywriting-frameworks",
    name: "Copywriting frameworks (AIDA, PAS)",
    domain: "marketing",
    description: "Reusable structures for persuasive copy, such as Attention–Interest–Desire–Action and Problem–Agitate–Solution.",
    related: ["positioning", "ad-creative-testing", "landing-page-optimization", "ab-testing-basics"],
  },
  {
    slug: "seo-basics",
    name: "SEO fundamentals",
    domain: "marketing",
    description: "How search engines match pages to queries: search intent, on-page content, technical health and links.",
    related: ["positioning", "marketing-attribution-models"],
  },
];

export const CONCEPTS_BY_SLUG: ReadonlyMap<string, CatalogConcept> = new Map(
  CONCEPT_CATALOG.map((c) => [c.slug, c]),
);

/**
 * Compact catalog listing for prompts (router/assessor context), one concept
 * per line: "slug — Name (domain)". Reusing these slugs keeps profiles tidy.
 */
export function conceptCatalogForPrompt(): string {
  return CONCEPT_CATALOG.map((c) => `${c.slug} — ${c.name} (${c.domain})`).join("\n");
}
