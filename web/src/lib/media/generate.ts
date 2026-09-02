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

import { createHash } from "node:crypto";
import jpeg from "jpeg-js";
import { detectFaces, faceCoverageGrid } from "./faces";
import { searchBankImages } from "../images";
import { poolPath, type PoolFile } from "./persist";
import type { Story } from "../types";

export type TextPlacement = "TOP" | "CENTER" | "BOTTOM";

const BAND_INDEX: Record<TextPlacement, number> = { TOP: 0, CENTER: 1, BOTTOM: 2 };
const COL_INDEX: Record<"left" | "center" | "right", number> = { left: 0, center: 1, right: 2 };
// rosto coberto >20% ja dispara o veto; 500 estoura qualquer vantagem de escuridao
const FACE_PENALTY = 500;

export function analyzePlacement(
  jpegBytes: Buffer,
  faceGrid?: number[][],
): { placement: TextPlacement; align: "left" | "center" | "right"; bandScore: number } {
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
    const faceRow = (p: TextPlacement) =>
      faceGrid ? Math.max(...faceGrid[BAND_INDEX[p]]) : 0;
    const facePen = (p: TextPlacement) =>
      faceRow(p) > 0.2 ? FACE_PENALTY * faceRow(p) : 0;
    // veto de rosto: a faixa mais escura perde se tiver rosto (caso real de
    // 2026-09-02: a manchete cobriu o rosto do Lionel Richie num palco escuro)
    const bands: Record<TextPlacement, number> = {
      TOP: stats(0, 0, width, third) + facePen("TOP"),
      CENTER: stats(0, third, width, 2 * third) + facePen("CENTER"),
      BOTTOM: stats(0, 2 * third, width, height) + facePen("BOTTOM"),
    };
    const placement = (Object.keys(bands) as TextPlacement[]).reduce((a, b) =>
      bands[a] <= bands[b] ? a : b,
    );

    const yTop = placement === "TOP" ? 0 : placement === "CENTER" ? third : 2 * third;
    const yBottom = yTop + third;
    const w3 = Math.floor(width / 3);
    const faceCell = (col: "left" | "center" | "right") =>
      faceGrid && faceGrid[BAND_INDEX[placement]][COL_INDEX[col]] > 0.15 ? FACE_PENALTY : 0;
    const cols = {
      left: stats(0, yTop, w3, yBottom) + faceCell("left"),
      center: stats(w3, yTop, 2 * w3, yBottom) + faceCell("center"),
      right: stats(2 * w3, yTop, width, yBottom) + faceCell("right"),
    };
    const best = (Object.keys(cols) as ("left" | "center" | "right")[]).reduce((a, b) =>
      cols[a] <= cols[b] ? a : b,
    );
    // só desloca quando o ganho é claro; senão mantém centralizado
    const align = cols[best] < cols.center - 12 ? best : "center";
    // qualidade da melhor faixa (0-100): quanto mais escura e uniforme, mais
    // espaço limpo para a tipografia — descontando a penalidade de rosto, que
    // e veto de POSICAO, nao medida de luz
    const raw = Math.max(0, Math.min(255, bands[placement] - facePen(placement)));
    const bandScore = Math.max(0, Math.min(100, Math.round(100 - (raw / 255) * 100)));
    return { placement, align, bandScore };
  } catch {
    return { placement: "BOTTOM", align: "center", bandScore: 50 };
  }
}

/**
 * Analise completa: contraste + DETECCAO DE ROSTO como veto de posicao.
 * Se a deteccao falhar (formato nao-JPEG, erro no modelo), cai na analise de
 * contraste pura — nunca lanca.
 */
export async function analyzePlacementSmart(jpegBytes: Buffer): Promise<{
  placement: TextPlacement;
  align: "left" | "center" | "right";
  bandScore: number;
  faces: number;
}> {
  let grid: number[][] | undefined;
  let faces = 0;
  try {
    const img = jpeg.decode(jpegBytes, { useTArray: true, formatAsRGBA: true });
    const found = await detectFaces(img.data, img.width, img.height);
    faces = found.length;
    if (found.length > 0) grid = faceCoverageGrid(found);
  } catch {
    /* sem rostos detectaveis: segue so o contraste */
  }
  return { ...analyzePlacement(jpegBytes, grid), faces };
}

