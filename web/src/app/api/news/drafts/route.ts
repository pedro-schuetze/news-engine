import { NextResponse } from "next/server";
import { composeFromNews } from "@/lib/compose/fromNews";
import { loadSnapshot, NEWS_ID, SNAPSHOT_ID, sameOrigin } from "@/lib/news";
import { persistRun } from "@/lib/compose/persistRun";
import type { SourceLine } from "@/lib/compose/draft";
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
    const extracted = (await Promise.all(item.outlets.slice(0, 5).map(async (outlet) => {
      try {
        const response = await fetch(outlet.url, { signal: AbortSignal.timeout(4500), headers: { "user-agent": "Iris News Engine/1.0" } });
        const html = await response.text();
        const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)?.[1]?.trim() ?? "";
        const body = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)).map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()).filter((p) => p.length > 60).slice(0, 5).join(" ").slice(0, 1800);
        return { domain: outlet.domain || outlet.name, title: title || outlet.title, description: [description, body].filter(Boolean).join(" ").slice(0, 2200), published: item.published_at ?? undefined };
      } catch { return null; }
    }))).filter(Boolean) as SourceLine[];
    const result = await composeFromNews(snapshot, item, extracted);
    await persistRun(result.run, result.runFile, `news: draft ${item.id}`);
    return NextResponse.json({ ok: true, run_file: result.runFile, story_id: result.story.story_id });
  } catch (error) { return NextResponse.json({ error: String(error).replace(/^Error:\s*/, "").slice(0, 300) }, { status: 502 }); }
}
