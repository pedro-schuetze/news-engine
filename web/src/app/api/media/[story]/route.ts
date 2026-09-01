/**
 * POST /api/media/{story_id}?run={file|latest}
 * Gera as imagens do post (uma por slide) e persiste. É o que o botão
 * "gerar imagens" do dashboard chama.
 *
 * As gerações rodam em paralelo, então 5 slides levam o tempo de ~1 imagem
 * (~40s) em vez de 5x isso.
 */

import { NextResponse } from "next/server";
import { loadRun } from "@/lib/data";
import { generateStoryImages } from "@/lib/media/generate";
import { persistAssets } from "@/lib/media/persist";
import type { Story } from "@/lib/types";

export const dynamic = "force-dynamic";
// geração de imagem é lenta; o teto da Vercel para este projeto é 300s
export const maxDuration = 300;

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
  if (generated.length === 0) {
    return NextResponse.json(
      { error: "nenhuma imagem pôde ser obtida (banco vazio e IA indisponível)" },
      { status: 502 },
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
    const cost = assets.reduce((sum, a) => sum + (a.estimated_cost_usd ?? 0), 0);
    return NextResponse.json({
      ok: true,
      slides: assets.length,
      from_bank: generated.filter((g) => g.source !== "ai").length,
      from_ai: generated.filter((g) => g.source === "ai").length,
      estimated_cost_usd: Math.round(cost * 10000) / 10000,
      seconds: Math.round((Date.now() - started) / 1000),
      persisted_to: where,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
