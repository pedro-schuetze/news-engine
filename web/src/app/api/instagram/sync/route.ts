/**
 * POST /api/instagram/sync — puxa as mídias da conta e casa com os posts
 * publicados do sistema (pela legenda). Grava data/instagram.json; likes e
 * comentários alimentam a ordenação do feed. Exige a chave (middleware).
 */
import { NextResponse } from "next/server";
import { loadAllStories, loadReviews } from "@/lib/data";
import { igConfigured, igSync } from "@/lib/instagram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (!igConfigured()) {
    return NextResponse.json(
      { error: "Instagram não conectado — configure IG_USER_ID e IG_ACCESS_TOKEN" },
      { status: 409 },
    );
  }
  try {
    const [entries, reviews] = await Promise.all([loadAllStories(30), loadReviews()]);
    const published = entries
      .filter((e) => reviews[e.story.story_id]?.review_status === "PUBLISHED")
      .map((e) => ({ story_id: e.story.story_id, caption: e.story.draft?.caption ?? "" }));
    const file = await igSync(published);
    return NextResponse.json({
      ok: true,
      matched: Object.keys(file.posts).length,
      published: published.length,
      synced_at: file.synced_at,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 250) }, { status: 502 });
  }
}
