/**
 * Pré-render dos slides no R2 (fase 3 da performance, 2026-09-03).
 *
 * O PNG renderizado de um slide é um artefato imutável: a chave inclui a
 * versão de conteúdo (slideVersion) — mudou o texto/imagem/posição, muda a
 * chave. Com isso:
 *   - a rota /api/slide serve o PNG PRONTO do bucket (sem satori) e só
 *     renderiza no primeiro acesso de cada versão (read-through);
 *   - as rotas de edição pré-aquecem os slides afetados DEPOIS da resposta
 *     (next/server after) — quando a página recarrega o preview, o render
 *     já está no bucket;
 *   - o export reusa os PNGs prontos em vez de re-renderizar tudo (era o
 *     gargalo dos ~125s).
 *
 * Sem R2 configurado, nada disso roda — a rota renderiza como sempre.
 * Artefatos de versões velhas ficam órfãos no bucket (bytes baratos);
 * limpeza por idade fica para uma lifecycle rule futura.
 */

import { r2Enabled, r2Get, r2Put } from "../media/storage";
import { buildSlideSpecs } from "./spec";
import { renderSlide } from "./render";
import { slideVersion } from "./version";
import type { Story } from "../types";

export function renderKey(storyId: string, n: number, v: string): string {
  return `renders/${storyId}/${n}-${v}.png`;
}

export async function getPrerendered(storyId: string, n: number, v: string): Promise<Buffer | null> {
  if (!r2Enabled()) return null;
  return r2Get(renderKey(storyId, n, v));
}

export async function putPrerendered(
  storyId: string,
  n: number,
  v: string,
  png: Buffer,
): Promise<void> {
  if (!r2Enabled()) return;
  try {
    await r2Put(renderKey(storyId, n, v), png, "image/png");
  } catch (e) {
    console.warn(`[prerender] falha ao gravar ${storyId}/${n}: ${String(e).slice(0, 120)}`);
  }
}

/**
 * Renderiza e grava no R2 os slides indicados (ou todos). Pensada para rodar
 * em `after()` nas rotas de edição: nunca lança, só loga.
 */
export async function prerenderSlides(
  story: Story,
  slideNumbers?: number[],
): Promise<Record<string, number>> {
  const t: Record<string, number> = {};
  if (!r2Enabled()) return t;
  try {
    let t0 = Date.now();
    const specs = await buildSlideSpecs(story, slideNumbers);
    t.specs_ms = Date.now() - t0;
    const wanted = slideNumbers?.length ? new Set(slideNumbers) : null;
    t0 = Date.now();
    await Promise.all(
      specs.map(async (spec) => {
        if (wanted && !wanted.has(spec.pageIndex)) return;
        const v = slideVersion(story, spec.pageIndex);
        const image = await renderSlide(spec);
        const png = Buffer.from(await image.arrayBuffer());
        t.render_ms = Date.now() - t0;
        const tp = Date.now();
        await putPrerendered(story.story_id, spec.pageIndex, v, png);
        t.put_ms = Date.now() - tp;
      }),
    );
  } catch (e) {
    console.warn(`[prerender] ${story.story_id}: ${String(e).slice(0, 160)}`);
  }
  return t;
}
