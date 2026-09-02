/**
 * Detecção de rosto em código puro (sem API, sem dependência nativa).
 *
 * POR QUE existe (2026-09-02): a análise de contraste escolhia a faixa mais
 * escura para o texto — e numa foto de palco o rosto costuma estar justamente
 * na área escura. Resultado real: a manchete cobriu o rosto do Lionel Richie.
 * Contraste não sabe o que é rosto; isto aqui sabe, e vira VETO na escolha da
 * faixa (ver analyzePlacementSmart em generate.ts).
 *
 * Implementação: port do runtime do picojs (Pixel Intensity Comparison-based
 * Object detection) — https://github.com/nenadmarkus/picojs, MIT, por Nenad
 * Markus. O modelo `facefinder` (web/src/assets/models/facefinder) é a
 * cascata oficial do projeto: rostos FRONTAIS. Perfil escapa — aceitável,
 * porque o fallback é a regra de contraste que sempre existiu.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface FaceBox {
  /** centro e raio no espaço 0-1 (frações de largura/altura da imagem) */
  cx: number;
  cy: number;
  r: number;
  q: number; // confiança da cascata
}

interface Cascade {
  tdepth: number;
  ntrees: number;
  tcodes: Int8Array;
  preds: Float32Array;
  thresh: Float32Array;
}

let cascadePromise: Promise<Cascade> | null = null;

async function loadCascade(): Promise<Cascade> {
  if (!cascadePromise) {
    cascadePromise = (async () => {
      const p = path.join(process.cwd(), "src", "assets", "models", "facefinder");
      const buf = await fs.readFile(p);
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const tdepth = dv.getInt32(8, true);
      const ntrees = dv.getInt32(12, true);
      const pow2 = 1 << tdepth;
      const tcodes = new Int8Array(ntrees * 4 * pow2); // 4 bytes por nó (com raiz zerada)
      const preds = new Float32Array(ntrees * pow2);
      const thresh = new Float32Array(ntrees);
      let off = 16;
      for (let t = 0; t < ntrees; t++) {
        // primeiros 4 bytes do bloco de códigos são a raiz "vazia" (zeros)
        for (let i = 4; i < 4 * pow2; i++) {
          tcodes[t * 4 * pow2 + i] = dv.getInt8(off + i - 4);
        }
        off += 4 * pow2 - 4;
        for (let i = 0; i < pow2; i++) {
          preds[t * pow2 + i] = dv.getFloat32(off, true);
          off += 4;
        }
        thresh[t] = dv.getFloat32(off, true);
        off += 4;
      }
      return { tdepth, ntrees, tcodes, preds, thresh };
    })();
  }
  return cascadePromise;
}

/** Classifica uma janela (r,c,s) sobre pixels grayscale; -1 = não é rosto. */
function classify(
  cas: Cascade,
  r: number,
  c: number,
  s: number,
  pixels: Uint8Array,
  ldim: number,
): number {
  const r256 = r * 256;
  const c256 = c * 256;
  const pow2 = 1 << cas.tdepth;
  let o = 0.0;
  for (let t = 0; t < cas.ntrees; t++) {
    let idx = 1;
    const base = t * 4 * pow2;
    for (let d = 0; d < cas.tdepth; d++) {
      const k = base + 4 * idx;
      const p1 =
        ((r256 + cas.tcodes[k] * s) >> 8) * ldim + ((c256 + cas.tcodes[k + 1] * s) >> 8);
      const p2 =
        ((r256 + cas.tcodes[k + 2] * s) >> 8) * ldim + ((c256 + cas.tcodes[k + 3] * s) >> 8);
      idx = 2 * idx + (pixels[p1] <= pixels[p2] ? 1 : 0);
    }
    o += cas.preds[t * pow2 + idx - pow2];
    if (o <= cas.thresh[t]) return -1;
  }
  return o - cas.thresh[cas.ntrees - 1];
}

interface RawDet {
  r: number;
  c: number;
  s: number;
  q: number;
}

