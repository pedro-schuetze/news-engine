import Link from "next/link";
import ApprovalTable from "@/components/ApprovalTable";
import DebugPanel from "@/components/DebugPanel";
import RunSelector from "@/components/RunSelector";
import StatsHeader from "@/components/StatsHeader";
import StoryCard from "@/components/StoryCard";
import { listRunFiles, loadReviews, loadRun, loadVerticalNames } from "@/lib/data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const runFile = typeof sp.run === "string" ? sp.run : "latest";
  const debug = sp.debug === "1";

  const [runs, run, reviews, names] = await Promise.all([
    listRunFiles(),
    loadRun(runFile),
    loadReviews(),
    loadVerticalNames(),
  ]);

  if (!run) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-zinc-100">News Engine</h1>
        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-zinc-300">
          <p>Nenhum run encontrado em <code>data/</code>. Rode o pipeline primeiro, na raiz do repo:</p>
          <pre className="mt-4 rounded-md bg-zinc-900 p-4 text-sm text-emerald-300">
            {"python -m src.pipeline --mock   # teste sem custo\npython -m src.pipeline          # coleta real"}
          </pre>
          <p className="mt-4 text-sm text-zinc-500">
            Depois recarregue esta página. O dashboard lê <code>data/latest.json</code> e{" "}
            <code>data/runs/*.json</code>.
          </p>
        </div>
      </main>
    );
  }

  const verticalIds = Object.keys(run.verticals);
  const requestedTab = typeof sp.tab === "string" ? sp.tab : "";
  const tab =
    requestedTab === "debug" && debug
      ? "debug"
      : verticalIds.includes(requestedTab)
        ? requestedTab
        : verticalIds[0];

  const tabHref = (t: string) => {
    const params = new URLSearchParams();
    if (runFile !== "latest") params.set("run", runFile);
    params.set("tab", t);
    if (debug) params.set("debug", "1");
    return `/?${params.toString()}`;
  };

  const activeResult = tab !== "debug" ? run.verticals[tab] : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            News Engine <span className="font-normal text-zinc-500">— redação</span>
            {run.mode === "mock" && (
              <span className="ml-3 rounded-full border border-amber-700/60 bg-amber-950/60 px-2.5 py-0.5 align-middle text-xs font-medium text-amber-400">
                MODO MOCK — dados simulados
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            run <code>{run.run_id.slice(0, 8)}</code> · janela {run.lookback_hours}h
          </p>
        </div>
        <RunSelector runs={runs} current={runFile} tab={tab} debug={debug} />
      </header>

      <div className="mt-6 space-y-4">
        <StatsHeader run={run} />
        <ApprovalTable run={run} reviews={reviews} names={names} />
      </div>

      <nav className="mt-8 flex flex-wrap gap-1 border-b border-zinc-800">
        {verticalIds.map((vid) => (
          <Link
            key={vid}
            href={tabHref(vid)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === vid
                ? "border border-b-0 border-zinc-700 bg-zinc-900 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {names[vid] ?? vid}
            <span className="ml-2 text-xs text-zinc-500">{run.verticals[vid].stories.length}</span>
          </Link>
        ))}
        {debug && (
          <Link
            href={tabHref("debug")}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === "debug"
                ? "border border-b-0 border-violet-800 bg-zinc-900 text-violet-300"
                : "text-violet-500/70 hover:text-violet-300"
            }`}
          >
            Pipeline / Debug
          </Link>
        )}
      </nav>

      <section className="mt-6 space-y-5">
        {tab === "debug" ? (
          <DebugPanel run={run} />
        ) : activeResult ? (
          <>
            {activeResult.insufficient_quality_candidates && (
              <div className="rounded-lg border border-amber-800/60 bg-amber-950/40 p-4 text-sm text-amber-300">
                Candidatas de qualidade insuficientes nesta vertical: apenas{" "}
                {activeResult.stories.length} story(ies) acima do threshold. Melhor menos e boas do
                que quota preenchida com ruins.
              </div>
            )}
            {activeResult.stories.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhuma story selecionada nesta vertical neste run.</p>
            )}
            {[...activeResult.stories]
              .sort((a, b) => a.selection_rank - b.selection_rank)
              .map((story) => (
                <StoryCard key={story.story_id} story={story} review={reviews[story.story_id] ?? null} />
              ))}
          </>
        ) : null}
      </section>

      <footer className="mt-12 border-t border-zinc-900 pt-4 text-xs text-zinc-600">
        News Engine MVP — dashboard local (Next.js). Os dados vêm de <code>data/*.json</code> gerados
        pelo pipeline Python; reviews são gravadas em <code>data/reviews/</code>.
      </footer>
    </main>
  );
}
