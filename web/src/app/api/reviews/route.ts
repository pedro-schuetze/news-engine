import { NextResponse } from "next/server";
import { findRunFile, loadReviews, loadRun, saveReview } from "@/lib/data";
import type { Review, ReviewStatus, Story } from "@/lib/types";

/**
 * Gate de aprovação (2026-09-02): um post só pode ser APPROVED com uma imagem
 * por slide — aprovado significa "pronto para exportar do Prontos". Se o run
 * não for encontrado (fora da janela do histórico), a aprovação passa: o gate
 * é guarda de fluxo, não segurança.
 */
async function imagesComplete(runId: string, storyId: string): Promise<boolean | null> {
  const file = await findRunFile(runId);
  if (!file) return null;
  const run = await loadRun(file);
  if (!run) return null;
  let story: Story | null = null;
  for (const vr of Object.values(run.verticals)) {
    for (const s of vr.stories) if (s.story_id === storyId) story = s;
  }
  if (!story?.draft) return null;
  // brief sem conteúdo gerado: bloqueia (não é fail-open — o post nem tem slides)
  if (!story.draft.slides?.length) return false;
  const covered = new Set((story.slide_media ?? []).map((m) => m.slide_number)).size;
  return covered >= story.draft.slides.length;
}

const VALID_STATUS: ReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export async function GET() {
  return NextResponse.json(await loadReviews());
}

export async function POST(request: Request) {
  let body: Partial<Review>;
  try {
    body = (await request.json()) as Partial<Review>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const status = body.review_status as ReviewStatus;
  if (!body.story_id || !VALID_STATUS.includes(status)) {
    return NextResponse.json(
      { error: "campos obrigatórios: story_id, review_status (PENDING|APPROVED|REJECTED)" },
      { status: 400 },
    );
  }

  const review: Review = {
    story_id: body.story_id,
    run_id: body.run_id ?? "",
    vertical: body.vertical ?? "",
    review_status: status,
    reviewed_at: status === "PENDING" ? null : new Date().toISOString(),
    review_notes: body.review_notes ?? "",
  };

  if (status === "APPROVED" && review.run_id) {
    const complete = await imagesComplete(review.run_id, review.story_id);
    if (complete === false) {
      return NextResponse.json(
        { error: "post ainda sem conteúdo/imagens completos — gere o conteúdo e as imagens antes de aprovar" },
        { status: 409 },
      );
    }
  }

  try {
    await saveReview(review);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
  return NextResponse.json(review);
}