function iou(a: RawDet, b: RawDet): number {
  const r1 = a.s / 2;
  const r2 = b.s / 2;
  const ox = Math.max(
    0,
    Math.min(a.c + r1, b.c + r2) - Math.max(a.c - r1, b.c - r2),
  );
  const oy = Math.max(
    0,
    Math.min(a.r + r1, b.r + r2) - Math.max(a.r - r1, b.r - r2),
  );
  const inter = ox * oy;
  return inter / (a.s * a.s + b.s * b.s - inter);
}

function cluster(dets: RawDet[]): RawDet[] {
  dets.sort((x, y) => y.q - x.q);
  const used = new Array(dets.length).fill(false);
  const out: RawDet[] = [];
  for (let i = 0; i < dets.length; i++) {
    if (used[i]) continue;
    let r = 0,
      c = 0,
      s = 0,
      q = 0,
      n = 0;
    for (let j = i; j < dets.length; j++) {
      if (used[j]) continue;
      if (iou(dets[i], dets[j]) > 0.2) {
        used[j] = true;
        r += dets[j].r;
        c += dets[j].c;
        s += dets[j].s;
        q += dets[j].q;
        n++;
      }
    }
    out.push({ r: r / n, c: c / n, s: s / n, q });
  }
  return out;
}

/**
 * Detecta rostos frontais em RGBA já decodificado. A imagem é reduzida para
 * ~largura 540 antes (a cascata varre janelas; full-res seria caro à toa).
 * Retorna caixas em frações 0-1 da imagem, com q agregado do cluster.
 */
export async function detectFaces(
  rgba: Uint8Array,
  width: number,
  height: number,
  minQuality = 12,
): Promise<FaceBox[]> {
  const cas = await loadCascade();

  const factor = Math.max(1, Math.round(width / 540));
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = y * factor;
    for (let x = 0; x < w; x++) {
      const i = (sy * width + x * factor) * 4;
      gray[y * w + x] = (2 * rgba[i] + 7 * rgba[i + 1] + rgba[i + 2]) / 10;
    }
  }

  const dets: RawDet[] = [];
  const minsize = Math.max(40, Math.floor(0.12 * Math.min(w, h)));
  const maxsize = Math.floor(0.9 * Math.min(w, h));
  for (let s = minsize; s <= maxsize; s = Math.floor(s * 1.12)) {
    const step = Math.max(1, Math.floor(0.08 * s));
    const rMin = Math.floor(s / 2 + 1);
    for (let r = rMin; r <= h - s / 2 - 1; r += step) {
      for (let c = rMin; c <= w - s / 2 - 1; c += step) {
        const q = classify(cas, r, c, s, gray, w);
        if (q > 0) dets.push({ r, c, s, q });
      }
    }
  }

  return cluster(dets)
    .filter((d) => d.q >= minQuality)
    .map((d) => ({ cx: d.c / w, cy: d.r / h, r: d.s / 2 / Math.min(w, h), q: Math.round(d.q) }));
}

/**
 * Grade 3x3 (linhas TOP/CENTER/BOTTOM x colunas left/center/right) com a
 * fração da caixa de rosto dentro de cada célula. É o insumo do VETO: faixa
 * com rosto não recebe texto, mesmo sendo a mais escura.
 */
export function faceCoverageGrid(faces: FaceBox[]): number[][] {
  const grid = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const f of faces) {
    const top = Math.max(0, f.cy - f.r);
    const bottom = Math.min(1, f.cy + f.r);
    const left = Math.max(0, f.cx - f.r);
    const right = Math.min(1, f.cx + f.r);
    const area = Math.max(0.0001, (bottom - top) * (right - left));
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const oy = Math.max(0, Math.min(bottom, (row + 1) / 3) - Math.max(top, row / 3));
        const ox = Math.max(0, Math.min(right, (col + 1) / 3) - Math.max(left, col / 3));
        grid[row][col] = Math.max(grid[row][col], (oy * ox) / area);
      }
    }
  }
  return grid;
}
