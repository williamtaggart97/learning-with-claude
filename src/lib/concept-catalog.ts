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
    description: "Count models with a separate process for excess zeros, e.g. patients who were never at risk.",
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
    description: "Models with random effects for groups such as hospitals, giving cluster-specific (conditional) estimates.",
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
