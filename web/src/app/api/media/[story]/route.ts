/**
 * POST /api/media/{story_id}?run={file|latest}
 * Busca fotos no banco ou gera candidatas com IA, grava TODAS no pool do post
 * e pré-seleciona apenas os slides ainda sem imagem. Regenerar é aditivo:
 * escolhas existentes nunca são substituídas.
 */

import { NextResponse, after } from "next/server";
import { loadPromptOverrides, loadRun } from "@/lib/data";
import { analyzePlacementSmart, bankCandidates, scoreCandidate, sharpnessScore } from "@/lib/media/generate";
import { applyPool, applySelection, autoFillEmptySlides, findStory, persistMedia, poolPath } from "@/lib/media/persist";
import { sameOrigin } from "@/lib/news";
import { openaiKey, stockEnabled } from "@/lib/images";
import { createHash } from "node:crypto";
import { prerenderSlides } from "@/lib/slides/prerender";
import { buildImagePrompt } from "@/lib/media/prompt";

export const dynamic = "force-dynamic";
// Uma geração inicial usa até cinco imagens (uma por slide), limite do Tier 1.
export const maxDuration = 300;
const MAX_RATE_LIMIT_RETRIES = 1;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter * 1000) + 1_000;
  // Keep below the 5 image/minute Tier 1 limit even when the API omits Retry-After.
  return Math.max(60_000, 60_000 * (attempt + 1));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ story: string }> },
) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const { story: storyId } = await params;
  const runFile = new URL(request.url).searchParams.get("run") ?? "latest";

  if (!/^[\w-]+$/.test(storyId)) {
    return NextResponse.json({ error: "story_id inválido" }, { status: 400 });
  }

  let run = await loadRun(runFile);
  if (!run) {
    return NextResponse.json({ error: "run não encontrado" }, { status: 404 });
  }
  let story = findStory(run, storyId);
  if (!story) {
    return NextResponse.json({ error: "story não encontrada neste run" }, { status: 404 });
  }
  if (!story.draft?.slides?.length) {
    return NextResponse.json({ error: "story sem carrossel para ilustrar" }, { status: 400 });
  }

  const started = Date.now();
  const url = new URL(request.url);
  const ai = url.searchParams.get("mode") === "ai";
  const requestedSlide = Number(url.searchParams.get("slide"));
  if (url.searchParams.has("slide") && (!Number.isInteger(requestedSlide) || requestedSlide < 1)) {
    return NextResponse.json({ error: "slide inválido" }, { status: 400 });
  }
  try {
    const result = ai ? await aiCandidates(story, url.searchParams.has("slide") ? requestedSlide : undefined) : { files: await bankCandidates(story), problems: stockEnabled() ? [] : ["Unsplash/Pexels não configurados. Busca limitada a Wikimedia e Openverse."] };
    const { files: found, problems } = result;
    if (found.length === 0) return NextResponse.json({ error: ai ? "Nenhuma imagem foi gerada. Tente novamente." : "Nenhuma foto adequada foi encontrada. Tente enviar uma imagem ou gerar com IA.", problems }, { status: 502 });
    // Generation can take minutes. Merge into fresh data to preserve edits made meanwhile.
    run = await loadRun(runFile);
    story = run ? findStory(run, storyId) : null;
    if (!run || !story?.draft?.slides?.length) throw new Error("Post não encontrado após geração.");
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

    if (filled.length) { const currentStory = story; after(() => prerenderSlides(currentStory, filled)); }
    return NextResponse.json({
      ok: true,
      problems,
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

async function aiCandidates(story: import("@/lib/types").Story, onlySlide?: number) {
  const key = openaiKey();
  if (!key) throw new Error("OPENAI_API_KEY não configurada");
  const slides = story.draft?.slides ?? [];
  const { image: customImagePrompt } = await loadPromptOverrides();
  const generationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const targets = onlySlide === undefined ? slides : slides.filter((slide) => slide.slide_number === onlySlide);
  if (!targets.length) throw new Error("slide não encontrado no carrossel");
  const generated = await Promise.all(targets.map(async (slide) => {
    const problems: string[] = [];
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
      carouselContext: slides.map(s => `Slide ${s.slide_number}: ${s.headline}. ${s.body}. Visual: ${s.image_direction}`).join("\n"),
    });
    let body: { data?: { b64_json?: string }[] } | null = null;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      const response = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2", prompt, size: "1024x1536", quality: "medium", n: 1, output_format: "jpeg" }), signal: AbortSignal.timeout(120000) });
      if (response.ok) { body = await response.json() as { data?: { b64_json?: string }[] }; break; }
      const detail = (await response.text()).slice(0, 180);
      if (response.status !== 429 || attempt === MAX_RATE_LIMIT_RETRIES) {
        problems.push(`Slide ${slide.slide_number}: OpenAI ${response.status}: ${detail}`);
        break;
      }
      await sleep(retryDelay(response, attempt));
    }
    if (!body) return { files: [], problems };
    const candidates = await Promise.all((body.data ?? []).map(async (item, variant) => {
      const b64 = item.b64_json;
      if (!b64) return null;
      const bytes = Buffer.from(b64, "base64");
      // JPEG de propósito (2026-09-07): liga a MESMA análise das demais
      // candidatas — veto de rosto, faixa de contraste, foco do corte 4:5 e
      // nitidez. Antes (PNG) a IA entrava cega: BOTTOM fixo e score 85 fixo.
      const smart = await analyzePlacementSmart(bytes);
      const { score, notes } = scoreCandidate({ origin: "upload", bandScore: smart.bandScore, sharpness: sharpnessScore(bytes) });
      const id = `ai${createHash("sha1").update(`${story.story_id}:${generationId}:${slide.slide_number}:${variant}:${prompt}`).digest("hex").slice(0, 12)}`;
      return { bytes, candidate: { id, local_path: poolPath(story.story_id, id, "image/jpeg"), origin: "upload" as const, source: "ai", mime_type: "image/jpeg", credit: "ILUSTRAÇÃO GERADA POR IA", text_placement: smart.placement, text_align: smart.align, score, score_notes: notes, added_at: new Date().toISOString(), focus_x: smart.focusX, focus_y: smart.focusY, width: smart.width || 1024, height: smart.height || 1536, generated_for_slide: slide.slide_number } };
    }));
    return { files: candidates.filter(Boolean) as import("@/lib/media/persist").PoolFile[], problems };
  }));
  return { files: generated.flatMap((result) => result.files), problems: generated.flatMap((result) => result.problems) };
}
