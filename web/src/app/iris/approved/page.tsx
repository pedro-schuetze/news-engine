import Link from "next/link";
import ReadyPostCard from "@/components/ReadyPostCard";
import { loadAllStories, loadReviews } from "@/lib/data";
import { verticalStyle } from "@/lib/ui";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Feed interno dos posts aprovados: como eles vão sair, com legenda pronta e
 * download do pacote (JPGs + legenda) para publicar no Instagram.
 */
export default async function ProntosPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [entries, reviews] = await Promise.all([loadAllStories(30), loadReviews()]);

  const approved = entries.filter((e) => reviews[e.story.story_id]?.review_status === "APPROVED");
  const queue = (list: typeof entries, empty: string) => <section className="mt-7">{list.length === 0 ? <div className="rounded-2xl border border-dashed border-line bg-panel px-6 py-12 text-center text-[13px] text-ink-2">{empty}</div> : <div className="grid gap-4 xl:grid-cols-2">{list.map((e) => <ReadyPostCard key={`${e.runFile}-${e.story.story_id}`} entry={e} verticalName={e.story.vertical} />)}</div>}</section>;

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
      active ? "bg-ink text-white" : "border border-line bg-panel text-ink-2 hover:bg-panel-2"
    }`;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="microlabel">publishing queue</p>
          <h1 className="mt-1 text-[30px] font-semibold tracking-tight text-navy">Ready to publish</h1>
        </div>
        <Link href="/iris/today" className="rounded-full bg-brand px-4 py-2 text-[12px] font-semibold text-white">Back to Today</Link>
      </header>

      <p className="mt-2 max-w-xl text-[13px] text-ink-2">Posts approved in the editor appear here. Use <b>Mark published</b> after they go live.</p>
      {queue(approved, "No approved posts yet. Approve a post from the editor to send it here.")}
    </div>
  );
}
