/**
 * Geração das imagens de um post, SOB DEMANDA (botão no dashboard).
 *
 * Decisão de 2026-09-01: o run automático produz só texto. As imagens saem
 * quando o Pedro escolhe um post, para (a) não gastar geração em post que
 * será rejeitado e (b) permitir cuidado caso a caso.
 *
 * Cada slide recebe uma imagem PRÓPRIA — cinco cenas diferentes sobre o mesmo
 * tema, não a mesma arte com zoom variado. A ordem por slide é:
 *   1. banco com licença limpa (Wikimedia/Openverse), imagem ainda não usada
 *      em outro slide deste post;
 *   2. ilustração por IA a partir da `image_direction` daquele slide.
 */

import jpeg from "jpeg-js";
import { openaiKey, searchBankImages, type SourcedImage } from "../images";
import type { Story } from "../types";

const AI_TIMEOUT_MS = 120_000;
const AI_MODEL = (process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2").trim();
const AI_QUALITY = (process.env.OPENAI_IMAGE_QUALITY ?? "medium").trim();
const AI_SIZE = (process.env.OPENAI_IMAGE_SIZE ?? "1024x1536").trim();
const PRICE_PER_MTOK_OUT: Record<string, number> = {
  "gpt-image-2": 30,
  "gpt-image-1-mini": 8,
  "gpt-image-1": 40,
};

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

const VERTICAL_MOOD: Record<string, string> = {
  politics:
    "sober photojournalistic still life about global affairs and diplomacy; muted blues and deep neutrals",
  entertainment:
    "cinematic pop-culture atmosphere: stage lights, film reels, concert haze; saturated color, dramatic contrast",
  facts:
    "scientific wonder: macro textures, cosmic or natural phenomena, laboratory light; deep blues and violets",
};

/** Prompt de UM slide: a cena vem da direção visual daquele slide. */
export function slidePrompt(story: Story, slideIndex: number): string {
  const slide = story.draft?.slides?.[slideIndex];
  const direction = (slide?.image_direction ?? "").trim();
  const role = (slide?.role ?? "").toLowerCase().replace(/_/g, " ");
  const mood = VERTICAL_MOOD[story.vertical] ?? "documentary photography, neutral tones";
  return [
    `Editorial illustration for slide ${slideIndex + 1} of a news carousel about: "${story.title}".`,
    direction
      ? `This slide must show: ${direction}`
      : `This slide covers the "${role}" part of the story.`,
    `Each slide of the carousel shows a DIFFERENT scene — make this one visually distinct from a generic establishing shot.`,
    `Visual direction: ${mood}.`,
    "Style: editorial photography, cinematic, atmospheric, shallow depth of field, dramatic directional light, rich shadows. Keep one third of the frame visually calm and dark for text overlay.",
    "STRICT: no text, no letters, no numbers, no logos, no watermarks.",
    "STRICT: no recognizable real person, no identifiable face, no portrait, no celebrity likeness. Use objects, environments, silhouettes or symbols.",
  ].join(" ");
}

/** Onde o texto branco tem mais contraste (faixa + terço mais escuro e uniforme). */
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

async function generateWithAI(
  prompt: string,
): Promise<{ bytes: Buffer; cost: number | null } | null> {
  // openaiKey() dá precedência ao .env da raiz: a env var do Windows aponta
  // para um projeto OpenAI sem acesso a modelos de imagem (403).
  const key = openaiKey();
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        prompt,
        size: AI_SIZE,
        quality: AI_QUALITY,
        n: 1,
        // JPEG direto da API: evita converter/comprimir depois (sem sharp/Pillow)
        output_format: "jpeg",
        output_compression: 80,
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[media] IA falhou (HTTP ${res.status}): ${(await res.text()).slice(0, 180)}`);
      return null;
    }
    const body = (await res.json()) as {
      data?: { b64_json?: string }[];
      usage?: { output_tokens?: number };
    };
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) return null;
    const outTokens = body.usage?.output_tokens ?? 0;
    const price = Object.entries(PRICE_PER_MTOK_OUT).find(([m]) => AI_MODEL.startsWith(m))?.[1];
    return {
      bytes: Buffer.from(b64, "base64"),
      cost: price ? (outTokens * price) / 1_000_000 : null,
    };
  } catch (e) {
    console.warn(`[media] IA abortada: ${String(e).slice(0, 140)}`);
    return null;
  }
}

/**
 * Gera as imagens de TODOS os slides do post, em paralelo.
 * Banco primeiro (imagens distintas entre slides), IA no que sobrar.
 */
export async function generateStoryImages(story: Story): Promise<GeneratedAsset[]> {
  const slides = story.draft?.slides ?? [];
  if (slides.length === 0) return [];

  // uma busca no banco para todo o post: as fotos relevantes são distribuídas,
  // uma por slide, sem repetir (foi assim que o post do Tupac ficou bom)
  const banked = await searchBankImages(story.title, slides.length);

  const jobs = slides.map(async (slide, i): Promise<GeneratedAsset | null> => {
    const fromBank: SourcedImage | undefined = banked[i];
    if (fromBank) {
      const bytes = await fetchBytes(fromBank.url);
      if (bytes) {
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
      }
    }
    const prompt = slidePrompt(story, i);
    const ai = await generateWithAI(prompt);
    if (!ai) return null;
    const { placement, align } = analyzePlacement(ai.bytes);
    return {
      slide_number: slide.slide_number || i + 1,
      bytes: ai.bytes,
      mime_type: "image/jpeg",
      credit: "ILUSTRAÇÃO GERADA POR IA",
      source: "ai",
      text_placement: placement,
      text_align: align,
      prompt,
      estimated_cost_usd: ai.cost,
    };
  });

  const results = await Promise.all(jobs);
  return results.filter((r): r is GeneratedAsset => r !== null);
}
