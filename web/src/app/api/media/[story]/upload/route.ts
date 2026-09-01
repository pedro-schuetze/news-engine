/**
 * POST /api/media/{story_id}/upload?run={file|latest}
 * multipart/form-data com os campos slide_1..slide_N (imagens).
 *
 * Fecha o caminho manual: imagens geradas no ChatGGPT (skill
 * news-engine-carousel) voltam para o post e passam pela mesma análise de
 * contraste e persistência das geradas por API.
 */

import { NextResponse } from "next/server";
import { loadRun } from "@/lib/data";
import { analyzePlacement, type GeneratedAsset } from "@/lib/media/generate";
import { persistAssets } from "@/lib/media/persist";
import type { Story } from "@/lib/types";

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

  let story: Story | null = null;
  for (const vr of Object.values(run.verticals)) {
    for (const s of vr.stories) if (s.story_id === storyId) story = s;
  }
  if (!story?.draft?.slides?.length) {
    return NextResponse.json({ error: "story sem carrossel" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "envie multipart/form-data" }, { status: 400 });
  }

  const generated: GeneratedAsset[] = [];
  const problems: string[] = [];

  for (const slide of story.draft.slides) {
    const field = form.get(`slide_${slide.slide_number}`);
    if (!(field instanceof File)) continue;
    if (!ALLOWED.has(field.type)) {
      problems.push(`slide ${slide.slide_number}: tipo ${field.type} não aceito`);
      continue;
    }
    if (field.size > MAX_BYTES) {
      problems.push(`slide ${slide.slide_number}: ${Math.round(field.size / 1024)}KB acima do limite`);
      continue;
    }
    const bytes = Buffer.from(await field.arrayBuffer());
    // JPEG é analisado; PNG/WebP entram com o padrão (jpeg-js só lê JPEG)
    const { placement, align } =
      field.type === "image/jpeg" ? analyzePlacement(bytes) : { placement: "BOTTOM" as const, align: "center" as const };
    generated.push({
      slide_number: slide.slide_number,
      bytes,
      mime_type: field.type,
      credit: "ILUSTRAÇÃO GERADA POR IA",
      source: "ai",
      text_placement: placement,
      text_align: align,
      prompt: "gerada no ChatGPT com a skill news-engine-carousel",
      estimated_cost_usd: null,
    });
  }

  if (generated.length === 0) {
    return NextResponse.json(
      { error: "nenhuma imagem válida recebida", problems },
      { status: 400 },
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
      problems,
      persisted_to: where,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
