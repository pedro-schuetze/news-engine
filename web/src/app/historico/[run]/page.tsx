import Link from "next/link";
import { notFound } from "next/navigation";
import RunView from "@/components/RunView";
import { loadReviews, loadRun, loadVerticalNames } from "@/lib/data";
import { fmtLocal } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = Promise<{ run: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { run: runFileRaw } = await params;
  const sp = await searchParams;
  const runFile = decodeURIComponent(runFileRaw);
  const tab = typeof sp.tab === "string" ? sp.tab : "";
  const debug = sp.debug === "1";

  const [run, reviews, names] = await Promise.all([
    loadRun(runFile),
    loadReviews(),
    loadVerticalNames(),
  ]);
  if (!run) notFound();

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/historico"
            className="font-mono text-[11.5px] font-medium text-ink-3 hover:text-ink-2"
          >
            ← histórico
          </Link>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-navy">
            Run de {fmtLocal(run.started_at)}
            {run.mode === "mock" && (
              <span className="ml-3 inline-block rounded-full bg-warn-soft px-2.5 py-1 align-middle font-mono text-[11px] font-medium text-warn">
                mock
              </span>
            )}
          </h1>
        </div>
        <p className="font-mono text-[11.5px] text-ink-3">
          run {run.run_id.slice(0, 8)} · janela {run.lookback_hours}h
        </p>
      </header>

      <div className="mt-5">
        <RunView
          run={run}
          reviews={reviews}
          names={names}
          basePath={`/historico/${encodeURIComponent(runFile)}`}
          tab={tab}
          debug={debug}
          runFile={runFile}
        />
      </div>
    </div>
  );
}
