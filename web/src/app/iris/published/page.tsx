import Link from "next/link";
import ReadyPostCard from "@/components/ReadyPostCard";
import { loadAllStories, loadReviews } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PublishedPage() {
  const [entries, reviews] = await Promise.all([loadAllStories(50), loadReviews()]);
  const published = entries.filter((e) => reviews[e.story.story_id]?.review_status === "PUBLISHED");
  return <div>
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="microlabel">publication archive</p><h1 className="mt-1 text-[30px] font-semibold tracking-tight text-navy">Published</h1><p className="mt-2 text-[13px] text-ink-2">Posts you have marked as published.</p></div>
      <Link href="/iris/approved" className="rounded-full border border-line bg-panel px-4 py-2 text-[12px] font-semibold text-ink-2 hover:text-ink">Back to Approved</Link>
    </header>
    <div className="mt-7">{published.length === 0 ? <div className="rounded-2xl border border-dashed border-line bg-panel px-6 py-12 text-center text-[13px] text-ink-2">Nothing published yet.</div> : <div className="grid gap-4 xl:grid-cols-2">{published.map((e) => <ReadyPostCard key={`${e.runFile}-${e.story.story_id}`} entry={e} verticalName={e.story.vertical} published />)}</div>}</div>
  </div>;
}
