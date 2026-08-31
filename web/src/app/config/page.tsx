import {
  DATA_MODE,
  loadEnvView,
  loadRankingConfig,
  loadSourceConfigs,
  loadVerticalConfigs,
} from "@/lib/data";
import { verticalStyle } from "@/lib/ui";

export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <p className="microlabel">{title}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-1.5 last:border-b-0">
      <span className="font-mono text-[11.5px] text-ink-3">{k}</span>
      <span className="text-right font-mono text-[12.5px] font-medium text-ink">{v}</span>
    </div>
  );
}

export default async function ConfigPage() {
  const [envView, verticals, sources, ranking] = await Promise.all([
    loadEnvView(),
    loadVerticalConfigs(),
    loadSourceConfigs(),
    loadRankingConfig(),
  ]);

  const rk = (ranking ?? {}) as {
    trend?: { weights?: Record<string, number>; recency_half_life_hours?: number };
    final_blend_default?: { trend?: number; editorial?: number };
    final_blend_per_vertical?: Record<string, { trend?: number; editorial?: number }>;
    min_final_score_default?: number;
    min_final_score_per_vertical?: Record<string, number>;
    llm_budget?: Record<string, number>;
  };

  return (
    <div>
      <header>
        <p className="microlabel">como o engine está configurado</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-navy">Configurações</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] text-ink-2">
          Visão de leitura. Para alterar, edite <code className="font-mono text-brand-ink">config/*.yaml</code>{" "}
          (comportamento editorial) ou <code className="font-mono text-brand-ink">.env</code> (execução) na
          raiz do repositório — o próximo run já usa os novos valores.
        </p>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="execução (.env)">
          <KV k="LLM_PROVIDER" v={envView.LLM_PROVIDER ?? "anthropic (default)"} />
          <KV
            k="modelo"
            v={
              (envView.LLM_PROVIDER ?? "anthropic") === "openai"
                ? (envView.OPENAI_MODEL ?? "gpt-5-mini")
                : (envView.ANTHROPIC_MODEL ?? "claude-haiku-4-5")
            }
          />
          <KV k="fallback" v={envView.LLM_FALLBACK_PROVIDER || "—"} />
          <KV k="janela de coleta" v={`${envView.NEWS_LOOKBACK_HOURS ?? "18"}h`} />
          <KV
            k="stories por vertical"
            v={`${envView.MIN_STORIES_PER_VERTICAL ?? "3"}–${envView.MAX_STORIES_PER_VERTICAL ?? "5"}`}
          />
          <KV k="timezone" v={envView.TIMEZONE ?? "America/Sao_Paulo"} />
          <KV k="modo" v={envView.PIPELINE_MODE ?? "live"} />
          <KV
            k="fonte de dados do dashboard"
            v={DATA_MODE === "github" ? "GitHub API (produção)" : "filesystem local"}
          />
          <p className="mt-3 text-[11.5px] text-ink-3">
            Chaves de API nunca são exibidas aqui. No CI, os valores vêm dos GitHub Secrets.
          </p>
        </Card>

        <Card title="ranking (config/ranking.yaml)">
          {rk.trend?.weights && (
            <>
              <p className="mb-1 font-mono text-[11px] text-ink-3">pesos do trend score</p>
              {Object.entries(rk.trend.weights).map(([k, v]) => (
                <KV key={k} k={k} v={`${Math.round(v * 100)}%`} />
              ))}
            </>
          )}
          <p className="mt-3 mb-1 font-mono text-[11px] text-ink-3">blend final (trend / editorial)</p>
          <KV
            k="default"
            v={`${rk.final_blend_default?.trend ?? 0.4} / ${rk.final_blend_default?.editorial ?? 0.6}`}
          />
          {Object.entries(rk.final_blend_per_vertical ?? {}).map(([vid, b]) => (
            <KV key={vid} k={vid} v={`${b.trend} / ${b.editorial}`} />
          ))}
          <p className="mt-3 mb-1 font-mono text-[11px] text-ink-3">threshold de seleção</p>
          <KV k="default" v={rk.min_final_score_default ?? 55} />
          {Object.entries(rk.min_final_score_per_vertical ?? {}).map(([vid, v]) => (
            <KV key={vid} k={vid} v={v} />
          ))}
          {rk.llm_budget && (
            <>
              <p className="mt-3 mb-1 font-mono text-[11px] text-ink-3">orçamento LLM</p>
              {Object.entries(rk.llm_budget).map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
            </>
          )}
        </Card>
      </div>

      <section className="mt-6">
        <p className="microlabel mb-2.5">verticais (config/verticals.yaml)</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {verticals.map((v) => {
            const vstyle = verticalStyle(v.id);
            return (
              <div key={v.id} className="rounded-xl border border-line bg-panel p-5">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${vstyle.dot}`} />
                  <h3 className="text-[15px] font-semibold text-ink">{v.display_name}</h3>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{v.description}</p>
                <p className="mt-2 text-[12px] text-ink-3">
                  <span className="microlabel mr-1.5">tom</span>
                  {v.tone}
                </p>
                <details className="xp mt-3">
                  <summary>
                    queries ({v.google_news_queries.length + v.gdelt_queries.length})
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {v.google_news_queries.map((qy, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-panel-2 px-2.5 py-1 font-mono text-[10.5px] text-ink-2"
                        title={`hl=${qy.hl} gl=${qy.gl}`}
                      >
                        {qy.query} <span className="text-ink-3">· {qy.hl.slice(0, 2)}</span>
                      </span>
                    ))}
                    {v.gdelt_queries.map((qy, i) => (
                      <span
                        key={`g${i}`}
                        className="rounded-full bg-fact-soft px-2.5 py-1 font-mono text-[10.5px] text-fact"
                      >
                        gdelt: {qy.query}
                      </span>
                    ))}
                  </div>
                </details>
                <details className="xp mt-1">
                  <summary>critérios editoriais ({v.editorial_criteria.length})</summary>
                  <ul className="mt-2 space-y-1 text-[12px] text-ink-2">
                    {v.editorial_criteria.map((c) => (
                      <li key={c.name}>
                        <span className="font-mono text-[11px] text-ink">{c.name}</span> —{" "}
                        {c.description}
                      </li>
                    ))}
                  </ul>
                </details>
                <details className="xp mt-1">
                  <summary>regras e diretrizes</summary>
                  <div className="mt-2 space-y-2 text-[12px] text-ink-2">
                    {(v.guidance.value?.length ?? 0) > 0 && (
                      <div>
                        <p className="font-mono text-[10.5px] text-brand-ink">valorizar</p>
                        <ul className="mt-0.5 list-disc pl-4">
                          {v.guidance.value!.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(v.guidance.avoid?.length ?? 0) > 0 && (
                      <div>
                        <p className="font-mono text-[10.5px] text-danger">evitar</p>
                        <ul className="mt-0.5 list-disc pl-4">
                          {v.guidance.avoid!.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {v.extra_rules.length > 0 && (
                      <div>
                        <p className="font-mono text-[10.5px] text-ink-3">regras específicas</p>
                        <ul className="mt-0.5 list-disc pl-4">
                          {v.extra_rules.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {v.official_domains.length > 0 && (
                      <p className="font-mono text-[10.5px] text-ink-3">
                        domínios oficiais: {v.official_domains.join(", ")}
                      </p>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <p className="microlabel mb-2.5">
          fontes RSS curadas (config/sources.yaml) — {sources.filter((s) => s.enabled).length} ativas de{" "}
          {sources.length}
        </p>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="tbl">
            <thead>
              <tr>
                <th>Fonte</th>
                <th>Domínio</th>
                <th>Categoria</th>
                <th>Idioma</th>
                <th>Autoridade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.url} className={s.enabled ? "" : "opacity-50"}>
                  <td className="font-medium text-ink">{s.source_name}</td>
                  <td className="font-mono text-[11.5px]">{s.domain}</td>
                  <td>{s.category}</td>
                  <td className="font-mono">{s.language}</td>
                  <td className="font-mono">{s.authority_score}</td>
                  <td>
                    {s.enabled ? (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-[10.5px] text-brand-ink">
                        ativa
                      </span>
                    ) : (
                      <span className="rounded-full bg-panel-2 px-2 py-0.5 font-mono text-[10.5px] text-ink-3">
                        desativada
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
