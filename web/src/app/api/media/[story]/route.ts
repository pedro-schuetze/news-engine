/**
 * POST /api/media/{story_id}?run={file|latest}
 * Busca as imagens do post no banco (uma foto distinta por slide) e
 * persiste. É o que o botão "buscar fotos no banco" do dashboard chama.
 * Slides sem foto relevante ficam sem imagem: o editor completa subindo as
 * imagens do ChatGPT (a geração por IA via API foi removida em 2026-09-02).
 */

import { NextResponse } from "next/server";
import { loadRun } from "@/lib/data";
import { generateStoryImages } from "@/lib/media/generate";
import { persistAssets } from "@/lib/media/persist";
import type { Story } from "@/lib/types";

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
  let story: Story | null = null;
  for (const vr of Object.values(run.verticals)) {
    for (const s of vr.stories) {
      if (s.story_id === storyId) story = s;
    }
  }
  if (!story) {
    return NextResponse.json({ error: "story não encontrada neste run" }, { status: 404 });
  }
  if (!story.draft?.slides?.length) {
    return NextResponse.json({ error: "story sem carrossel para ilustrar" }, { status: 400 });
  }

  const started = Date.now();
  const generated = await generateStoryImages(story);
  const covered = new Set(generated.map((g) => g.slide_number));
  const missing = story.draft.slides
    .map((s) => s.slide_number)
    .filter((n) => !covered.has(n));
  if (generated.length === 0) {
    return NextResponse.json(
      {
        error:
          "o banco não tem foto relevante para este assunto — use o prompt do ChatGPT e suba as imagens",
      },
      { status: 404 },
    );
  }

  try {
    const { assets, where } = await persistAssets(
      storyId,
      story.draft.draft_id ?? null,
      generated,
      run,
      runFile,
    );
    return NextResponse.json({
      ok: true,
      slides: assets.length,
      from_bank: assets.length,
      missing,
      seconds: Math.round((Date.now() - started) / 1000),
      persisted_to: where,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
