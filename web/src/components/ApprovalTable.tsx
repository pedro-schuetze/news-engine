import type { PipelineRun, Review } from "@/lib/types";

export default function ApprovalTable({
  run,
  reviews,
  names,
}: {
  run: PipelineRun;
  reviews: Record<string, Review>;
  names: Record<string, string>;
}) {
  const rows = Object.entries(run.verticals).map(([vid, vr]) => {
    const approved = vr.stories.filter((s) => reviews[s.story_id]?.review_status === "APPROVED").length;
    const rejected = vr.stories.filter((s) => reviews[s.story_id]?.review_status === "REJECTED").length;
    const total = vr.stories.length;
    return {
      name: names[vid] ?? vid,
      total,
      approved,
      rejected,
      pending: total - approved - rejected,
      rate: total ? Math.round((100 * approved) / total) : null,
    };
  });
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      approved: acc.approved + r.approved,
      rejected: acc.rejected + r.rejected,
    }),
    { total: 0, approved: 0, rejected: 0 },
  );
  const overallRate = totals.total ? Math.round((100 * totals.approved) / totals.total) : null;

  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <summary>
        Métrica de qualidade — approval rate:{" "}
        {overallRate !== null ? `${overallRate}% (${totals.approved}/${totals.total} aprovadas)` : "—"}
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Vertical</th>
              <th>Selecionadas</th>
              <th>Aprovadas</th>
              <th>Rejeitadas</th>
              <th>Pendentes</th>
              <th>Approval rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.total}</td>
                <td className="text-emerald-400">{r.approved}</td>
                <td className="text-red-400">{r.rejected}</td>
                <td>{r.pending}</td>
                <td>{r.rate !== null ? `${r.rate}%` : "—"}</td>
              </tr>
            ))}
            <tr className="font-semibold text-zinc-100">
              <td>TOTAL</td>
              <td>{totals.total}</td>
              <td className="text-emerald-400">{totals.approved}</td>
              <td className="text-red-400">{totals.rejected}</td>
              <td>{totals.total - totals.approved - totals.rejected}</td>
              <td>{overallRate !== null ? `${overallRate}%` : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}
