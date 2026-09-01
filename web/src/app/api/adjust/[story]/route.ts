/**
 * POST /api/adjust/{story_id}?run={file|latest}
 * body: { instruction: string, learn?: boolean }
 *
 * Reescreve o texto do post seguindo um direcionamento curto do editor. As
 * imagens já geradas são preservadas (decisão do Pedro: texto e imagem se
 * ajustam em passos separados, para não queimar geração).
 *
 * Com learn=true, o direcionamento também passa a valer para os próximos
 * posts daquela vertical (data/learned.json, lido pelo pipeline e por aqui).
 */

import { NextResponse } from "next/server";
import { addLearnedDirective, loadRun } from "@/lib/data";
import { generateDraft, sourcesFromStory } from "@/lib/compose/draft";
import { persistRun } from "@/lib/compose/persistRun";
import type { Story } from "@/lib/types";

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

  let body: { instruction?: string; learn?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const instruction = (body.instruction ?? "").trim();
  if (instruction.length < 4) {
    return NextResponse.json({ error: "escreva o ajuste desejado" }, { status: 400 });
  }
  if (instruction.length > 600) {
    return NextResponse.json({ error: "ajuste muito longo (máx. 600 caracteres)" }, { status: 400 });
  }

  const run = await loadRun(runFile);
  let story: Story | null = null;
  for (const vr of Object.values(run?.verticals ?? {})) {
    for (const s of vr.stories) if (s.story_id === storyId) story = s;
  }
  if (!run || !story) {
    return NextResponse.json({ error: "post não encontrado neste run" }, { status: 404 });
  }

  try {
    const { draft, usage } = await generateDraft({
      storyId,
      title: story.title,
      vertical: story.vertical,
      sources: sourcesFromStory(story),
      contentType: story.content_type ?? undefined,
      verificationSummary: `${story.verification.status}; ${story.verification.independent_source_count} fonte(s) independente(s)`,
      instruction,
      currentDraft: story.draft,
    });

    story.draft = draft; // slide_media é preservado de propósito
    await persistRun(run, runFile, `adjust: ${storyId.slice(0, 8)} — ${instruction.slice(0, 60)}`);

    if (body.learn) {
      await addLearnedDirective(story.vertical, instruction);
    }

    return NextResponse.json({
      ok: true,
      learned: Boolean(body.learn),
      headline: draft.instagram_headline,
      tokens: usage,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 502 });
  }
}
