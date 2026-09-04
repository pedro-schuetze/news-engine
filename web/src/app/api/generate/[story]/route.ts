/**
 * POST /api/generate/{story_id}?run={file|latest}
 *
 * Gera o PACOTE COMPLETO de um post que só tem o brief (manchete+resumo do
 * run automático): slides com direções de imagem, caption, hashtags — no
 * modelo bom (COMPOSE_MODEL, gpt-5.6-sol). Decisão de custo do Pedro
 * (2026-09-03): o run diário escreve só a triagem; o conteúdo caro é gerado
 * sob demanda, apenas para os posts que ele escolhe trabalhar.
 *
 * A gravação recarrega o run FRESCO e aplica só o draft desta story
 * (proteção contra lost-update, decisão 23).
 */

import { NextResponse } from "next/server";
import { loadRun } from "@/lib/data";
import { generateDraft, sourcesFromStory } from "@/lib/compose/draft";
import { persistRun } from "@/lib/compose/persistRun";
import { findStory } from "@/lib/media/persist";

export const dynamic = "force-dynamic";
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
  const story = run ? findStory(run, storyId) : null;
  if (!run || !story) {
    return NextResponse.json({ error: "post não encontrado neste run" }, { status: 404 });
  }

  try {
    const { draft, usage, model } = await generateDraft({
      storyId,
      title: story.title,
      vertical: story.vertical,
      sources: sourcesFromStory(story),
      contentType: story.content_type ?? "FACT",
      verificationSummary: `${story.verification.status}; ${story.verification.independent_source_count} fonte(s) independente(s)`,
    });

    // preserva a manchete/resumo do brief? Não: o pacote completo reescreve
    // tudo em um só fôlego (coerência manchete-slides-caption).
    const fresh = await loadRun(runFile);
    const freshStory = fresh ? findStory(fresh, storyId) : null;
    if (!fresh || !freshStory) {
      return NextResponse.json({ error: "run mudou durante a geração" }, { status: 409 });
    }
    freshStory.draft = draft;
    await persistRun(fresh, runFile, `content: pacote completo de ${storyId.slice(0, 8)} (${model})`);

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      headline: draft.instagram_headline,
      slides: draft.slides.length,
      model,
      usage,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