/**
 * Nitidez aproximada (0-100): variância do Laplaciano na região central.
 * Barato e suficiente para separar foto tremida/borrada de foto limpa —
 * NÃO mede relevância nem estética.
 */
export function sharpnessScore(jpegBytes: Buffer): number {
  try {
    const img = jpeg.decode(jpegBytes, { useTArray: true, formatAsRGBA: true });
    const { width, height, data } = img;
    const x0 = Math.floor(width * 0.2);
    const x1 = Math.floor(width * 0.8);
    const y0 = Math.floor(height * 0.2);
    const y1 = Math.floor(height * 0.8);
    const lum = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    };
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = y0 + 2; y < y1 - 2; y += 3) {
      for (let x = x0 + 2; x < x1 - 2; x += 3) {
        const lap = 4 * lum(x, y) - lum(x - 2, y) - lum(x + 2, y) - lum(x, y - 2) - lum(x, y + 2);
        sum += lap;
        sumSq += lap * lap;
        n++;
      }
    }
    if (n === 0) return 50;
    const variance = Math.max(0, sumSq / n - (sum / n) ** 2);
    // variância típica: ~30 (muito borrada) a ~5000+ (bem nítida); escala log
    return Math.max(0, Math.min(100, Math.round((Math.log10(variance + 1) / 3.7) * 100)));
  } catch {
    return 50;
  }
}

/**
 * Score de pré-seleção de uma candidata (0-100), só com código:
 *   relevância 40% (posição na busca do banco; upload = 85, o editor gerou
 *   a imagem especificamente para o post) + espaço para texto 35% + nitidez 25%.
 * É pré-seleção, não veredito: o editor troca com um clique no picker.
 */
export function scoreCandidate(opts: {
  origin: "bank" | "upload";
  bankRank?: number;
  bandScore: number;
  sharpness: number;
}): { score: number; notes: string } {
  const relevance =
    opts.origin === "upload" ? 85 : Math.max(40, 100 - (opts.bankRank ?? 0) * 12);
  const score = Math.round(relevance * 0.4 + opts.bandScore * 0.35 + opts.sharpness * 0.25);
  return {
    score,
    notes: `relevância ${relevance} · texto ${opts.bandScore} · nitidez ${opts.sharpness}`,
  };
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
 * Busca fotos no banco e devolve CANDIDATAS prontas para o pool (bytes +
 * metadados + score). O id é o hash da URL de origem: buscar de novo não
 * duplica candidata já conhecida.
 */
export async function bankCandidates(story: Story): Promise<PoolFile[]> {
  const slides = story.draft?.slides ?? [];
  if (slides.length === 0) return [];

  // pede mais que o número de slides: o excedente vira opção no seletor
  const banked = await searchBankImages(story.title, Math.min(slides.length + 3, 8));

  const jobs = banked.map(async (img, rank): Promise<PoolFile | null> => {
    const bytes = await fetchBytes(img.url);
    if (!bytes) return null;
    const mime = img.url.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
    const isJpeg = mime === "image/jpeg";
    const { placement, align, bandScore } = isJpeg
      ? await analyzePlacementSmart(bytes)
      : { placement: "BOTTOM" as const, align: "center" as const, bandScore: 50 };
    const sharp = isJpeg ? sharpnessScore(bytes) : 50;
    const { score, notes } = scoreCandidate({
      origin: "bank",
      bankRank: rank,
      bandScore,
      sharpness: sharp,
    });
    const id = `b${createHash("sha1").update(img.url).digest("hex").slice(0, 10)}`;
    return {
      bytes,
      candidate: {
        id,
        local_path: poolPath(story.story_id, id, mime),
        origin: "bank",
        source: img.source === "ai" ? "ai" : img.source,
        mime_type: mime,
        credit: img.credit,
        text_placement: placement,
        text_align: align,
        score,
        score_notes: notes,
        added_at: new Date().toISOString(),
      },
    };
  });

  const results = await Promise.all(jobs);
  // dedupe por id (a mesma foto pode voltar em posições diferentes)
  const seen = new Set<string>();
  return results.filter((r): r is PoolFile => {
    if (!r || seen.has(r.candidate.id)) return false;
    seen.add(r.candidate.id);
    return true;
  });
}
