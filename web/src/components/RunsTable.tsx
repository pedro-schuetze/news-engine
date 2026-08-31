import Link from "next/link";
import type { RunSummary } from "@/lib/data";
import { fmtCost, fmtInt, fmtLocal } from "@/lib/format";

export default function RunsTable({
  runs,
  names,
  limit,
}: {
  runs: RunSummary[];
  names: Record<string, string>;
  limit?: number;
}) {
  const rows = limit ? runs.slice(0, limit) : runs;
  if (rows.length === 0) {
    return <p className="text-[13px] text-ink-3">Nenhum run registrado ainda.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="tbl">
        <thead>
          <tr>
            <th>Run</th>
            <th>Modo</th>
            <th>Coletados</th>
            <th>Selecionadas</th>
            {Object.entries(names).map(([vid, name]) => (
              <th key={vid}>{name.split(" ")[0]}</th>
            ))}
            <th>Custo</th>
            <th>Erros</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.file}>
              <td className="font-medium whitespace-nowrap text-ink">{fmtLocal(r.started_at)}</td>
              <td>
                {r.mode === "mock" ? (
                  <span className="rounded-full bg-warn-soft px-2 py-0.5 font-mono text-[10.5px] text-warn">
                    mock
                  </span>
                ) : (
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-[10.5px] text-brand-ink">
                    live
                  </span>
                )}
              </td>
              <td className="font-mono">{fmtInt(r.articles_collected)}</td>
              <td className="font-mono font-semibold text-ink">{r.stories_selected}</td>
              {Object.keys(names).map((vid) => (
                <td key={vid} className="font-mono">
                  {r.byVertical[vid] ?? 0}
                </td>
              ))}
              <td className="font-mono whitespace-nowrap">{fmtCost(r.estimated_llm_cost_usd)}</td>
              <td className={`font-mono ${r.errors > 0 ? "text-warn" : ""}`}>{r.errors}</td>
              <td>
                <Link
                  href={`/historico/${encodeURIComponent(r.file)}`}
                  className="font-mono text-[11.5px] font-medium text-brand-ink hover:underline"
                >
                  abrir →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
