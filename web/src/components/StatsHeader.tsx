import type { PipelineRun } from "@/lib/types";
import { fmtCost, fmtInt, fmtLocal } from "@/lib/format";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

export default function StatsHeader({ run }: { run: PipelineRun }) {
  const s = run.stats;
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <Metric label="Último run" value={fmtLocal(run.started_at)} />
      <Metric label="Duração" value={`${Math.round(s.duration_seconds)}s`} />
      <Metric label="Coletados" value={fmtInt(s.articles_collected)} />
      <Metric label="Após dedupe" value={fmtInt(s.articles_after_dedupe)} />
      <Metric label="Clusters" value={fmtInt(s.story_clusters)} />
      <Metric label="Selecionadas" value={fmtInt(s.stories_selected)} />
      <Metric label="Chamadas LLM" value={fmtInt(s.llm_calls)} />
      <Metric label="Tokens in" value={fmtInt(s.estimated_input_tokens)} />
      <Metric label="Tokens out" value={fmtInt(s.estimated_output_tokens)} />
      <Metric label="Custo estimado" value={fmtCost(s.estimated_llm_cost_usd)} />
      <Metric label="Descartados (router)" value={fmtInt(s.clusters_discarded)} />
      <Metric label="Erros não-fatais" value={fmtInt(s.errors.length)} />
    </section>
  );
}
