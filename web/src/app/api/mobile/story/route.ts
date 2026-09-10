/**
 * GET /api/mobile/story?run=<file|latest>&id=<story_id> — o post completo
 * para o editor do app: slides, pool de candidatas (com URL de imagem
 * resolvida), seleção atual e legenda. Mesmo modelo do editor web
 * (StoryCard→PostMedia), só que já resolvido do lado do servidor.
 */
import { NextResponse } from "next/server";
import { loadPromptOverrides, loadRun, loadReviews } from "@/lib/data";
import { buildImagePrompt } from "@/lib/media/prompt";
import { findStory } from "@/lib/media/persist";
import { slideVersion } from "@/lib/slides/version";

export const dynamic = "force-dynamic";

const SUB_BRANDS: Record<string, string> = {
  politics: "WORLD",
  entertainment: "ENTERTAINMENT",
  facts: "CURIOSITY",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runFile = url.searchParams.get("run") ?? "latest";
  const storyId = url.searchParams.get("id") ?? "";
  if (!/^[\w-]+$/.test(storyId)) {
    return NextResponse.json({ error: "story_id inválido" }, { status: 400 });
  }
  const [run, reviews, overrides] = await Promise.all([
    loadRun(runFile),
    loadReviews(),
    loadPromptOverrides().catch(() => ({ text: "", image: "" })),
  ]);
  const story = run ? findStory(run, storyId) : null;
  if (!run || !story) {
    return NextResponse.json({ error: "post não encontrado" }, { status: 404 });
  }

  const publicBase = (process.env.R2_PUBLIC_URL ?? "").trim().replace(/\/$/, "");
  const imageUrl = (localPath: string, id: string) =>
    publicBase
      ? `${publicBase}/${localPath.split("/").map(encodeURIComponent).join("/")}`
      : `/api/media/${storyId}/candidate/${id}?run=${encodeURIComponent(runFile)}`;

  const pool = (story.media_pool ?? []).map((c) => ({
    id: c.id,
    url: imageUrl(c.local_path, c.id),
    origin: c.origin,
    source: c.source,
    credit: c.credit,
    placement: c.text_placement,
    align: c.text_align,
    score: c.score,
    width: c.width ?? null,
    height: c.height ?? null,
    focus_x: c.focus_x ?? null,
    focus_y: c.focus_y ?? null,
    generated_for_slide: c.generated_for_slide ?? null,
  }));

  const byPath = new Map((story.media_pool ?? []).map((c) => [c.local_path, c.id]));
  const selection = (story.slide_media ?? []).map((m) => ({
    slide_number: m.slide_number,
    candidate_id: byPath.get(m.local_path) ?? null,
    placement: m.text_placement,
    align: m.text_align,
  }));

  const slides = story.draft?.slides ?? [];
  const review = reviews[story.story_id];
  return NextResponse.json({
    story_id: story.story_id,
    run_file: runFile,
    run_id: story.run_id,
    vertical: story.vertical,
    sub_brand: SUB_BRANDS[story.vertical] ?? story.vertical.toUpperCase(),
    title: story.title,
    status:
      review?.review_status === "PUBLISHED"
        ? "published"
        : review?.review_status === "APPROVED"
          ? "approved"
          : "draft",
    summary: story.draft?.short_summary ?? "",
    headline: story.draft?.instagram_headline ?? "",
    caption: story.draft?.caption ?? "",
    hashtags: story.draft?.hashtags ?? [],
    page_count: slides.length,
    slides: slides.map((s, i) => ({
      slide_number: s.slide_number,
      kind: i === 0 ? "cover" : i === slides.length - 1 ? "final" : "body",
      headline: i === 0 ? (story.draft?.instagram_headline ?? s.headline) : s.headline,
      body: s.body,
      render_url: `/api/slide/${story.story_id}/${s.slide_number}?run=${encodeURIComponent(runFile)}&v=${slideVersion(story, s.slide_number)}`,
      // prompt pronto para gerar a imagem num GPT externo e importar depois
      image_prompt: buildImagePrompt({
        title: story.title,
        vertical: story.vertical,
        instagramHeadline: story.draft?.instagram_headline ?? "",
        shortSummary: story.draft?.short_summary ?? "",
        isRumorOrClaim: story.is_rumor_or_claim,
        slideNumber: s.slide_number,
        slideCount: slides.length,
        role: s.role,
        headline: s.headline,
        body: s.body,
        imageDirection: s.image_direction,
        custom: overrides.image,
      }),
    })),
    pool,
    selection,
  });
}
