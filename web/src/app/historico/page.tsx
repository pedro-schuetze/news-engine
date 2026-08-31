import Link from "next/link";
import RunsTable from "@/components/RunsTable";
import StoryRow from "@/components/StoryRow";
import { listRunSummaries, loadAllStories, loadReviews, loadVerticalNames } from "@/lib/data";
import type { ReviewStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "Todas" },
  { id: "APPROVED", label: "Aprovadas" },
  { id: "REJECTED", label: "Rejeitadas" },
  { id: "PENDING", label: "Pendentes" },
];

const MAX_ROWS = 120;

export default async function HistoricoPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const vertical = typeof sp.vertical === "string" ? sp.vertical : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const [entries, reviews, names, summaries] = await Promise.all([
    loadAllStories(30),
    loadReviews(),
    loadVerticalNames(),
    listRunSummaries(30),
  ]);

  const filtered = entries.filter((e) => {
    const reviewStatus: ReviewStatus = reviews[e.story.story_id]?.review_status ?? "PENDING";
    if (status && reviewStatus !== status) return false;
    if (vertical && e.story.vertical !== vertical) return false;
    if (q) {
      const haystack = `${e.story.title} ${e.story.draft?.instagram_headline ?? ""} ${
        e.story.draft?.short_summary ?? ""
      }`.toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const href = (next: { status?: string; vertical?: string; q?: string }) => {
    const params = new URLSearchParams();
    const s = next.status ?? status;
    const v = next.vertical ?? vertical;
    const query = next.q ?? q;
    if (s) params.set("status", s);
    if (v) params.set("vertical", v);
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/historico?${qs}` : "/historico";
  };

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
      active ? "bg-ink text-white" : "bg-panel text-ink-2 border border-line hover:bg-panel-2"
    }`;

  return (
    <div>
      <header>
        <p className="microlabel">banco de notícias e runs</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-navy">Histórico</h1>
      </header>

      {/* runs */}
      <section className="mt-6">
        <p className="microlabel mb-2.5">runs ({summaries.length})</p>
        <RunsTable runs={summaries} names={names} limit={8} />
      </section>

      {/* banco de stories */}
      <section className="mt-8">
        <p className="microlabel mb-2.5">
          stories ({filtered.length}
          {filtered.length !== entries.length ? ` de ${entries.length}` : ""})
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <Link key={f.id} href={href({ status: f.id })} className={chip(status === f.id)}>
                {f.label}
              </Link>
            ))}
          </div>
          <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
          <div className="flex flex-wrap gap-1.5">
            <Link href={href({ vertical: "" })} className={chip(vertical === "")}>
              Todas as verticais
            </Link>
            {Object.entries(names).map(([vid, name]) => (
              <Link key={vid} href={href({ vertical: vid })} className={chip(vertical === vid)}>
                {name}
              </Link>
            ))}
          </div>
          <form method="get" action="/historico" className="ml-auto flex items-center gap-1.5">
            {status && <input type="hidden" name="status" value={status} />}
            {vertical && <input type="hidden" name="vertical" value={vertical} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="buscar título ou resumo…"
              className="w-52 rounded-full border border-line bg-panel px-3.5 py-1.5 text-[12.5px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
          </form>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-panel">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink-3">
              Nenhuma story com esses filtros.
            </p>
          ) : (
            filtered
              .slice(0, MAX_ROWS)
              .map((e) => (
                <StoryRow
                  key={`${e.runFile}-${e.story.story_id}`}
                  entry={e}
                  review={reviews[e.story.story_id] ?? null}
                  verticalName={names[e.story.vertical]}
                />
              ))
          )}
        </div>
        {filtered.length > MAX_ROWS && (
          <p className="mt-2 font-mono text-[11.5px] text-ink-3">
            mostrando {MAX_ROWS} de {filtered.length} — refine os filtros para ver o resto.
          </p>
        )}
      </section>
    </div>
  );
}
