"use client";

import { useCallback, useEffect, useState } from "react";

type EvaluationSummary = {
  run_count: number;
  average_seconds: number | null;
  guard_interventions: { action: string; count: number; per_run: number }[];
  model_identification: {
    runs_asserting_model: number;
    ocr_corroborated: number;
    unsupported_model_downgrades: number;
    runs_asserting_model_after_guards: number;
  };
  by_category: {
    category: string;
    runs: number;
    corrections_per_run: number;
    observed_claims_raw: number;
    observed_claims_after_guards: number;
  }[];
  seller_reviews: {
    totals: { accepted: number; rejected: number; supplied: number };
    by_attribute: {
      key: string;
      accepted: number;
      rejected: number;
      seller_supplied: number;
      rejection_rate: number | null;
    }[];
  };
};

type EvaluationRun = {
  run_id: string;
  timestamp: string | null;
  seconds: number | null;
  category: string;
  image_count: number;
  correction_count: number;
  model_asserted_after_guards: boolean;
};

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function EvaluationPanel() {
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadEvaluation = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryResponse, runsResponse] = await Promise.all([
        fetch("/api/evaluation/summary", { cache: "no-store" }),
        fetch("/api/evaluation/runs?limit=5", { cache: "no-store" }),
      ]);
      const [summaryData, runsData] = await Promise.all([
        summaryResponse.json(),
        runsResponse.json(),
      ]);
      if (!summaryResponse.ok || !runsResponse.ok) {
        throw new Error(summaryData.error ?? runsData.error ?? "Evaluation data could not be loaded.");
      }
      setSummary(summaryData as EvaluationSummary);
      setRuns((runsData as { runs: EvaluationRun[] }).runs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Evaluation data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadEvaluation(); }, [loadEvaluation]);

  const reviewed = (summary?.seller_reviews.totals.accepted ?? 0) + (summary?.seller_reviews.totals.rejected ?? 0);
  const rejectionRate = reviewed
    ? Math.round((summary?.seller_reviews.totals.rejected ?? 0) / reviewed * 100)
    : null;
  const correctionCount = summary?.guard_interventions.reduce((total, item) => total + item.count, 0) ?? 0;

  return (
    <section className="mb-8 rounded-3xl border border-hairline bg-canvas p-5 sm:p-7" aria-labelledby="evaluation-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Seller tools</p>
          <h2 id="evaluation-heading" className="mt-1 text-xl font-semibold">Listing assistant evaluation</h2>
          <p className="mt-1 text-sm text-body">Recent Vision Agent autofill runs, guard corrections, and seller feedback.</p>
        </div>
        <button
          className="rounded-full bg-surface-strong px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
          disabled={loading}
          onClick={() => void loadEvaluation()}
          type="button"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-semantic-down" role="alert">{error}</p>}
      {loading && !summary && !error && <p className="mt-5 text-sm text-body">Loading evaluation…</p>}

      {summary && !error && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Analyzed runs" value={summary.run_count.toLocaleString()} />
            <Metric label="Avg. claims time" value={summary.average_seconds === null ? "—" : `${summary.average_seconds}s`} />
            <Metric label="Guard corrections" value={correctionCount.toLocaleString()} />
            <Metric label="Seller rejection rate" value={rejectionRate === null ? "—" : `${rejectionRate}%`} />
          </div>

          {summary.run_count === 0 ? (
            <p className="mt-4 rounded-2xl bg-surface-soft p-4 text-sm text-body">No Vision Agent runs have been recorded yet.</p>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Latest runs</h3>
                <div className="mt-2 overflow-x-auto rounded-2xl border border-hairline">
                  <table className="w-full min-w-[460px] text-left text-xs">
                    <thead className="bg-surface-soft text-body">
                      <tr><th className="px-3 py-2 font-medium">Category</th><th className="px-3 py-2 font-medium">Photos</th><th className="px-3 py-2 font-medium">Corrections</th><th className="px-3 py-2 font-medium">Model retained</th></tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr className="border-t border-hairline" key={run.run_id}>
                          <td className="px-3 py-2 font-medium">{formatLabel(run.category)}</td>
                          <td className="px-3 py-2">{run.image_count}</td>
                          <td className="px-3 py-2">{run.correction_count}</td>
                          <td className="px-3 py-2">{run.model_asserted_after_guards ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Seller feedback by attribute</h3>
                {summary.seller_reviews.by_attribute.length === 0 ? (
                  <p className="mt-2 rounded-2xl bg-surface-soft p-4 text-xs text-body">No seller review decisions have been recorded yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-hairline rounded-2xl border border-hairline px-3">
                    {summary.seller_reviews.by_attribute.map((item) => (
                      <li className="flex items-center justify-between gap-3 py-2 text-xs" key={item.key}>
                        <span className="font-medium">{formatLabel(item.key)}</span>
                        <span className="text-body">{item.accepted} accepted · {item.rejected} rejected · {item.seller_supplied} corrected</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <p className="mt-4 text-[11px] leading-5 text-body">These are aggregate signals from guard interventions and seller feedback; they are not a ground-truth accuracy score.</p>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-soft p-4">
      <p className="text-xs text-body">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
