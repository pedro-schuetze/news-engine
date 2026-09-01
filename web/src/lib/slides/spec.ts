/**
 * SlideSpec: a ponte entre o EditorialDraft (pipeline) e o renderer visual.
 * Mapeia o draft existente para os 3 layouts (capa / interno / fecho) e
 * anexa imagens com licença limpa + crédito (lib/images).
 */

import type { Story } from "../types";
import { findImagesCascade, type SourcedImage } from "../images";

export type SlideKind = "cover" | "body" | "final";

export interface SlideSpec {
  kind: SlideKind;
  vertical: string;
  pageIndex: number; // 1-based
  pageCount: number;
  headline: string; // capa: manchete; internos: kicker curto
  body: string; // capa: subtítulo; internos: corpo (com **negrito**)
  image: SourcedImage | null;
  credit: string;
}

export async function buildSlideSpecs(story: Story): Promise<SlideSpec[]> {
  const draft = story.draft;
  const slides = draft?.slides ?? [];
  const count = Math.max(slides.length, 1);

  const images = await findImagesCascade(story.title, story.vertical, Math.min(count + 1, 6));
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
    });
  }
  return specs;
}
