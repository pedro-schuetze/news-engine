import type { PipelineRun } from "@/lib/types";
import { fmtLocal } from "@/lib/format";

function Section({
  title,
  children,
  open,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3" open={open}>
      <summary>{title}</summary>
      <div className="mt-3 overflow-x-auto">{children}</div>
    </details>
  );
}

export default function DebugPanel({ run }: { run: PipelineRun }) {
  const dbg = run.debug;
  const s = run.stats;
  if (!dbg) {
    return <p className="text-sm text-zinc-500">Este run foi salvo sem debug report.</p>;
  }
  const clusterTitle = Object.fromEntries(dbg.clusters.map((c) => [c.cluster_id, c.canonical_title]));

  return (
    <div className="space-y-3">
      {s.errors.length > 0 && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">
          <div className="font-semibold">Erros/avisos do run ({s.errors.length})</div>
          <ul className="mt-1 list-disc pl-5">
            {s.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-300">
        <span className="font-semibold text-zinc-100">Funil: </span>
        coletados <b>{s.articles_collected}</b> → pós-dedupe <b>{s.articles_after_dedupe}</b> → clusters{" "}
        <b>{s.story_clusters}</b> → classificados <b>{s.clusters_classified}</b> (descartados{" "}
        <b>{s.clusters_discarded}</b>) → selecionadas <b>{s.stories_selected}</b>
        <div className="mt-1 text-xs text-zinc-500">
          por collector:{" "}
          {Object.entries(s.articles_by_collector)
            .map(([k, v]) => `${k}=${v}`)
            .join(" · ")}
        </div>
      </div>

      <Section title={`Artigos coletados (${dbg.articles.length})`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Título</th>
              <th>Fonte</th>
              <th>Collector</th>
              <th>Query</th>
              <th>Idioma</th>
              <th>Autoridade</th>
              <th>Publicado</th>
            </tr>
          </thead>
          <tbody>
            {dbg.articles.map((a) => (
              <tr key={a.article_id}>
                <td className="max-w-md">
                  <a className="text-sky-400 hover:underline" href={a.url} target="_blank" rel="noreferrer">
                    {a.title}
                  </a>
                </td>
                <td>{a.source_name || a.source_domain}</td>
                <td>{a.collector}</td>
                <td>{a.original_query}</td>
                <td>{a.language}</td>
                <td>{a.authority_score}</td>
                <td className="whitespace-nowrap">{fmtLocal(a.published_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Removidos na deduplicação (${dbg.dedup_removals.length})`}>
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
                <td>{r.reason}</td>
                <td>{r.similarity ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Story clusters (${dbg.clusters.length}) — por trend score`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Título canônico</th>
              <th>Matérias</th>
              <th>Domínios</th>
              <th>Trend</th>
              <th>Sinais</th>
              <th>Foi p/ LLM?</th>
            </tr>
          </thead>
          <tbody>
            {dbg.clusters.map((c) => (
              <tr key={c.cluster_id}>
                <td className="max-w-md">{c.canonical_title}</td>
                <td>{c.size}</td>
                <td className="max-w-xs">{c.domains.join(", ")}</td>
                <td className="font-semibold">{c.trend_score.toFixed(1)}</td>
                <td className="whitespace-nowrap text-[11px] text-zinc-500">
                  {Object.entries(c.trend_signals)
                    .map(([k, v]) => `${k}=${v.toFixed(2)}`)
                    .join(" ")}
                </td>
                <td>{c.sent_to_classification ? "sim" : "não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Classificações do router (${dbg.classifications.length})`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Título</th>
              <th>Vertical</th>
              <th>Confiança</th>
              <th>Tipo</th>
              <th>Por</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {dbg.classifications.map((a) => (
              <tr key={a.cluster_id}>
                <td className="max-w-md">{clusterTitle[a.cluster_id] ?? a.cluster_id.slice(0, 8)}</td>
                <td className={a.primary_vertical === "discard" ? "text-red-400" : "text-emerald-400"}>
                  {a.primary_vertical}
                </td>
                <td>{a.classification_confidence.toFixed(2)}</td>
                <td>{a.content_type ?? ""}</td>
                <td>{a.assigned_by}</td>
                <td className="max-w-lg">{a.classification_reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Candidatas por vertical — decisão final (${dbg.candidates.length})`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Vertical</th>
              <th>Título</th>
              <th>Trend</th>
              <th>Editorial</th>
              <th>Final</th>
              <th>Verificação</th>
              <th>Selecionada</th>
              <th>Decisão</th>
            </tr>
          </thead>
          <tbody>
            {dbg.candidates.map((c, i) => (
              <tr key={`${c.cluster_id}-${i}`}>
                <td>{c.vertical}</td>
                <td className="max-w-md">{c.canonical_title}</td>
                <td>{c.trend_score.toFixed(1)}</td>
                <td>{c.editorial_score ?? "—"}</td>
                <td className="font-semibold">{c.final_score?.toFixed(1) ?? "—"}</td>
                <td>{c.verification_status ?? "—"}</td>
                <td>{c.selected ? "✔" : ""}</td>
                <td className="max-w-lg">{c.decision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Chamadas LLM (${dbg.llm_log.length})`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Propósito</th>
              <th>Provider</th>
              <th>Modelo</th>
              <th>Tokens in</th>
              <th>Tokens out</th>
              <th>Duração (s)</th>
              <th>Tentativa</th>
              <th>OK</th>
            </tr>
          </thead>
          <tbody>
            {dbg.llm_log.map((c, i) => (
              <tr key={i}>
                <td>{c.purpose}</td>
                <td>{c.provider}</td>
                <td>{c.model}</td>
                <td>{c.input_tokens}</td>
                <td>{c.output_tokens}</td>
                <td>{c.duration_seconds}</td>
                <td>{c.attempts}</td>
                <td>{c.ok ? "✔" : "✘"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {dbg.notes.length > 0 && (
        <Section title="Log de seleção">
          <pre className="whitespace-pre-wrap rounded-md bg-zinc-900 p-3 text-xs text-zinc-400">
            {dbg.notes.join("\n")}
          </pre>
        </Section>
      )}
    </div>
  );
}
