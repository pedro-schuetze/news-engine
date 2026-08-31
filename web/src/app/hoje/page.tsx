import RunView from "@/components/RunView";
import { loadReviews, loadRun, loadVerticalNames } from "@/lib/data";
import { fmtDayLong, fmtLocal, isSameLocalDay } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HojePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "";
  const debug = sp.debug === "1";

  const [run, reviews, names] = await Promise.all([
    loadRun("latest"),
    loadReviews(),
    loadVerticalNames(),
  ]);

  if (!run) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <p className="microlabel">posts de hoje</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy">Nenhum run ainda</h1>
        <p className="mt-3 text-[14px] text-ink-2">
          Rode <code className="font-mono text-brand-ink">python -m src.pipeline</code> na raiz do
          repositório para gerar as sugestões do dia.
        </p>
      </div>
    );
  }

  const isToday = isSameLocalDay(run.started_at);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="microlabel">{fmtDayLong(run.started_at)}</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-navy">
            Posts de hoje
            {run.mode === "mock" && (
              <span className="ml-3 inline-block rounded-full bg-warn-soft px-2.5 py-1 align-middle font-mono text-[11px] font-medium text-warn">
                mock — dados simulados
              </span>
            )}
          </h1>
        </div>
        <p className="font-mono text-[11.5px] text-ink-3">
          run {run.run_id.slice(0, 8)} · janela {run.lookback_hours}h
        </p>
      </header>

      {!isToday && (
        <div className="mt-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn">
          O run mais recente é de {fmtLocal(run.started_at)} — ainda não há run de hoje. Rode o
          pipeline ou aguarde o agendamento das 06:00.
        </div>
      )}

      <div className="mt-5">
        <RunView
          run={run}
          reviews={reviews}
          names={names}
          basePath="/hoje"
          tab={tab}
          debug={debug}
        />
      </div>
    </div>
  );
}
