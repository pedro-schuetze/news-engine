/**
 * SlideSpec: a ponte entre o EditorialDraft (pipeline) e o renderer visual.
 * Mapeia o draft existente para os 3 layouts (capa / interno / fecho) e
 * anexa imagens com licença limpa + crédito (lib/images).
 */

import type { Story } from "../types";
import { imagesForStory, type SourcedImage } from "../images";
import { loadMedia } from "../data";

export type SlideKind = "cover" | "body" | "final";

export type TextPlacement = "TOP" | "CENTER" | "BOTTOM";

export interface SlideSpec {
  kind: SlideKind;
  vertical: string;
  pageIndex: number; // 1-based
  pageCount: number;
  headline: string; // capa: manchete; internos: kicker curto
  body: string; // capa: subtítulo; internos: corpo (com **negrito**)
  image: SourcedImage | null;
  credit: string;
  /** onde o texto tem mais contraste nesta imagem (análise do pipeline) */
  placement: TextPlacement;
  align: "left" | "center" | "right";
}

export async function buildSlideSpecs(story: Story): Promise<SlideSpec[]> {
  const draft = story.draft;
  const slides = draft?.slides ?? [];
  const count = Math.max(slides.length, 1);

  // 1º) ilustração PRÉ-GERADA pelo pipeline (dashboard instantâneo, custo
  // travado, e vem com a análise de contraste para posicionar o texto).
  // 2º) fotos do banco com relevância comprovada. 3º) geração na hora.
  let placement: TextPlacement = "BOTTOM";
  let align: "left" | "center" | "right" = "center";
  let images: SourcedImage[] = [];

  if (story.media?.local_path) {
    const rel = story.media.local_path.split("\\").join("/");
    const dataUrl = await loadMedia(rel);
    if (!dataUrl) {
      console.warn(`[slides] ilustração pré-gerada não encontrada: ${rel}`);
    }
    if (dataUrl) {
      images = [
        {
          url: dataUrl,
          credit: story.media.provenance?.attribution_text || "ILUSTRAÇÃO GERADA POR IA",
          source: "ai",
        },
      ];
      placement = story.media.text_placement ?? "BOTTOM";
      align = story.media.text_align ?? "center";
      console.info(`[slides] usando ilustração pré-gerada (${placement}/${align}): ${rel}`);
    }
  }
  if (images.length === 0) {
    images = await imagesForStory(story.title, story.vertical, Math.min(count, 5));
  }
  const pick = (i: number): SourcedImage | null =>
    images.length === 0 ? null : images[i % images.length];

  const specs: SlideSpec[] = [];
  for (let i = 0; i < count; i++) {
    const slide = slides[i];
    const isFirst = i === 0;
    const isLast = i === count - 1;
    const image = pick(i);
    specs.push({
      kind: isFirst ? "cover" : isLast ? "final" : "body",
      vertical: story.vertical,
      pageIndex: i + 1,
      pageCount: count,
      headline: isFirst
        ? (draft?.instagram_headline || story.title)
        : (slide?.headline ?? ""),
      body: isFirst ? (slide?.body ?? draft?.short_summary ?? "") : (slide?.body ?? ""),
      image,
      credit: image ? `FOTO: ${image.credit}` : "",
      placement,
      align,
    });
  }
  return specs;
}
