/**
 * GET /api/export/{story_id}?run={file|latest}
 * Baixa o post pronto: slides renderizados em JPG + legenda, num .zip.
 *
 * É a saída final do fluxo: o que sai daqui é o que vai para o Instagram.
 */

import { NextResponse } from "next/server";
import { loadRun } from "@/lib/data";
import { buildZip, pngToJpeg, slugify, type ZipEntry } from "@/lib/export/pack";
import { getPrerendered, putPrerendered } from "@/lib/slides/prerender";
import { renderSlide } from "@/lib/slides/render";
import { slideVersion } from "@/lib/slides/version";
import { buildSlideSpecs } from "@/lib/slides/spec";
import type { Story } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ story: string }> },
) {
  const { story: storyId } = await params;
  const runFile = new URL(request.url).searchParams.get("run") ?? "latest";
  if (!/^[\w-]+$/.test(storyId)) {
    return NextResponse.json({ error: "story_id inválido" }, { status: 400 });
  }

  const run = await loadRun(runFile);
  let story: Story | null = null;
  for (const vr of Object.values(run?.verticals ?? {})) {
    for (const s of vr.stories) if (s.story_id === storyId) story = s;
  }
  if (!story?.draft) {
    return NextResponse.json({ error: "post não encontrado neste run" }, { status: 404 });
  }

  const specs = await buildSlideSpecs(story);

  // renderiza e converte os slides em paralelo: em série o pacote levava
  // minutos (cada render custa segundos e a conversão PNG->JPEG também)
  const entries: ZipEntry[] = await Promise.all(
    specs.map(async (spec) => {
      // reusa o PNG pré-renderizado do R2 (fase 3); só renderiza o que faltar
      const v = slideVersion(story, spec.pageIndex);
      let png = await getPrerendered(story.story_id, spec.pageIndex, v);
      if (!png) {
        const image = await renderSlide(spec);
        png = Buffer.from(await image.arrayBuffer());
        await putPrerendered(story.story_id, spec.pageIndex, v, png);
      }
      return {
        name: `slide_${String(spec.pageIndex).padStart(2, "0")}.jpg`,
        data: pngToJpeg(png),
      };
    }),
  );

  const draft = story.draft;
  const legenda = [
    draft.caption,
    "",
    draft.hashtags.join(" "),
    "",
    "---",
    `Manchete: ${draft.instagram_headline}`,
    `Story: ${story.title}`,
    `Verificação: ${story.verification.status} · ${story.verification.independent_source_count} fonte(s) independente(s)`,
    "",
    "Fontes:",
    ...[story.verification.primary_source, ...story.verification.supporting_sources]
      .filter((s) => s)
      .map((s) => `- ${s!.name}: ${s!.url}`),
  ].join("\n");
  entries.push({ name: "legenda.txt", data: Buffer.from(legenda, "utf-8") });

  const zip = buildZip(entries);
  const name = `${slugify(draft.instagram_headline || story.title)}.zip`;
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
