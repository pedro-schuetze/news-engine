/**
 * GET /api/slide/{story_id}/{n}?run={file|latest}
 * Renderiza o slide N (1-based) da story como PNG 1080x1350.
 *
 * É o mesmo renderer que a fase 3 usará para publicar no Instagram
 * (a Graph API aceita URLs públicas de imagem — estas).
 */

import { NextResponse, after } from "next/server";
import { loadRun } from "@/lib/data";
import { getPrerendered, putPrerendered } from "@/lib/slides/prerender";
import { buildSlideSpecs } from "@/lib/slides/spec";
import { renderSlide } from "@/lib/slides/render";
import type { Story } from "@/lib/types";

export const dynamic = "force-dynamic";

function findStory(run: Awaited<ReturnType<typeof loadRun>>, storyId: string): Story | null {
  if (!run) return null;
  for (const vr of Object.values(run.verticals)) {
    for (const story of vr.stories) {
      if (story.story_id === storyId) return story;
    }
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ story: string; n: string }> },
) {
  const { story: storyId, n: nRaw } = await params;
  const runFile = new URL(request.url).searchParams.get("run") ?? "latest";

  const n = Number.parseInt(nRaw, 10);
  const v = new URL(request.url).searchParams.get("v");
  const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";

  // read-through: com URL versionada, o PNG pronto vem do R2 sem satori
  if (v && Number.isFinite(n) && n >= 1) {
    const ready = await getPrerendered(storyId, n, v);
    if (ready) {
      return new NextResponse(new Uint8Array(ready), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": IMMUTABLE,
          "x-slide-source": "r2",
        },
      });
    }
  }

  const run = await loadRun(runFile);
  const story = findStory(run, storyId) ?? findStory(await loadRun("latest"), storyId);
  if (!story) {
    return NextResponse.json({ error: "story não encontrada" }, { status: 404 });
  }

  const specs = await buildSlideSpecs(story);
  if (!Number.isFinite(n) || n < 1 || n > specs.length) {
    return NextResponse.json({ error: `slide fora do intervalo 1..${specs.length}` }, { status: 404 });
  }

  const image = await renderSlide(specs[n - 1]);
  const png = Buffer.from(await image.arrayBuffer());
  // write-through: a próxima visita desta versão sai do bucket
  if (v) after(() => putPrerendered(storyId, n, v, png));
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // sem ?v= mantém o cache curto antigo (URLs não versionadas)
      "Cache-Control": v ? IMMUTABLE : "public, s-maxage=600, stale-while-revalidate=3600",
      "x-slide-source": "live",
    },
  });
}
