/**
 * POST /api/instagram/publish/{story}?run= — publica o carrossel DIRETO na
 * conta conectada e marca o post como PUBLISHED. Exige a chave (middleware)
 * e todas as imagens no lugar (mesmo gate da aprovação).
 */
import { NextResponse } from "next/server";
import { loadRun, saveReview } from "@/lib/data";
import { findStory } from "@/lib/media/persist";
import { igConfigured, igPublishCarousel } from "@/lib/instagram";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ story: string }> },
) {
  const { story: storyId } = await params;
  const url = new URL(request.url);
  const runFile = url.searchParams.get("run") ?? "latest";
  if (!/^[\w-]+$/.test(storyId)) {
    return NextResponse.json({ error: "story_id inválido" }, { status: 400 });
  }
  if (!igConfigured()) {
    return NextResponse.json(
      { error: "Instagram não conectado — configure IG_USER_ID e IG_ACCESS_TOKEN" },
      { status: 409 },
    );
  }
  try {
    const publicBase = `${url.protocol}//${url.host}`;
    const result = await igPublishCarousel(runFile, storyId, publicBase);

    // marca como publicado no sistema (mesmo efeito do botão manual)
    const run = await loadRun(runFile);
    const story = run ? findStory(run, storyId) : null;
    if (story) {
      await saveReview({
        story_id: story.story_id,
        run_id: story.run_id,
        vertical: story.vertical,
        review_status: "PUBLISHED",
        reviewed_at: new Date().toISOString(),
        review_notes: `Instagram: ${result.permalink}`,
      });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 502 });
  }
}
