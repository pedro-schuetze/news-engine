import { NextResponse } from "next/server";
import { composeFromNews } from "@/lib/compose/fromNews";
import { loadSnapshot, NEWS_ID, SNAPSHOT_ID, sameOrigin } from "@/lib/news";
import { persistRun } from "@/lib/compose/persistRun";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { snapshot_id?: string; story_id?: string };
  if (!SNAPSHOT_ID.test(body.snapshot_id ?? "") || !NEWS_ID.test(body.story_id ?? "")) return NextResponse.json({ error: "invalid story" }, { status: 400 });
  const snapshot = await loadSnapshot(body.snapshot_id);
  const item = snapshot?.stories.find(s => s.id === body.story_id);
  if (!snapshot || !item) return NextResponse.json({ error: "story not found in snapshot" }, { status: 404 });
  try {
    const result = await composeFromNews(snapshot, item);
    await persistRun(result.run, result.runFile, `news: draft ${item.id}`);
    return NextResponse.json({ ok: true, run_file: result.runFile, story_id: result.story.story_id });
  } catch (error) { return NextResponse.json({ error: String(error).replace(/^Error:\s*/, "").slice(0, 300) }, { status: 502 }); }
}
