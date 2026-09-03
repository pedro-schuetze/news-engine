/**
 * SlideSpec: a ponte entre o EditorialDraft (pipeline) e o renderer visual.
 * Mapeia o draft para os 3 layouts (capa / interno / fecho) e anexa a imagem
 * JÁ GERADA daquele slide (lib/media/generate cuida da geração sob demanda).
 */

import type { Story } from "../types";
import type { SourcedImage } from "../images";
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
  /** corte por conteúdo: ponto focal e dimensões reais da imagem */
  focus: { x: number; y: number } | null;
  imageSize: { w: number; h: number } | null;
}

/**
 * `only`: numeros de slide cujas IMAGENS devem ser carregadas (os demais specs
 * saem com image null). O prerender de UM slide nao precisa baixar as fotos
 * dos outros quatro — era ~metade do tempo do clique em producao.
 */
export async function buildSlideSpecs(story: Story, only?: number[]): Promise<SlideSpec[]> {
  const draft = story.draft;
  const slides = draft?.slides ?? [];
  const count = Math.max(slides.length, 1);
  const wanted = only?.length ? new Set(only) : null;

  // Imagens ficam prontas quando o Pedro clica em "gerar imagens" (uma por
  // slide, cenas diferentes). Sem elas, o slide usa o fundo gráfico da marca —
  // o renderer NUNCA gera imagem na hora, para a prévia abrir instantânea.
  const bySlide = new Map<number, NonNullable<Story["slide_media"]>[number]>();
  for (const asset of story.slide_media ?? []) {
    if (asset?.local_path) bySlide.set(asset.slide_number, asset);
  }

  const mediaCache = new Map<string, string | null>();
  async function imageFor(slideNumber: number): Promise<{
    image: SourcedImage | null;
    placement: TextPlacement;
    align: "left" | "center" | "right";
    focus: { x: number; y: number } | null;
    imageSize: { w: number; h: number } | null;
  }> {
    const asset = bySlide.get(slideNumber);
    if (!asset)
      return { image: null, placement: "BOTTOM", align: "center", focus: null, imageSize: null };
    const rel = asset.local_path.split("\\").join("/");
    if (!mediaCache.has(rel)) mediaCache.set(rel, await loadMedia(rel));
    const dataUrl = mediaCache.get(rel) ?? null;
    if (!dataUrl) {
      console.warn(`[slides] imagem do slide ${slideNumber} não encontrada: ${rel}`);
      return { image: null, placement: "BOTTOM", align: "center", focus: null, imageSize: null };
    }
    return {
      image: {
        url: dataUrl,
        credit: asset.provenance?.attribution_text || "",
        source: asset.provenance?.source_type === "GENERATED" ? "ai" : "wikimedia",
      },
      placement: asset.text_placement ?? "BOTTOM",
      align: asset.text_align ?? "center",
      focus:
        typeof asset.focus_x === "number" && typeof asset.focus_y === "number"
          ? { x: asset.focus_x, y: asset.focus_y }
          : null,
      imageSize: asset.width && asset.height ? { w: asset.width, h: asset.height } : null,
    };
  }

  // pre-carrega as midias em PARALELO (era sequencial: 5 x latencia do R2)
  await Promise.all(
    Array.from({ length: count }, (_, i) => {
      const n = slides[i]?.slide_number || i + 1;
      if (wanted && !wanted.has(n)) return null;
      const asset = bySlide.get(n);
      if (!asset?.local_path) return null;
      const rel = asset.local_path.split("\\").join("/");
      if (mediaCache.has(rel)) return null;
      return loadMedia(rel).then((d) => void mediaCache.set(rel, d));
    }),
  );

  const specs: SlideSpec[] = [];
  for (let i = 0; i < count; i++) {
    const slide = slides[i];
    const isFirst = i === 0;
    const isLast = i === count - 1;
    const n = slide?.slide_number || i + 1;
    const skipImage = wanted !== null && !wanted.has(n);
    const { image, placement, align, focus, imageSize } = skipImage
      ? {
          image: null,
          placement: "BOTTOM" as TextPlacement,
          align: "center" as const,
          focus: null,
          imageSize: null,
        }
      : await imageFor(n);
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
      focus,
      imageSize,
    });
  }
  return specs;
}
