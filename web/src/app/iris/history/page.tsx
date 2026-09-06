import Link from "next/link";
import { groupNewsBySection, loadSnapshot, loadSnapshotRuns, type NewsSnapshot } from "@/lib/news";
import HistoryStoryAction from "@/components/HistoryStoryAction";

export const dynamic = "force-dynamic";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selected = typeof params.run === "string" ? params.run : undefined;
  const [runs, snapshot] = await Promise.all([loadSnapshotRuns(), loadSnapshot(selected)]);
  return <div className="space-y-8">
    <header><p className="microlabel">snapshot archive</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-navy">History</h1><p className="mt-2 max-w-2xl text-sm text-ink-2">Every three-hour front-page collection, preserved so you can see what changed and when.</p></header>
    <section><div className="mb-3 flex items-center justify-between"><p className="microlabel">collection runs · {runs.length}</p>{snapshot && <Link href="/iris/history" className="text-xs text-brand hover:underline">Clear selection</Link>}</div><div className="overflow-hidden rounded-xl border border-line bg-panel">{runs.length === 0 ? <p className="p-8 text-center text-sm text-ink-3">No snapshots yet.</p> : runs.map((run) => <Link key={run.id} href={`/iris/history?run=${run.id}`} className={`flex items-center justify-between gap-4 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-panel-2 ${selected === run.id ? "bg-panel-2" : ""}`}><div><p className="text-sm font-medium text-ink">{formatDate(run.fetched_at)}</p><p className="mt-0.5 text-xs text-ink-3">Run {run.id}</p></div><div className="flex gap-4 text-right text-xs text-ink-2"><span><strong className="text-ink">{run.stats.stories}</strong> stories</span><span><strong className="text-ink">{run.stats.new}</strong> new</span><span><strong className="text-ink">{run.stats.retained}</strong> retained</span></div></Link>)}</div></section>
    {snapshot && <SnapshotDetail snapshot={snapshot} />}
  </div>;
}

function SnapshotDetail({ snapshot }: { snapshot: NewsSnapshot }) {
  const groups = groupNewsBySection(snapshot.stories);
  return <section><p className="microlabel">selected snapshot</p><h2 className="mt-1 text-xl font-semibold text-navy">{formatDate(snapshot.fetched_at)}</h2><p className="mt-1 text-xs text-ink-3">{snapshot.stories.length} story groups · {snapshot.edition}</p><div className="mt-4 grid gap-4 md:grid-cols-2">{Object.entries(groups).map(([section, stories]) => <div key={section} className="rounded-xl border border-line bg-panel p-4"><h3 className="mb-3 text-sm font-semibold text-ink">{stories[0]?.section_label ?? section}</h3><ol className="space-y-3">{stories.map((story) => <li key={story.guid} className="flex gap-3 text-sm"><span className="font-mono text-xs text-ink-3">{String(story.rank).padStart(2, "0")}</span><div className="min-w-0"><a href={story.url} target="_blank" rel="noreferrer" className="leading-snug text-ink hover:text-brand">{story.title}</a><HistoryStoryAction snapshotId={snapshot.id} storyId={story.id} /></div></li>)}</ol></div>)}</div></section>;
}
