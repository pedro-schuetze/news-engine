import Link from "next/link";
export default function HistoryStoryAction({snapshotId, storyId}: {snapshotId:string; storyId:string}) { return <Link className="mt-2 inline-flex rounded-lg border border-line px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-soft" href={`/iris/editor?snapshot=${snapshotId}&story=${storyId}`}>Criar post desta pauta ↗</Link>; }
