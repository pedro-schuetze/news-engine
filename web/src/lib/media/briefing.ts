/**
 * Briefing para gerar as imagens FORA da API — no ChatGPT, com a skill
 * `news-engine-carousel` instalada (skills/news-engine-carousel).
 *
 * É o caminho manual, para quando a arte de um post merece cuidado extra:
 * o Pedro copia este texto, cola no ChatGPT, recebe as 5 imagens e sobe de
 * volta pelo botão de upload do card.
 */

import type { Story } from "../types";

const VERTICAL_LABEL: Record<string, string> = {
  entertainment: "Entretenimento",
  politics: "Mundo",
  facts: "Fatos",
};

const ROLE_LABEL: Record<string, string> = {
  HOOK: "gancho (capa)",
  CONTEXT: "contexto",
  FACTS: "fatos",
  WHY_IT_MATTERS: "consequência",
  CONCLUSION: "fecho",
  OTHER: "apoio",
};

export function buildChatGptBriefing(story: Story): string {
  const slides = story.draft?.slides ?? [];
  const vertical = VERTICAL_LABEL[story.vertical] ?? story.vertical;

  const lines = slides.map((s, i) => {
    const role = ROLE_LABEL[s.role] ?? s.role.toLowerCase();
    const direction = (s.image_direction || "").trim();
    const headline = (s.headline || "").trim();
    return [
      `SLIDE ${s.slide_number || i + 1} — ${role}`,
      headline ? `  texto que entrará por cima: "${headline}"` : null,
      direction ? `  imagem deve mostrar: ${direction}` : `  imagem: cena de apoio para esta parte`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `Use a skill news-engine-carousel e gere as ${slides.length} imagens deste post do News Engine.`,
    "",
    `VERTICAL: ${vertical}`,
    `ACONTECIMENTO: ${story.title}`,
    story.draft?.instagram_headline
      ? `MANCHETE DO POST: ${story.draft.instagram_headline}`
      : null,
    story.draft?.short_summary ? `RESUMO: ${story.draft.short_summary}` : null,
    story.is_rumor_or_claim
      ? "ATENÇÃO: o post trata de alegação não confirmada. Nada de imagem que sugira o fato como consumado."
      : null,
    "",
    ...lines,
    "",
    `Gere ${slides.length} IMAGENS SEPARADAS em 2:3 (1024x1536) — um arquivo por slide, cada um uma cena DIFERENTE.`,
    "NUNCA monte grade, colagem ou mosaico com várias cenas na mesma imagem. Se a ferramenta só gerar uma imagem por resposta, gere uma por resposta, na ordem dos slides.",
    "Sem texto, sem letras, sem logos. Sem rosto de pessoa real identificável — se a direção de um slide citar alguém, mostre o entorno (púlpito vazio, bandeiras, silhueta de costas), nunca a pessoa.",
    "NÃO escureça a imagem nem pinte vinheta, degradê ou faixa escura para o texto: o sombreamento e a tipografia são aplicados DEPOIS pelo sistema, que analisa cada imagem. Entregue exposição natural; apenas componha com uma região de menos detalhe.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
