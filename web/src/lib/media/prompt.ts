export const DEFAULT_IMAGE_PROMPT = `Crie SOMENTE o fundo visual de um slide de carrossel jornalístico sobre: {{title}}.
O objetivo é apoiar a reportagem, nunca fingir que uma cena aconteceu. Mantenha uma linguagem visual coerente em todo o carrossel, mas crie uma composição própria para este slide.
VERTICAL: {{vertical}}
MANCHETE DO POST: {{instagram_headline}}
RESUMO: {{short_summary}}
SLIDE {{slide_number}} DE {{slide_count}} — FUNÇÃO: {{role}}
MANCHETE DO SLIDE: {{headline}}
TEXTO DO SLIDE: {{body}}
DIREÇÃO VISUAL DESTE SLIDE: {{image_direction}}

A imagem será usada como fundo e receberá texto por cima depois. Reserve uma região natural com pouco detalhe para a tipografia, mantendo exposição e iluminação naturais.
Não gere texto, letras, logotipos, marcas d'água, molduras, vinheta, faixa escura ou degradê.
Não inclua o logotipo GPB: a marca e a tipografia serão aplicadas pelo sistema depois.
NÃO reproduza uma coletiva, discurso, debate, reunião, votação ou acontecimento real como se fosse uma fotografia documental. Para fatos reais, prefira lugares, objetos, arquitetura, paisagens, detalhes institucionais ou uma ilustração editorial claramente conceitual.
NUNCA retrate ou tente se parecer com pessoas citadas na reportagem, autoridades, políticos, artistas, executivos ou qualquer pessoa real identificável. Pessoas genéricas só podem aparecer como figurantes anônimos, sem rosto identificável, sem pose de protagonista e sem sugerir que participaram do fato.
Se o acontecimento for uma alegação não confirmada, use uma representação claramente simbólica e não trate a alegação como fato consumado.`;

export function buildImagePrompt(input: {
  title: string;
  vertical: string;
  instagramHeadline: string;
  shortSummary: string;
  isRumorOrClaim: boolean;
  slideNumber: number;
  slideCount: number;
  role: string;
  headline: string;
  body: string;
  imageDirection: string;
  custom: string;
  carouselContext?: string;
}): string {
  const base = DEFAULT_IMAGE_PROMPT
    .replaceAll("{{title}}", input.title)
    .replaceAll("{{vertical}}", input.vertical)
    .replaceAll("{{instagram_headline}}", input.instagramHeadline || input.title)
    .replaceAll("{{short_summary}}", input.shortSummary || "não informado")
    .replaceAll("{{slide_number}}", String(input.slideNumber))
    .replaceAll("{{slide_count}}", String(input.slideCount))
    .replaceAll("{{role}}", input.role || "apoio")
    .replaceAll("{{headline}}", input.headline || "sem manchete")
    .replaceAll("{{body}}", input.body || "sem texto adicional")
    .replaceAll("{{image_direction}}", input.imageDirection || "cena de apoio editorial");
  const shared = input.carouselContext ? `\nBRIEFING DO CARROSSEL COMPLETO:\n${input.carouselContext}\nUse este briefing para manter paleta, atmosfera e assunto coerentes. Ainda assim, gere SOMENTE o fundo do slide ${input.slideNumber}; não monte o carrossel inteiro nem repita a mesma cena.` : "";
  const claimNote = input.isRumorOrClaim
    ? "\nATENÇÃO: esta notícia é uma alegação não confirmada. Não mostre o fato como comprovado."
    : "";
  return input.custom.trim()
    ? `${base}${shared}${claimNote}\n\nINSTRUÇÕES PERSONALIZADAS DO EDITOR:\n${input.custom.trim()}`
    : `${base}${shared}${claimNote}`;
}
