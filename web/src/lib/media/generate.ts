/**
 * Imagens de um post, SOB DEMANDA (botão no dashboard).
 *
 * Decisão de 2026-09-01: o run automático produz só texto; imagens saem
 * quando o Pedro escolhe um post. Decisão de 2026-09-02: a geração por IA
 * via API foi REMOVIDA ("não deu certo e ficou bem ruim") — os caminhos são:
 *   1. banco com licença limpa (Wikimedia/Openverse), uma foto DIFERENTE por
 *      slide, sem repetir dentro do post;
 *   2. imagens geradas fora (ChatGPT + skill news-engine-carousel) e subidas
 *      pelo upload — que passa pela mesma análise de contraste.
 * Slide sem foto de banco fica sem imagem até o upload (o renderer usa o
 * fundo gráfico na prévia).
 */

import jpeg from "jpeg-js";
import { searchBankImages } from "../images";
import type { Story } from "../types";

export type TextPlacement = "TOP" | "CENTER" | "BOTTOM";

export interface GeneratedAsset {
  slide_number: number;
  bytes: Buffer;
  mime_type: string;
  credit: string;
  source: "wikimedia" | "openverse" | "ai";
  text_placement: TextPlacement;
  text_align: "left" | "center" | "right";
  prompt: string;
  estimated_cost_usd: number | null;
}

export function analyzePlacement(
  jpegBytes: Buffer,
): { placement: TextPlacement; align: "left" | "center" | "right" } {
  try {
    const img = jpeg.decode(jpegBytes, { useTArray: true, formatAsRGBA: true });
    const { width, height, data } = img;

    const stats = (x0: number, y0: number, x1: number, y1: number) => {
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      const step = 4 * 3; // amostra 1 de cada 3 pixels: rápido e suficiente
      for (let y = y0; y < y1; y += 3) {
        for (let x = x0; x < x1; x += 3) {
          const i = (y * width + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          sum += lum;
          sumSq += lum * lum;
          n++;
        }
      }
      void step;
      if (n === 0) return 255;
      const mean = sum / n;
      const variance = Math.max(0, sumSq / n - mean * mean);
      return mean + 0.6 * Math.sqrt(variance);
    };

    const third = Math.floor(height / 3);
    const bands: Record<TextPlacement, number> = {
      TOP: stats(0, 0, width, third),
      CENTER: stats(0, third, width, 2 * third),
      BOTTOM: stats(0, 2 * third, width, height),
    };
    const placement = (Object.keys(bands) as TextPlacement[]).reduce((a, b) =>
      bands[a] <= bands[b] ? a : b,
    );

    const yTop = placement === "TOP" ? 0 : placement === "CENTER" ? third : 2 * third;
    const yBottom = yTop + third;
    const w3 = Math.floor(width / 3);
    const cols = {
      left: stats(0, yTop, w3, yBottom),
      center: stats(w3, yTop, 2 * w3, yBottom),
      right: stats(2 * w3, yTop, width, yBottom),
    };
    const best = (Object.keys(cols) as ("left" | "center" | "right")[]).reduce((a, b) =>
      cols[a] <= cols[b] ? a : b,
    );
    // só desloca quando o ganho é claro; senão mantém centralizado
    const align = cols[best] < cols.center - 12 ? best : "center";
    return { placement, align };
  } catch {
    return { placement: "BOTTOM", align: "center" };
  }
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "news-engine/0.3 (+https://github.com/pedro-schuetze/news-engine)" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // teto de 1,5MB por imagem: o repositório guarda estes arquivos
    return buf.length > 1_500_000 ? null : buf;
  } catch {
    return null;
  }
}

/**
 * Busca as imagens do post no banco (uma foto distinta por slide) e devolve
 * o que encontrou. Slides sem correspondente relevante ficam de fora — o
 * editor completa pelo upload (ChatGPT).
 */
export async function generateStoryImages(story: Story): Promise<GeneratedAsset[]> {
  const slides = story.draft?.slides ?? [];
  if (slides.length === 0) return [];

  // uma busca para todo o post: as fotos relevantes são distribuídas, uma
  // por slide, sem repetir (foi assim que o post do Tupac ficou bom)
  const banked = await searchBankImages(story.title, slides.length);

  const jobs = slides.map(async (slide, i): Promise<GeneratedAsset | null> => {
    const fromBank = banked[i];
    if (!fromBank) return null;
    const bytes = await fetchBytes(fromBank.url);
    if (!bytes) return null;
    const { placement, align } = analyzePlacement(bytes);
    return {
      slide_number: slide.slide_number || i + 1,
      bytes,
      mime_type: fromBank.url.toLowerCase().includes(".png") ? "image/png" : "image/jpeg",
      credit: fromBank.credit,
      source: fromBank.source === "ai" ? "ai" : fromBank.source,
      text_placement: placement,
      text_align: align,
      prompt: "",
      estimated_cost_usd: null,
    };
  });

  const results = await Promise.all(jobs);
  return results.filter((r): r is GeneratedAsset => r !== null);
}
