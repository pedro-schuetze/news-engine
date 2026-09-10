/**
 * POST /api/mobile/headline { run, id, headline } — edita a manchete do post
 * (a capa do carrossel usa instagram_headline). Persistência anti-corrida
 * (applyFreshAndPersist) e re-render dos PNGs em segundo plano; o preview do
 * app é local e muda na hora. Exige a chave (middleware).
 */
import { NextResponse, after } from "next/server";
import { applyFreshAndPersist } from "@/lib/media/persist";
import { loadRun } from "@/lib/data";
import { findStory } from "@/lib/media/persist";
import { prerenderSlides } from "@/lib/slides/prerender";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    run?: string;
    id?: string;
    headline?: string;
  };
  const runFile = body.run ?? "latest";
  const storyId = body.id ?? "";
  const headline = (body.headline ?? "").trim();
  if (!/^[\w-]+$/.test(storyId)) {
    return NextResponse.json({ error: "story_id inválido" }, { status: 400 });
  }
  if (headline.length < 8 || headline.length > 90) {
    return NextResponse.json({ error: "a manchete precisa ter entre 8 e 90 caracteres" }, { status: 400 });
  }
  try {
    await applyFreshAndPersist(
      runFile,
      storyId,
      (s) => {
        if (!s.draft) return false;
        s.draft.instagram_headline = headline;
        return true;
      },
      `edit: manchete de ${storyId.slice(0, 8)}`,
    );
    const run = await loadRun(runFile);
    const story = run ? findStory(run, storyId) : null;
    if (story) after(() => prerenderSlides(story, [story.draft?.slides?.[0]?.slide_number ?? 1]));
    return NextResponse.json({ ok: true, headline });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 250) }, { status: 500 });
  }
}
