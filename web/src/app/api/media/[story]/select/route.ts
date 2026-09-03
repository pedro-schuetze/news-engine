/**
 * POST /api/media/{story_id}/select?run={file|latest}
 * { slide_number, candidate_id }
 *
 * Aponta a imagem de UM slide para outra candidata do pool. Nenhum byte novo
 * é gravado — só os JSONs do run mudam.
 */

import { NextResponse, after } from "next/server";
import { loadRun } from "@/lib/data";
import { applySelection, findStory, persistMedia } from "@/lib/media/persist";
import { prerenderSlides } from "@/lib/slides/prerender";
import { slideVersion } from "@/lib/slides/version";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ story: string }> },
) {
  const { story: storyId } = await params;
  const runFile = new URL(request.url).searchParams.get("run") ?? "latest";
  if (!/^[\w-]+$/.test(storyId)) {
    return NextResponse.json({ error: "story_id inválido" }, { status: 400 });
  }

  let body: { slide_number?: number; candidate_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const slideNumber = Number(body.slide_number);
  const candidateId = String(body.candidate_id ?? "");
  if (!Number.isInteger(slideNumber) || slideNumber < 1 || !candidateId) {
    return NextResponse.json(
      { error: "campos obrigatórios: slide_number (1..N), candidate_id" },
      { status: 400 },
    );
  }

  const run = await loadRun(runFile);
  if (!run) return NextResponse.json({ error: "run não encontrado" }, { status: 404 });
  const story = findStory(run, storyId);
  if (!story?.draft?.slides?.length) {
    return NextResponse.json({ error: "story sem carrossel" }, { status: 400 });
  }
  if (!story.draft.slides.some((s) => s.slide_number === slideNumber)) {
    return NextResponse.json({ error: `slide ${slideNumber} não existe neste post` }, { status: 400 });
  }
  const candidate = (story.media_pool ?? []).find((c) => c.id === candidateId);
  if (!candidate) {
    return NextResponse.json({ error: "candidata não encontrada no pool" }, { status: 404 });
  }

  try {
    applySelection(story, slideNumber, candidate);
    // ordem invertida (2026-09-03): o front só precisa do RENDER novo para
    // atualizar o preview — então renderizamos antes de responder e deixamos
    // o commit (2-4s de GitHub API) para depois da resposta. O clique cai de
    // ~4-6s + render ao vivo para ~2-3s + hit no bucket.
    await prerenderSlides(story, [slideNumber]);
    const v = slideVersion(story, slideNumber);
    after(async () => {
      try {
        await persistMedia(
          [],
          run,
          runFile,
          `media: slide ${slideNumber} de ${storyId.slice(0, 8)} -> ${candidateId}`,
        );
      } catch (e) {
        console.error(`[select] persistência falhou: ${String(e).slice(0, 200)}`);
      }
    });
    return NextResponse.json({
      ok: true,
      slide_number: slideNumber,
      candidate_id: candidateId,
      v,
      persist: "async",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
