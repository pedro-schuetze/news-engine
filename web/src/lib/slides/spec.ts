/**
 * SlideSpec: a ponte entre o EditorialDraft (pipeline) e o renderer visual.
 * Mapeia o draft existente para os 3 layouts (capa / interno / fecho) e
 * anexa imagens com licença limpa + crédito (lib/images).
 */

import type { Story } from "../types";
import { imagesForStory, type SourcedImage } from "../images";

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

  // UMA imagem por story, repetida nos slides (tratamento visual varia por
  // tipo). Motivos: (a) buscas por slide traziam a pessoa errada; (b) o
  // carrossel fica coerente, como um post só; (c) com IA, 1 imagem por post
  // em vez de 5 — custo cinco vezes menor.
  const images = await imagesForStory(story.title, story.vertical, 1);
  const hero: SourcedImage | null = images[0] ?? null;
  const pick = (): SourcedImage | null => hero;

  const specs: SlideSpec[] = [];
  for (let i = 0; i < count; i++) {
    const slide = slides[i];
    const isFirst = i === 0;
    const isLast = i === count - 1;
    const image = pick();
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
