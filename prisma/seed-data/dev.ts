// Dev — MS data science, customer-churn capstone (X4 "almost unlocked").
// Exactly 4 answered framing exchanges (Tier 1 needs 5, so the next answered
// exchange triggers the unlock live — X7) and only 3 concepts, so the extra
// concepts one more framing round adds stay well short of Tier 2's 8. Exchanges
// may name concepts that have no mastery row (precision-recall,
// cross-validation, probability-calibration); the Learn It Later queue does too.
// Lightly inferred learning style (low confidence). Works in Python.
import { md, type SeedPersona } from "./types";

export const dev: SeedPersona = {
  key: "dev",
  displayName: "Dev",
  createdDaysAgo: 6,

  context: {
    field: "MS Data Science (second year)",
    projects: ["Capstone: predicting monthly churn for a regional internet provider"],
    dataTypes: ["Monthly customer snapshots (~48k customers)", "Support ticket logs", "Billing and plan history"],
    notes: "Works in Python (pandas, scikit-learn, LightGBM).",
  },

  style: {
    intuitionVsFormal: -0.25,
    intuitionVsFormalConfidence: 0.3,
    entryPoint: "code",
    entryPointConfidence: 0.35,
    briefVsThorough: -0.3,
    briefVsThoroughConfidence: 0.25,
    evidence: [
      {
        dimension: "intuitionVsFormal",
        ref: "d1.x1",
        note: "The concrete \"predict no-churn for everyone\" question landed immediately; he didn't ask for metric definitions.",
      },
      {
        dimension: "entryPoint",
        ref: "d2.x2",
        note: "Asked how to \"actually do\" the time-based split — wanted the pandas code more than the rationale.",
      },
      {
        dimension: "briefVsThorough",
        ref: "d1.x2",
        note: "Short, direct questions; his follow-up picked up the numbers and code rather than the prose.",
      },
    ],
  },

  masteries: [
    {
      slug: "class-imbalance",
      evidence: [
        { ref: "d1.x1", delta: 0.3, note: "Realized after one question that 92% accuracy is exactly the predict-no-churn baseline." },
        { ref: "d1.x2", delta: 0.15, note: "Moved from resampling to costs and thresholds on his own once the retention team's constraints were known." },
      ],
    },
    {
      slug: "decision-thresholds",
      evidence: [
        { ref: "d1.x1", delta: 0.1, note: "Hadn't considered that the default 0.5 cutoff is a choice rather than part of the model." },
        { ref: "d1.x2", delta: 0.35, note: "Derived the expected value of a retention call himself (p × 0.25 × $240 − $6)." },
      ],
    },
    {
      slug: "data-leakage",
      evidence: [
        { ref: "d2.x1", delta: 0.1, note: "Marked cancellation_reason as available at scoring time — didn't spot target leakage." },
        { ref: "d2.x2", delta: 0.2, note: "Correctly limited features to data available through the day before scoring." },
      ],
    },
  ],

  learnLater: [
    {
      ref: "ll-calibration",
      conceptSlug: "probability-calibration",
      title: "Probability calibration",
      preview:
        "A model can rank customers well and still say 30% when the truth is 10%. Calibration curves check this; isotonic or Platt scaling fixes it.",
      appliedContext:
        "Customers your forest scored around 0.10 churned only about 4% of the time in validation, so the call-if-p > 0.10 rule needs calibrated scores.",
      origin: "flagged",
      status: "queued",
      source: { turnRef: "d1.x2", message: "answer" },
    },
    {
      ref: "ll-group-split",
      conceptSlug: "cross-validation",
      title: "Group k-fold for repeated customers",
      preview:
        "When the same customer appears in many monthly rows, random splits let the model memorize customers. GroupKFold keeps each customer on one side of the split.",
      appliedContext:
        "Your churn data has one row per customer-month and you used a random 80/20 split — part of why validation AUC hit 0.97.",
      origin: "flagged",
      status: "queued",
      source: { turnRef: "d2.x1", message: "answer" },
    },
  ],

  conversations: [
    {
      ref: "d1",
      title: "92% accuracy but the churn model catches nothing",
      daysAgo: 5,
      startHour: 22,
      turns: [
        {
          kind: "exchange",
          ref: "d1.x1",
          user: "My churn model (random forest) gets 92% accuracy but it basically never predicts churn. Only 8% of customers churn. Should I use SMOTE to fix the imbalance?",
          framingIntro: "Before reaching for SMOTE, two questions:",
          conceptSlugs: ["class-imbalance", "precision-recall", "decision-thresholds"],
          questions: [
            { id: "q1", format: "short_answer", prompt: "If a model predicted \"no churn\" for every customer, what accuracy would it get on your data?" },
            {
              id: "q2",
              format: "multiple_choice",
              prompt: "What will the retention team actually do with the model's output?",
              options: [
                "Call a fixed number of the highest-risk customers each month",
                "Send an offer to everyone above some risk cutoff",
                "Report an overall churn forecast to leadership",
              ],
            },
          ],
          responses: [
            { questionId: "q1", answer: "92%... oh. So my model is basically doing that.", dontKnow: false },
            { questionId: "q2", answer: null, dontKnow: true },
          ],
          status: "answered",
          skipCallout: {
            title: "Accuracy under class imbalance",
            preview: "With 8% churn, predicting no one churns scores 92% accuracy; use metrics that focus on the rare class.",
            appliedContext: "Your random forest scores 92% accuracy but rarely predicts churn.",
            conceptSlug: "class-imbalance",
          },
          thinkMinutes: 1.5,
          answer: md`
            Exactly — 92% is the score of a model that has learned nothing. The good news: your forest probably *has* learned something. The problem is how you're reading it.

            **The model isn't the problem; the 0.5 cutoff is.** \`predict()\` labels a customer as churn only when the predicted probability exceeds 0.5. With an 8% base rate almost nobody clears that bar. The probabilities underneath can still rank customers well.

            **Use metrics that focus on churners:**
            - **PR-AUC** (average precision). Its no-skill baseline is the churn rate, 0.08, not 0.5.
            - **Precision@k** — of the k customers you'd contact, how many actually churn?

            ~~~python
            from sklearn.ensemble import RandomForestClassifier
            from sklearn.metrics import average_precision_score

            rf = RandomForestClassifier(n_estimators=500, min_samples_leaf=20,
                                        random_state=42, n_jobs=-1)
            rf.fit(X_train, y_train)
            p = rf.predict_proba(X_test)[:, 1]

            print("PR-AUC:", average_precision_score(y_test, p), "baseline:", y_test.mean())

            top = p.argsort()[::-1][:500]          # 500 highest-risk customers
            print("precision@500:", y_test.to_numpy()[top].mean())
            ~~~

            **On SMOTE:** it adds no new information and distorts the predicted probabilities (the model now thinks churn is far more common than it is). Fix the threshold and metric first; resampling rarely beats that.

            **Your "I don't know" is the next thing to find out.** Whether the team calls a fixed number of people or contacts everyone above a cutoff decides which metric and threshold you should optimize. Worth an email to your capstone partner.
          `,
        },
        {
          kind: "exchange",
          ref: "d1.x2",
          user: "Asked the partner: they can call about 400 customers a month, a call costs ~$6, and a saved customer is worth ~$240 over a year. They think a call saves maybe 1 in 4 would-be churners. How do I pick the threshold?",
          framingIntro: "Those numbers are all you need. Two questions:",
          conceptSlugs: ["decision-thresholds", "probability-calibration", "precision-recall"],
          questions: [
            { id: "q1", format: "short_answer", prompt: "What's the expected value of calling a customer whose churn probability is p?" },
            {
              id: "q2",
              format: "short_answer",
              prompt: "In your validation set, what share of the customers the forest scored around 0.10 actually churned?",
            },
          ],
          responses: [
            { questionId: "q1", answer: "p × 0.25 × 240 − 6", dontKnow: false },
            { questionId: "q2", answer: "Just checked: 61 of the 1,480 customers scored 0.08–0.12 churned, so about 4%.", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Cost-based thresholds",
            preview: "Pick the cutoff where the expected benefit of acting equals its cost.",
            appliedContext: "The retention team can make 400 calls a month at $6 each.",
            conceptSlug: "decision-thresholds",
          },
          thinkMinutes: 2,
          answer: md`
            Your expected value is exactly right. Set it to zero to get the break-even probability:

            $$p^* \times 0.25 \times 240 = 6 \quad\Rightarrow\quad p^* = \frac{6}{60} = 0.10$$

            Calling is worth it for any customer with $p > 0.10$. Then apply the capacity limit:

            - **More than 400 customers above 0.10?** Call the top 400 by predicted risk. Here you're right that ranking is all that matters.
            - **Fewer than 400?** Stop at the threshold — and now the probability *itself* matters.

            Your second answer shows why that's a problem. Customers the forest scores around 0.10 actually churn about 4% of the time, so a call to one of them is worth

            $$0.04 \times 0.25 \times 240 - 6 = -3.60 \text{ dollars}$$

            Taken at face value, the 0.10 cutoff loses money on exactly the customers near it. That gap between what the model says and what actually happens is **calibration**. Random forests are often poorly calibrated — they squeeze probabilities toward the middle, so low risks come out too high. Ranking is enough for the top-400 rule; the cutoff needs calibrated probabilities. Check the whole curve and recalibrate:

            ~~~python
            from sklearn.calibration import CalibratedClassifierCV, calibration_curve

            frac_pos, mean_pred = calibration_curve(y_test, p, n_bins=10, strategy="quantile")

            cal_rf = CalibratedClassifierCV(rf, method="isotonic", cv=5).fit(X_train, y_train)
            p_cal = cal_rf.predict_proba(X_test)[:, 1]
            n_to_call = min(400, (p_cal > 0.10).sum())
            ~~~

            One more lever for the report: expected monthly value is $\sum_{i \in \text{called}} (0.25 \times 240 \times p_i - 6)$. That number means more to the partner than any AUC.
          `,
        },
      ],
    },
    {
      ref: "d2",
      title: "Validation AUC of 0.97 — too good to be true?",
      daysAgo: 2,
      startHour: 15,
      turns: [
        {
          kind: "exchange",
          ref: "d2.x1",
          user: "Switched to gradient boosting and validation AUC jumped to 0.97. My advisor said \"that's suspicious\". Is he just being negative?",
          framingIntro: "He's probably right, and it's quick to check. Two questions:",
          conceptSlugs: ["data-leakage", "cross-validation"],
          questions: [
            {
              id: "q1",
              format: "multi_select",
              prompt: "Which of these features would be available on the day you score a customer?",
              options: ["tenure_months", "support_tickets_last_30d", "contract_type", "cancellation_reason"],
            },
            { id: "q2", format: "short_answer", prompt: "How did you split training and validation data?" },
          ],
          responses: [
            {
              questionId: "q1",
              answer: ["tenure_months", "support_tickets_last_30d", "contract_type", "cancellation_reason"],
              dontKnow: false,
            },
            { questionId: "q2", answer: "Random 80/20 split of the rows. Each row is a customer-month snapshot.", dontKnow: false },
          ],
          status: "answered",
          skipCallout: {
            title: "Data leakage",
            preview: "Features or splits that let future information into training inflate validation scores.",
            appliedContext: "Your churn model's validation AUC jumped to 0.97.",
            conceptSlug: "data-leakage",
          },
          thinkMinutes: 2,
          answer: md`
            Your advisor is right, and your answers point to two separate leaks.

            **1. \`cancellation_reason\` is target leakage.** It only exists *after* a customer cancels, so "has a cancellation reason" is nearly the label itself. The model learns that and the AUC soars. It won't exist for anyone you actually need to score.

            **2. A random split of customer-month rows leaks too.** The same customer appears in both train and validation, often in adjacent months with nearly identical features, so the model partly memorizes customers. And training rows from *later* months help predict *earlier* ones — the reverse of deployment.

            Fix both:
            - Drop anything recorded at or after the outcome (cancellation reason, final bill, exit-survey fields).
            - Split **by time**: train on earlier months, validate on later ones. At minimum keep each customer on one side (\`GroupKFold\`).

            A quick screen for leaky features — anything that predicts churn almost perfectly on its own deserves suspicion:

            ~~~python
            from sklearn.metrics import roc_auc_score

            for col in X_val.select_dtypes("number"):
                auc = roc_auc_score(y_val, X_val[col].fillna(X_val[col].median()))
                if max(auc, 1 - auc) > 0.9:
                    print(f"check {col}: single-feature AUC = {max(auc, 1 - auc):.2f}")
            ~~~

            Expect the honest AUC to land well below 0.97, often in the 0.75–0.85 range for churn. That's the number worth reporting.
          `,
        },
        {
          kind: "exchange",
          ref: "d2.x2",
          user: "How do I actually do the time-based split with monthly snapshots? The label is \"churned in the next month\".",
          framingIntro: "One question to anchor it:",
          conceptSlugs: ["cross-validation", "data-leakage"],
          questions: [
            {
              id: "q1",
              format: "multiple_choice",
              prompt: "If the model scores customers on October 1, which data can the features use?",
              options: [
                "Only data that was recorded on or before September 30",
                "Everything in the warehouse on the day you train the model",
                "September data plus October churn labels for similar customers",
              ],
            },
          ],
          responses: [{ questionId: "q1", answer: "Only data that was recorded on or before September 30", dontKnow: false }],
          status: "answered",
          skipCallout: {
            title: "Time-based validation",
            preview: "Validate the way you'll deploy: train on the past, score the next month.",
            appliedContext: "Your churn data has monthly customer snapshots.",
            conceptSlug: "cross-validation",
          },
          thinkMinutes: 1,
          answer: md`
            Right — features must be **point-in-time**: only what was known the day you score.

            The label adds a wrinkle. On October 1 you score each customer's **September** snapshot (features through September 30) to predict October churn. That snapshot's label won't exist until October ends, so the newest *labelled* rows you can train on are August's (label: churned in September). Train strictly on months before the one you score — never on the scoring month or anything after it.

            Rolling-origin evaluation, one fold per month:

            ~~~python
            import pandas as pd
            from sklearn.metrics import average_precision_score

            snap = snapshots.sort_values("snapshot_month")        # snapshot_month: Period[M]
            cutoffs = pd.period_range("2025-10", "2026-03", freq="M")   # snapshot months to score

            scores = {}
            for cutoff in cutoffs:
                train = snap[snap.snapshot_month < cutoff]         # labels known by scoring day
                test = snap[snap.snapshot_month == cutoff]
                model.fit(train[features], train["churn_next_month"])
                p = model.predict_proba(test[features])[:, 1]
                scores[str(cutoff)] = average_precision_score(test["churn_next_month"], p)

            pd.Series(scores)
            ~~~

            Report the metric per month as well as the average — a drop in recent months is useful to know before the partner deploys anything.
          `,
        },
      ],
    },
  ],
};
