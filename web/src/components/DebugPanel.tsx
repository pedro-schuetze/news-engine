import type { PipelineRun } from "@/lib/types";
import { fmtLocal } from "@/lib/format";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="xp rounded-xl border border-line bg-panel px-4 py-3">
      <summary>{title}</summary>
      <div className="mt-3 overflow-x-auto">{children}</div>
    </details>
  );
}

export default function DebugPanel({ run }: { run: PipelineRun }) {
  const dbg = run.debug;
  const s = run.stats;
  if (!dbg) {
    return <p className="text-[13px] text-ink-3">Este run foi salvo sem debug report.</p>;
  }
  const clusterTitle = Object.fromEntries(dbg.clusters.map((c) => [c.cluster_id, c.canonical_title]));

  return (
    <div className="space-y-2.5">
      {s.errors.length > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger">
          <div className="font-semibold">Erros/avisos do run ({s.errors.length})</div>
          <ul className="mt-1 list-disc pl-5">
            {s.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-line bg-panel p-4 text-[13px] text-ink-2">
        <span className="microlabel mr-2">funil</span>
        coletados <b className="text-ink">{s.articles_collected}</b> → pós-dedupe{" "}
        <b className="text-ink">{s.articles_after_dedupe}</b> → clusters{" "}
        <b className="text-ink">{s.story_clusters}</b> → classificados{" "}
        <b className="text-ink">{s.clusters_classified}</b> (descartados{" "}
        <b className="text-ink">{s.clusters_discarded}</b>) → selecionadas{" "}
        <b className="text-ink">{s.stories_selected}</b>
        <div className="mt-1 font-mono text-[11px] text-ink-3">
          {Object.entries(s.articles_by_collector)
            .map(([k, v]) => `${k}=${v}`)
            .join(" · ")}
        </div>
      </div>

      <Section title={`artigos coletados (${dbg.articles.length})`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Título</th>
              <th>Fonte</th>
              <th>Collector</th>
              <th>Query</th>
              <th>Idioma</th>
              <th>Aut.</th>
              <th>Publicado</th>
            </tr>
          </thead>
          <tbody>
            {dbg.articles.map((a) => (
              <tr key={a.article_id}>
                <td className="max-w-md">
                  <a className="text-pol hover:underline" href={a.url} target="_blank" rel="noreferrer">
                    {a.title}
                  </a>
                </td>
                <td className="whitespace-nowrap">{a.source_name || a.source_domain}</td>
                <td>{a.collector}</td>
                <td className="max-w-40 truncate">{a.original_query}</td>
                <td>{a.language}</td>
                <td className="font-mono">{a.authority_score}</td>
                <td className="whitespace-nowrap">{fmtLocal(a.published_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`removidos na deduplicação (${dbg.dedup_removals.length})`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Título</th>
              <th>Domínio</th>
              <th>Motivo</th>
              <th>Similaridade</th>
            </tr>
          </thead>
          <tbody>
            {dbg.dedup_removals.map((r) => (
              <tr key={r.article_id}>
                <td className="max-w-md">{r.title}</td>
                <td>{r.source_domain}</td>
                <td className="font-mono text-[11.5px]">{r.reason}</td>
                <td className="font-mono">{r.similarity ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`story clusters (${dbg.clusters.length}) — por trend score`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Título canônico</th>
              <th>Matérias</th>
              <th>Domínios</th>
              <th>Trend</th>
              <th>Sinais</th>
              <th>LLM?</th>
            </tr>
          </thead>
          <tbody>
            {dbg.clusters.map((c) => (
              <tr key={c.cluster_id}>
                <td className="max-w-md">{c.canonical_title}</td>
                <td className="font-mono">{c.size}</td>
                <td className="max-w-56 truncate">{c.domains.join(", ")}</td>
                <td className="font-mono font-semibold text-ink">{c.trend_score.toFixed(1)}</td>
                <td className="font-mono text-[10.5px] whitespace-nowrap text-ink-3">
                  {Object.entries(c.trend_signals)
                    .map(([k, v]) => `${k.slice(0, 4)}=${v.toFixed(2)}`)
                    .join(" ")}
                </td>
                <td>{c.sent_to_classification ? "sim" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`classificações do router (${dbg.classifications.length})`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Título</th>
              <th>Vertical</th>
              <th>Conf.</th>
              <th>Tipo</th>
              <th>Por</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {dbg.classifications.map((a) => (
              <tr key={a.cluster_id}>
                <td className="max-w-md">{clusterTitle[a.cluster_id] ?? a.cluster_id.slice(0, 8)}</td>
                <td
                  className={`font-mono text-[11.5px] ${
                    a.primary_vertical === "discard" ? "text-danger" : "text-brand-ink"
                  }`}
                >
                  {a.primary_vertical}
                </td>
                <td className="font-mono">{a.classification_confidence.toFixed(2)}</td>
                <td className="font-mono text-[11px]">{a.content_type ?? ""}</td>
                <td>{a.assigned_by}</td>
                <td className="max-w-lg">{a.classification_reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`candidatas por vertical — decisão final (${dbg.candidates.length})`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Vertical</th>
              <th>Título</th>
              <th>Trend</th>
              <th>Edit.</th>
              <th>Final</th>
              <th>Verificação</th>
              <th>Sel.</th>
              <th>Decisão</th>
            </tr>
          </thead>
          <tbody>
            {dbg.candidates.map((c, i) => (
              <tr key={`${c.cluster_id}-${i}`}>
                <td className="font-mono text-[11px]">{c.vertical}</td>
                <td className="max-w-md">{c.canonical_title}</td>
                <td className="font-mono">{c.trend_score.toFixed(1)}</td>
                <td className="font-mono">{c.editorial_score ?? "—"}</td>
                <td className="font-mono font-semibold text-ink">{c.final_score?.toFixed(1) ?? "—"}</td>
                <td className="font-mono text-[11px]">{c.verification_status ?? "—"}</td>
                <td>{c.selected ? "✓" : ""}</td>
                <td className="max-w-lg">{c.decision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`chamadas LLM (${dbg.llm_log.length})`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Propósito</th>
              <th>Provider</th>
              <th>Modelo</th>
              <th>In</th>
              <th>Out</th>
              <th>Duração</th>
              <th>Tent.</th>
              <th>OK</th>
            </tr>
          </thead>
          <tbody>
            {dbg.llm_log.map((c, i) => (
              <tr key={i}>
                <td className="font-mono text-[11.5px]">{c.purpose}</td>
                <td>{c.provider}</td>
                <td className="font-mono text-[11.5px]">{c.model}</td>
                <td className="font-mono">{c.input_tokens}</td>
                <td className="font-mono">{c.output_tokens}</td>
                <td className="font-mono">{c.duration_seconds}s</td>
                <td className="font-mono">{c.attempts}</td>
                <td>{c.ok ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {dbg.notes.length > 0 && (
        <Section title="log de seleção">
          <pre className="rounded-lg bg-panel-2 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-2">
            {dbg.notes.join("\n")}
          </pre>
        </Section>
      )}
    </div>
  );
}
