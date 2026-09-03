/**
 * Versão de cache de um slide renderizado.
 *
 * O conteúdo visual de um slide muda quando muda: o texto do draft, a imagem
 * escolhida, a posição/alinhamento do texto, o foco do corte — ou o DESIGN do
 * template (bump manual em DESIGN_VERSION a cada mudança no renderer).
 * Colocando um hash disso na URL (?v=), a rota /api/slide pode responder
 * `immutable` e o NAVEGADOR guarda cada slide para sempre — as visitas
 * repetidas ao Prontos/Hoje ficam instantâneas mesmo depois de deploys (que
 * zeram o cache de borda da Vercel, mas não o do browser).
 */

import type { Story } from "../types";

// bump manual quando o VISUAL do template muda (renderer/fonts/logo)
export const DESIGN_VERSION = "gpb1";

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** ?v= estável por conteúdo do slide N desta story. */
export function slideVersion(story: Story, slideNumber: number): string {
  const m = (story.slide_media ?? []).find((x) => x.slide_number === slideNumber);
  const slide = story.draft?.slides?.find((s) => s.slide_number === slideNumber);
  return hash(
    [
      DESIGN_VERSION,
      story.draft?.draft_id ?? "",
      slide?.headline ?? "",
      slide?.body ?? "",
      m?.local_path ?? "none",
      m?.text_placement ?? "",
      m?.text_align ?? "",
      m?.focus_x ?? "",
      m?.focus_y ?? "",
    ].join("|"),
  );
}
