/**
 * POST /api/media/{story_id}/upload?run={file|latest}
 * multipart/form-data com os campos slide_1..slide_N (imagens).
 *
 * Caminho manual: imagens geradas no ChatGPT (skill news-engine-carousel)
 * entram no POOL como candidatas (mesma análise de contraste e score das do
 * banco) e preenchem os slides ainda vazios na ordem enviada. Slide que já
 * tem imagem escolhida NÃO é sobrescrito — a troca é feita no seletor.
 */

import { NextResponse } from "next/server";
import { loadRun } from "@/lib/data";
import { analyzePlacement, scoreCandidate, sharpnessScore } from "@/lib/media/generate";
import {
  applyPool,
  applySelection,
  findStory,
  persistMedia,
  poolPath,
  type PoolFile,
} from "@/lib/media/persist";
import type { MediaCandidate } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 6_000_000;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  if (!run) return NextResponse.json({ error: "run não encontrado" }, { status: 404 });
  const story = findStory(run, storyId);
  if (!story?.draft?.slides?.length) {
    return NextResponse.json({ error: "story sem carrossel" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "envie multipart/form-data" }, { status: 400 });
  }

  const stamp = Date.now().toString(36);
  const poolFiles: PoolFile[] = [];
  const problems: string[] = [];

  // campos chegam como slide_1..slide_N na ordem escolhida pelo editor
  const fields = [...form.entries()]
    .filter(([k, v]) => k.startsWith("slide_") && v instanceof File)
    .sort(([a], [b]) => Number(a.slice(6)) - Number(b.slice(6)));

  for (const [key, field] of fields) {
    const file = field as File;
    if (!ALLOWED.has(file.type)) {
      problems.push(`${key}: tipo ${file.type} não aceito`);
      continue;
    }
    if (file.size > MAX_BYTES) {
      problems.push(`${key}: ${Math.round(file.size / 1024)}KB acima do limite`);
      continue;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    // o cliente converte para JPEG antes do envio; PNG/WebP cru entra com
    // análise neutra (jpeg-js só decodifica JPEG)
    const isJpeg = file.type === "image/jpeg";
    const { placement, align, bandScore } = isJpeg
      ? analyzePlacement(bytes)
      : { placement: "BOTTOM" as const, align: "center" as const, bandScore: 50 };
    const sharp = isJpeg ? sharpnessScore(bytes) : 50;
    const { score, notes } = scoreCandidate({
      origin: "upload",
      bandScore,
      sharpness: sharp,
    });
    const id = `u${stamp}-${key.slice(6)}`;
    const candidate: MediaCandidate = {
      id,
      local_path: poolPath(storyId, id, file.type),
      origin: "upload",
      source: "ai",
      mime_type: file.type,
      credit: "ILUSTRAÇÃO GERADA POR IA",
      text_placement: placement,
      text_align: align,
      score,
      score_notes: notes,
      added_at: new Date().toISOString(),
    };
    poolFiles.push({ candidate, bytes });
  }

  if (poolFiles.length === 0) {
    return NextResponse.json(
      { error: "nenhuma imagem válida no envio", problems },
      { status: 400 },
    );
  }

  try {
    const fresh = applyPool(story, poolFiles.map((p) => p.candidate));

    // preenche os slides vazios NA ORDEM enviada (fluxo ChatGPT: o editor
    // gera as N imagens já na ordem dos slides)
    const covered = new Set((story.slide_media ?? []).map((m) => m.slide_number));
    const queue = [...fresh];
    const filled: number[] = [];
    for (const slide of story.draft.slides) {
      if (covered.has(slide.slide_number)) continue;
      const next = queue.shift();
      if (!next) break;
      applySelection(story, slide.slide_number, next);
      filled.push(slide.slide_number);
    }

    const where = await persistMedia(
      poolFiles.filter((p) => fresh.some((c) => c.id === p.candidate.id)),
      run,
      runFile,
      `media: ${fresh.length} uploads para ${storyId.slice(0, 8)}`,
    );

    const nowCovered = new Set((story.slide_media ?? []).map((m) => m.slide_number));
    const missing = story.draft.slides
      .map((s) => s.slide_number)
      .filter((n) => !nowCovered.has(n));

    return NextResponse.json({
      ok: true,
      pool: story.media_pool?.length ?? 0,
      new_candidates: fresh.length,
      filled,
      missing,
      slides: nowCovered.size,
      problems,
      persisted_to: where,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
