import Link from "next/link";
import type { PipelineRun, Review } from "@/lib/types";
import { fmtCost, fmtInt } from "@/lib/format";
import DebugPanel from "./DebugPanel";
import StoryCard from "./StoryCard";
import VerticalTabs, { type TabItem } from "./VerticalTabs";

/**
 * Visão de revisão de um run (usada em /hoje e /historico/[run]).
 * Navegação por searchParams (?tab=, ?debug=1) — 100% server-rendered.
 */
export default function RunView({
  run,
  reviews,
  names,
  basePath,
  tab,
  debug,
  minStories = 3,
  runFile = "latest",
}: {
  run: PipelineRun;
  reviews: Record<string, Review>;
  names: Record<string, string>;
  basePath: string;
  tab: string;
  debug: boolean;
  minStories?: number;
  runFile?: string;
}) {
  const verticalIds = Object.keys(run.verticals);
  const activeTab =
    tab === "debug" && debug ? "debug" : verticalIds.includes(tab) ? tab : verticalIds[0];

  const href = (t: string, dbg: boolean) => {
    const params = new URLSearchParams();
    if (t) params.set("tab", t);
    if (dbg) params.set("debug", "1");
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const tabs: TabItem[] = verticalIds.map((vid) => ({
    id: vid,
    label: names[vid] ?? vid,
    count: run.verticals[vid].stories.length,
    href: href(vid, debug),
    active: activeTab === vid,
  }));

  const s = run.stats;
  const active = activeTab !== "debug" ? run.verticals[activeTab] : null;

  return (
    <div>
      {/* linha de contexto do run */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-panel px-4 py-3">
        <span className="font-mono text-[11.5px] text-ink-2">
          funil {fmtInt(s.articles_collected)} → {fmtInt(s.articles_after_dedupe)} →{" "}
          {fmtInt(s.story_clusters)} → <b className="text-ink">{s.stories_selected}</b>
        </span>
        <span className="font-mono text-[11.5px] text-ink-2">
          {s.llm_calls} chamadas · {fmtCost(s.estimated_llm_cost_usd)}
        </span>
        <span className="font-mono text-[11.5px] text-ink-2">{Math.round(s.duration_seconds)}s</span>
        {s.errors.length > 0 && (
          <span className="font-mono text-[11.5px] text-warn">{s.errors.length} aviso(s)</span>
        )}
        <span className="ml-auto">
          <Link
            href={href(debug ? activeTab : "debug", !debug)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] font-medium transition-colors ${
              debug
                ? "border-fact bg-fact-soft text-fact"
                : "border-line text-ink-3 hover:border-ink-3 hover:text-ink-2"
            }`}
          >
            {debug ? "debug ligado" : "pipeline/debug"}
          </Link>
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <VerticalTabs items={tabs} />
        {debug && (
          <Link
            href={href("debug", true)}
            className={`rounded-full px-3.5 py-1.5 font-mono text-[12px] font-medium ${
              activeTab === "debug"
                ? "bg-fact text-white"
                : "bg-fact-soft text-fact hover:opacity-80"
            }`}
          >
            debug
          </Link>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {activeTab === "debug" ? (
          <DebugPanel run={run} />
        ) : active ? (
          <>
            {active.insufficient_quality_candidates && (
              <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn">
                Candidatas de qualidade insuficientes: {active.stories.length} acima do threshold
                (mínimo desejado: {minStories}). Melhor menos e boas do que quota com ruins.
              </div>
            )}
            {active.stories.length === 0 && (
              <p className="py-8 text-center text-[13px] text-ink-3">
                Nenhuma story selecionada nesta vertical neste run.
              </p>
            )}
            {[...active.stories]
              .sort((a, b) => a.selection_rank - b.selection_rank)
              .map((story) => (
                <StoryCard
                  key={story.story_id}
                  story={story}
                  review={reviews[story.story_id] ?? null}
                  verticalName={names[story.vertical] ?? story.vertical}
                  runFile={runFile}
                />
              ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
