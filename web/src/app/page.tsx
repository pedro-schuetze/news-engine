import Link from "next/link";
import RunsTable from "@/components/RunsTable";
import StatBlock from "@/components/StatBlock";
import StoryRow from "@/components/StoryRow";
import {
  DATA_MODE,
  dataHint,
  listRunSummaries,
  loadAllStories,
  loadReviews,
  loadRun,
  loadVerticalNames,
} from "@/lib/data";
import { fmtCost, fmtInt, fmtLocal, fmtTime, pct } from "@/lib/format";
import { verticalStyle } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [run, reviews, names, summaries, allStories] = await Promise.all([
    loadRun("latest"),
    loadReviews(),
    loadVerticalNames(),
    listRunSummaries(30),
    loadAllStories(30),
  ]);

  if (!run) {
    const hint = dataHint();
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <p className="microlabel">news engine</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy">
          Nenhum run encontrado ainda
        </h1>
        {hint && (
          <p className="mt-4 rounded-xl border border-warn/30 bg-warn-soft p-3 text-left text-[13px] text-warn">
            {hint}
          </p>
        )}
        {DATA_MODE === "github" ? (
          <p className="mt-3 text-[14px] text-ink-2">
            Fonte de dados: repositório GitHub. Assim que o pipeline commitar um run
            (Actions diário ou push manual de <code className="font-mono">data/</code>), ele aparece aqui.
          </p>
        ) : (
          <>
            <p className="mt-3 text-[14px] text-ink-2">
              Rode o pipeline na raiz do repositório e recarregue esta página:
            </p>
            <pre className="mt-4 rounded-xl border border-line bg-panel p-4 text-left font-mono text-[12.5px] text-brand-ink">
              {"python -m src.pipeline --mock   # teste sem custo\npython -m src.pipeline          # coleta real"}
            </pre>
          </>
        )}
      </div>
    );
  }

  const latestStories = Object.values(run.verticals).flatMap((v) => v.stories);
  const approved = latestStories.filter(
    (s) => reviews[s.story_id]?.review_status === "APPROVED",
  ).length;
  const rejected = latestStories.filter(
    (s) => reviews[s.story_id]?.review_status === "REJECTED",
  ).length;
  const pending = latestStories.length - approved - rejected;

  const recentApproved = allStories
    .filter((e) => reviews[e.story.story_id]?.review_status === "APPROVED")
    .slice(0, 6);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="microlabel">visão geral</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-navy">Dashboard</h1>
        </div>
        <Link
          href="/hoje"
          className="rounded-full bg-brand px-5 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-brand-ink"
        >
          Revisar posts de hoje →
        </Link>
      </header>

      {/* métricas principais */}
      <section className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatBlock
          label="último run"
          value={fmtTime(run.started_at)}
          sub={
            <>
              {fmtLocal(run.started_at).split(" ")[0]} ·{" "}
              {run.mode === "mock" ? "mock (simulado)" : "live"} ·{" "}
              {Math.round(run.stats.duration_seconds)}s
            </>
          }
        />
        <StatBlock
          label="funil do run"
          value={`${fmtInt(run.stats.articles_collected)} → ${run.stats.stories_selected}`}
          sub={`${fmtInt(run.stats.articles_after_dedupe)} pós-dedupe · ${fmtInt(run.stats.story_clusters)} clusters`}
        />
        <StatBlock
          label="approval rate (run atual)"
          value={pct(approved, latestStories.length)}
          sub={`${approved} aprovadas · ${rejected} rejeitadas · ${pending} pendentes`}
          accent
        />
        <StatBlock
          label="custo do run"
          value={fmtCost(run.stats.estimated_llm_cost_usd)}
          sub={`${run.stats.llm_calls} chamadas · ${fmtInt(run.stats.estimated_input_tokens + run.stats.estimated_output_tokens)} tokens`}
        />
      </section>

      {/* verticais do último run */}
      <section className="mt-6">
        <p className="microlabel mb-2.5">verticais — run atual</p>
        <div className="grid gap-2.5 md:grid-cols-3">
          {Object.entries(run.verticals).map(([vid, vr]) => {
            const vstyle = verticalStyle(vid);
            const vApproved = vr.stories.filter(
              (s) => reviews[s.story_id]?.review_status === "APPROVED",
            ).length;
            const vRejected = vr.stories.filter(
              (s) => reviews[s.story_id]?.review_status === "REJECTED",
            ).length;
            const top = [...vr.stories].sort((a, b) => a.selection_rank - b.selection_rank)[0];
            return (
              <Link
                key={vid}
                href={`/hoje?tab=${vid}`}
                className="group rounded-xl border border-line bg-panel p-4 transition-colors hover:border-ink-3"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                    <span className={`h-2 w-2 rounded-full ${vstyle.dot}`} />
                    {names[vid] ?? vid}
                  </span>
                  <span className="font-mono text-[12px] text-ink-3">
                    {vr.stories.length} post{vr.stories.length === 1 ? "" : "s"}
                  </span>
                </div>
                {top?.draft && (
                  <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug text-ink-2">
                    #1 {top.draft.instagram_headline || top.title}
                  </p>
                )}
                {vr.insufficient_quality_candidates && (
                  <p className="mt-2 inline-block rounded-full bg-warn-soft px-2 py-0.5 font-mono text-[10.5px] text-warn">
                    candidatas insuficientes
                  </p>
                )}
                <p className="mt-2.5 font-mono text-[11px] text-ink-3">
                  <span className="text-brand-ink">{vApproved} aprov.</span> ·{" "}
                  <span className="text-danger">{vRejected} rej.</span> ·{" "}
                  {vr.stories.length - vApproved - vRejected} pend.
                  <span className="ml-2 opacity-0 transition-opacity group-hover:opacity-100">
                    revisar →
                  </span>
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* aprovadas recentes + runs */}
      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <p className="microlabel">posts aprovados recentes</p>
            <Link
              href="/historico?status=APPROVED"
              className="font-mono text-[11.5px] font-medium text-brand-ink hover:underline"
            >
              ver todos →
            </Link>
          </div>
          {recentApproved.length === 0 ? (
            <div className="rounded-xl border border-line bg-panel px-4 py-8 text-center text-[13px] text-ink-3">
              Nada aprovado ainda — revise os posts de hoje.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-panel">
              {recentApproved.map((e) => (
                <StoryRow
                  key={`${e.runFile}-${e.story.story_id}`}
                  entry={e}
                  review={reviews[e.story.story_id] ?? null}
                  verticalName={names[e.story.vertical]}
                />
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <p className="microlabel">runs recentes</p>
            <Link
              href="/historico"
              className="font-mono text-[11.5px] font-medium text-brand-ink hover:underline"
            >
              histórico completo →
            </Link>
          </div>
          <RunsTable runs={summaries} names={names} limit={6} />
        </div>
      </section>
    </div>
  );
}
