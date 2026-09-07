/**
 * POST /api/media/{story_id}?run={file|latest}
 * Busca fotos no banco ou gera candidatas com IA, grava TODAS no pool do post
 * e pré-seleciona apenas os slides ainda sem imagem. Regenerar é aditivo:
 * escolhas existentes nunca são substituídas.
 */

import { NextResponse, after } from "next/server";
import { loadPromptOverrides, loadRun } from "@/lib/data";
import { bankCandidates } from "@/lib/media/generate";
import { applyPool, applySelection, autoFillEmptySlides, findStory, persistMedia, poolPath } from "@/lib/media/persist";
import { openaiKey } from "@/lib/images";
import { createHash } from "node:crypto";
import { prerenderSlides } from "@/lib/slides/prerender";
import { buildImagePrompt } from "@/lib/media/prompt";

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
  const ai = new URL(request.url).searchParams.get("mode") === "ai";
  let found = ai ? await aiCandidates(story) : await bankCandidates(story);
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
      `media: ${fresh.length} candidatas novas para ${storyId.slice(0, 8)}`,
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

async function aiCandidates(story: import("@/lib/types").Story) {
  const key = openaiKey();
  if (!key) throw new Error("OPENAI_API_KEY não configurada");
  const slides = story.draft?.slides ?? [];
  const { image: customImagePrompt } = await loadPromptOverrides();
  const generationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return (await Promise.all(slides.map(async (slide) => {
    const prompt = buildImagePrompt({
      title: story.title,
      vertical: story.vertical,
      instagramHeadline: story.draft?.instagram_headline ?? "",
      shortSummary: story.draft?.short_summary ?? "",
      isRumorOrClaim: story.is_rumor_or_claim,
      slideNumber: slide.slide_number,
      slideCount: slides.length,
      role: slide.role,
      headline: slide.headline,
      body: slide.body,
      imageDirection: slide.image_direction,
      custom: customImagePrompt,
    });
    const response = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2", prompt, size: "1024x1536", quality: "low", n: 3, output_format: "png" }), signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`OpenAI image API ${response.status}: ${(await response.text()).slice(0, 180)}`);
    const body = await response.json() as { data?: { b64_json?: string }[] };
    return (body.data ?? []).map((item, variant) => {
      const b64 = item.b64_json;
      if (!b64) return null;
      const bytes = Buffer.from(b64, "base64");
      const id = `ai${createHash("sha1").update(`${story.story_id}:${generationId}:${slide.slide_number}:${variant}:${prompt}`).digest("hex").slice(0, 12)}`;
      return { bytes, candidate: { id, local_path: poolPath(story.story_id, id, "image/png"), origin: "upload" as const, source: "ai", mime_type: "image/png", credit: `Generated by OpenAI for slide ${slide.slide_number}`, text_placement: "BOTTOM" as const, text_align: "center" as const, score: 85, score_notes: "AI-generated editorial image", added_at: new Date().toISOString(), width: 1024, height: 1536, generated_for_slide: slide.slide_number } };
    }).filter(Boolean) as { bytes: Buffer; candidate: import("@/lib/types").MediaCandidate }[];
  }))).flat();
}
