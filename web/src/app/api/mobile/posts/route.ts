/**
 * GET /api/mobile/posts — posts recentes com estado, para a aba Posts do app.
 * Junta stories dos últimos runs com as reviews; devolve o mínimo que a
 * lista precisa (capa renderizada quando houver, estado, contagens).
 */
import { NextResponse } from "next/server";
import { loadAllStories, loadReviews } from "@/lib/data";
import { loadIgSync } from "@/lib/instagram";
import { slideVersion } from "@/lib/slides/version";

export const dynamic = "force-dynamic";

export async function GET() {
  const [entries, reviews, ig] = await Promise.all([
    loadAllStories(20),
    loadReviews(),
    loadIgSync().catch(() => null),
  ]);
  const posts = entries
    .filter((e) => e.story.draft)
    .slice(0, 60)
    .map(({ story, runFile, runStartedAt }) => {
      const review = reviews[story.story_id];
      const slides = story.draft?.slides ?? [];
      const covered = new Set((story.slide_media ?? []).map((m) => m.slide_number));
      const status =
        review?.review_status === "PUBLISHED"
          ? "published"
          : review?.review_status === "APPROVED"
            ? "approved"
            : review?.review_status === "REJECTED"
              ? "rejected"
              : "draft";
      return {
        story_id: story.story_id,
        run_file: runFile,
        vertical: story.vertical,
        title: story.draft?.instagram_headline || story.title,
        status,
        slide_count: slides.length,
        images_done: slides.length > 0 && slides.every((s) => covered.has(s.slide_number)),
        has_content: slides.length > 0,
        cover_url:
          slides.length && covered.has(slides[0]?.slide_number ?? 1)
            ? `/api/slide/${story.story_id}/${slides[0].slide_number}?run=${encodeURIComponent(runFile)}&v=${slideVersion(story, slides[0].slide_number)}`
            : null,
        created_at: story.created_at ?? runStartedAt,
        // publicados carregam os slides completos (feed) + métricas do IG
        slides:
          status === "published"
            ? slides
                .filter((s) => covered.has(s.slide_number))
                .map((s) => ({
                  n: s.slide_number,
                  url: `/api/slide/${story.story_id}/${s.slide_number}?run=${encodeURIComponent(runFile)}&v=${slideVersion(story, s.slide_number)}`,
                }))
            : undefined,
        ig: ig?.posts[story.story_id]
          ? {
              likes: ig.posts[story.story_id].likes,
              comments: ig.posts[story.story_id].comments,
              permalink: ig.posts[story.story_id].permalink,
            }
          : undefined,
      };
    });
  return NextResponse.json({ posts });
}
