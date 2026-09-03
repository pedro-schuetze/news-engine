/**
 * POST /api/media/{story_id}/placement?run={file|latest}
 * { slide_number, placement: "TOP"|"CENTER"|"BOTTOM", align? }
 *
 * Override MANUAL do posicionamento do texto de um slide (proposta do Pedro,
 * 2026-09-02): a análise automática (contraste + veto de rosto) continua
 * sendo a sugestão inicial, mas a palavra final é do editor, num clique no
 * grid topo/meio/base do dashboard.
 *
 * O override é gravado no slide_media do slide E na candidata correspondente
 * do pool — assim a escolha "gruda" na foto: trocar de imagem e voltar não a
 * perde. Trocar para OUTRA imagem usa a análise daquela imagem (cada foto tem
 * a sua). Só JSONs mudam; nenhum byte de imagem é regravado.
 */

import { NextResponse, after } from "next/server";
import { loadRun } from "@/lib/data";
import { findStory, persistMedia } from "@/lib/media/persist";
import { prerenderSlides } from "@/lib/slides/prerender";
import { slideVersion } from "@/lib/slides/version";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLACEMENTS = new Set(["TOP", "CENTER", "BOTTOM"]);
const ALIGNS = new Set(["left", "center", "right"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ story: string }> },
) {
  const tStart = Date.now();
  const { story: storyId } = await params;
  const runFile = new URL(request.url).searchParams.get("run") ?? "latest";
  if (!/^[\w-]+$/.test(storyId)) {
    return NextResponse.json({ error: "story_id inválido" }, { status: 400 });
  }

  let body: { slide_number?: number; placement?: string; align?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const slideNumber = Number(body.slide_number);
  const placement = String(body.placement ?? "").toUpperCase();
  const align = body.align ? String(body.align).toLowerCase() : null;
  if (!Number.isInteger(slideNumber) || slideNumber < 1 || !PLACEMENTS.has(placement)) {
    return NextResponse.json(
      { error: "campos obrigatórios: slide_number (1..N), placement (TOP|CENTER|BOTTOM)" },
      { status: 400 },
    );
  }
  if (align && !ALIGNS.has(align)) {
    return NextResponse.json({ error: "align inválido (left|center|right)" }, { status: 400 });
  }

  const run = await loadRun(runFile);
  const loadMs = Date.now() - tStart;
  if (!run) return NextResponse.json({ error: "run não encontrado" }, { status: 404 });
  const story = findStory(run, storyId);
  if (!story?.draft?.slides?.length) {
    return NextResponse.json({ error: "story sem carrossel" }, { status: 400 });
  }

  const asset = (story.slide_media ?? []).find((m) => m.slide_number === slideNumber);
  if (!asset) {
    return NextResponse.json(
      { error: `slide ${slideNumber} ainda não tem imagem — escolha a foto antes de posicionar o texto` },
      { status: 400 },
    );
  }

  asset.text_placement = placement as "TOP" | "CENTER" | "BOTTOM";
  if (align) asset.text_align = align as "left" | "center" | "right";
  // gruda a escolha na foto: se esta candidata for re-selecionada depois,
  // ela volta já com o override do editor
  const candidate = (story.media_pool ?? []).find((c) => c.local_path === asset.local_path);
  if (candidate) {
    candidate.text_placement = asset.text_placement;
    if (align) candidate.text_align = asset.text_align;
  }

  try {
    // resposta IMEDIATA: o render (25-30s de satori em producao, medido em
    // 2026-09-03) roda no after; o dashboard polla ?waitless= ate o PNG
    // existir no bucket e so entao troca o preview. O commit tambem e async.
    const v = slideVersion(story, slideNumber);
    after(async () => {
      try {
        await prerenderSlides(story, [slideNumber]);
        await persistMedia(
          [],
          run,
          runFile,
          `media: texto do slide ${slideNumber} de ${storyId.slice(0, 8)} -> ${placement}`,
        );
      } catch (e) {
        console.error(`[placement] pós-processo falhou: ${String(e).slice(0, 200)}`);
      }
    });
    return NextResponse.json({
      ok: true,
      slide_number: slideNumber,
      placement: asset.text_placement,
      align: asset.text_align,
      v,
      persist: "async",
      render: "async",
      t: { load_ms: loadMs, total_ms: Date.now() - tStart },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
