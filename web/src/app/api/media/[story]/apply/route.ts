/**
 * POST /api/media/{story_id}/apply?run={file|latest}
 * { changes: [{ slide_number, candidate_id, placement }] }
 *
 * Salva TODAS as decisões da edição de uma vez (2026-09-03, "repense a
 * mecânica" do Pedro): a edição acontece 100% no navegador (preview HTML
 * instantâneo, SlidePreview); nada toca a base até o editor clicar Salvar.
 * Aqui: uma leitura fresca, uma aplicação, uma gravação — e os renders PNG
 * (satori) rodam DEPOIS da resposta, só para export/Prontos.
 *
 * Substitui as rotas select/ e placement/ (removidas).
 */

import { NextResponse, after } from "next/server";
import { loadRun } from "@/lib/data";
import {
  applyFreshAndPersist,
  applySelection,
  findStory,
} from "@/lib/media/persist";
import { prerenderSlides } from "@/lib/slides/prerender";
import type { Story } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PLACEMENTS = new Set(["TOP", "CENTER", "BOTTOM"]);

interface Change {
  slide_number: number;
  candidate_id?: string;
  placement?: string;
}

function applyChanges(story: Story, changes: Change[]): boolean {
  let applied = 0;
  for (const ch of changes) {
    const n = Number(ch.slide_number);
    if (!Number.isInteger(n) || n < 1) continue;
    if (ch.candidate_id) {
      const c = (story.media_pool ?? []).find((x) => x.id === ch.candidate_id);
      if (!c) continue;
      applySelection(story, n, c);
    }
    if (ch.placement && PLACEMENTS.has(ch.placement)) {
      const a = (story.slide_media ?? []).find((m) => m.slide_number === n);
      if (a) {
        a.text_placement = ch.placement as "TOP" | "CENTER" | "BOTTOM";
        const c = (story.media_pool ?? []).find((x) => x.local_path === a.local_path);
        if (c) c.text_placement = a.text_placement;
      }
    }
    applied++;
  }
  return applied > 0;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ story: string }> },
) {
  const { story: storyId } = await params;
  const runFile = new URL(request.url).searchParams.get("run") ?? "latest";
  if (!/^[\w-]+$/.test(storyId)) {
    return NextResponse.json({ error: "story_id inválido" }, { status: 400 });
  }

  let body: { changes?: Change[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const changes = (body.changes ?? []).slice(0, 40);
  if (changes.length === 0) {
    return NextResponse.json({ error: "nenhuma alteração enviada" }, { status: 400 });
  }

  const run = await loadRun(runFile);
  const story = run ? findStory(run, storyId) : null;
  if (!run || !story?.draft?.slides?.length) {
    return NextResponse.json({ error: "post não encontrado neste run" }, { status: 404 });
  }

  try {
    // gravação única, sobre o run fresco (o loadRun acima já é fresco; o
    // applyFreshAndPersist recarrega de novo por segurança contra corridas)
    await applyFreshAndPersist(
      runFile,
      storyId,
      (s) => applyChanges(s, changes),
      `media: ${changes.length} decisões de edição em ${storyId.slice(0, 8)}`,
    );

    // renders PNG (export/Prontos) em segundo plano — a UI não espera por eles
    applyChanges(story, changes);
    const touched = [...new Set(changes.map((c) => Number(c.slide_number)))];
    after(() => prerenderSlides(story, touched));

    return NextResponse.json({ ok: true, saved: changes.length, slides: touched });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
