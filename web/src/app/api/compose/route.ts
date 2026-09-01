/**
 * POST /api/compose  { urls: string[], instruction?, vertical? }
 * Gera um post a partir de link(s) e salva como run manual.
 *
 * DELETE /api/compose?run=manual_....json
 * Descarta o run manual (o editor recusou o resultado).
 */

import { NextResponse } from "next/server";
import { composeFromUrls } from "@/lib/compose/fromUrl";
import { deleteManualRun, persistRun } from "@/lib/compose/persistRun";
import { loadVerticalConfigs } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { urls?: unknown; instruction?: string; vertical?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const urls = (Array.isArray(body.urls) ? body.urls : [])
    .map((u) => String(u).trim())
    .filter(Boolean);
  if (urls.length === 0) {
    return NextResponse.json({ error: "informe pelo menos um link" }, { status: 400 });
  }

  let vertical = (body.vertical ?? "").trim().toLowerCase();
  if (vertical) {
    const known = await loadVerticalConfigs();
    if (!known.some((v) => v.id === vertical)) vertical = "";
  }

  try {
    const { run, runFile, story, problems } = await composeFromUrls({
      urls,
      instruction: (body.instruction ?? "").trim() || undefined,
      vertical: vertical || undefined,
    });
    await persistRun(run, runFile, `compose: post manual ${story.story_id}`);
    return NextResponse.json({
      ok: true,
      story_id: story.story_id,
      run_file: runFile,
      vertical: story.vertical,
      headline: story.draft?.instagram_headline ?? "",
      sources: story.article_count,
      problems,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).replace(/^Error:\s*/, "").slice(0, 300) }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const runFile = new URL(request.url).searchParams.get("run") ?? "";
  try {
    await deleteManualRun(runFile);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 400 });
  }
}
