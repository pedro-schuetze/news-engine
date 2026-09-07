import { loadSnapshot, sectionLabelPt } from "@/lib/news";
import IrisStoryEditor from "@/components/IrisStoryEditor";
import RunView from "@/components/RunView";
import { loadReviews, loadRun, loadVerticalNames } from "@/lib/data";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) { const p=await searchParams; if (p.run) { const [run,reviews,names]=await Promise.all([loadRun(p.run),loadReviews(),loadVerticalNames()]); if (!run) return <p className="p-8">Post não encontrado.</p>; return <RunView run={run} reviews={reviews} names={names} basePath={`/iris/editor?run=${encodeURIComponent(p.run)}`} tab="" debug={false} runFile={p.run} minStories={1} iris />; } const s=await loadSnapshot(p.snapshot); const story=s?.stories.find(x=>x.id===p.story); if(!s||!story) return <p className="p-8">Pauta não encontrada.</p>; return <IrisStoryEditor snapshotId={s.id} storyId={story.id} title={story.title} section={sectionLabelPt(story.section_label)} outlets={story.outlets.map(o=>({name:o.name,url:o.url}))}/>; }
