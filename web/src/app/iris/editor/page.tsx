import { loadSnapshot } from "@/lib/news";
import IrisStoryEditor from "@/components/IrisStoryEditor";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) { const p=await searchParams; const s=await loadSnapshot(p.snapshot); const story=s?.stories.find(x=>x.id===p.story); if(!s||!story) return <p className="p-8">Story not found.</p>; return <IrisStoryEditor snapshotId={s.id} storyId={story.id} title={story.title} section={story.section_label} outlets={story.outlets.map(o=>({name:o.name,url:o.url}))}/>; }
