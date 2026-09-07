import ComposeForm from "@/components/IrisComposeForm";
import RunView from "@/components/RunView";
import { loadReviews, loadRun, loadVerticalNames } from "@/lib/data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Manual mode: provide source links and optionally guide the fixed editorial tone.
 */
export default async function GerarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const runFile = typeof sp.run === "string" ? sp.run : "";
  const debug = sp.debug === "1";
  const tab = typeof sp.tab === "string" ? sp.tab : "";

  const [run, reviews, names] = await Promise.all([
    runFile ? loadRun(runFile) : Promise.resolve(null),
    loadReviews(),
    loadVerticalNames(),
  ]);

  return (
    <div>
      <header>
        <p className="microlabel">manual mode</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-navy">Criar post</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] text-ink-2">
          Add one or more source links. The post will use the same tone and editorial rules as the
          automatic pipeline, then open in the editor for your review.
        </p>
      </header>

      <div className="mt-5">
        <ComposeForm currentRun={""} />
      </div>

      {run && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <p className="microlabel">result</p>
            <span className="font-mono text-[11px] text-ink-3">
              Review the draft, request changes, approve it, or discard it.
            </span>
          </div>
          <RunView
            run={run}
            reviews={reviews}
            names={names}
            basePath={`/gerar?run=${encodeURIComponent(runFile)}`}
            tab={tab}
            debug={debug}
            runFile={runFile}
            minStories={1}
          />
        </section>
      )}
    </div>
  );
}
