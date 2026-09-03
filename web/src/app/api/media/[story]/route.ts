/**
 * POST /api/media/{story_id}?run={file|latest}
 * Busca fotos no banco (Wikimedia/Openverse), grava TODAS como candidatas no
 * pool do post e pré-seleciona (por score) apenas os slides ainda sem imagem.
 * A geração por IA via API foi removida em 2026-09-02; o que o banco não
 * cobrir, o editor completa subindo as imagens do ChatGPT.
 */

import { NextResponse, after } from "next/server";
import { loadRun } from "@/lib/data";
import { bankCandidates } from "@/lib/media/generate";
import { applyPool, autoFillEmptySlides, findStory, persistMedia } from "@/lib/media/persist";
import { prerenderSlides } from "@/lib/slides/prerender";

export const dynamic = "force-dynamic";
// busca + download do banco; folga para redes lentas
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ story: string }> },
) {
  const { story: storyId } = await params;
  const runFile = new URL(request.url).searchParams.get("run") ?? "latest";

  if (!/^[\w-]+$/.test(storyId)) {
    return NextResponse.json({ error: "story_id inválido" }, { status: 400 });
  }

  const run = await loadRun(runFile);
  if (!run) {
    return NextResponse.json({ error: "run não encontrado" }, { status: 404 });
  }
  const story = findStory(run, storyId);
  if (!story) {
    return NextResponse.json({ error: "story não encontrada neste run" }, { status: 404 });
  }
  if (!story.draft?.slides?.length) {
    return NextResponse.json({ error: "story sem carrossel para ilustrar" }, { status: 400 });
  }

  const started = Date.now();
  const found = await bankCandidates(story);
  if (found.length === 0 && !(story.media_pool?.length ?? 0)) {
    return NextResponse.json(
      {
        error:
          "o banco não tem foto relevante para este assunto — use o prompt do ChatGPT e suba as imagens",
      },
      { status: 404 },
    );
  }

  try {
    const fresh = applyPool(story, found.map((f) => f.candidate));
    const freshIds = new Set(fresh.map((c) => c.id));
    const filled = autoFillEmptySlides(story);
    const where = await persistMedia(
      found.filter((f) => freshIds.has(f.candidate.id)),
      run,
      runFile,
      `media: ${fresh.length} candidatas do banco para ${storyId.slice(0, 8)}`,
    );

    const covered = new Set((story.slide_media ?? []).map((m) => m.slide_number));
    const missing = story.draft.slides
      .map((s) => s.slide_number)
      .filter((n) => !covered.has(n));

    if (filled.length) after(() => prerenderSlides(story, filled));
    return NextResponse.json({
      ok: true,
      pool: story.media_pool?.length ?? 0,
      new_candidates: fresh.length,
      filled,
      missing,
      slides: covered.size,
      seconds: Math.round((Date.now() - started) / 1000),
      persisted_to: where,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
