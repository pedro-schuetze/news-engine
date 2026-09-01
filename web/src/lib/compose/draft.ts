/**
 * Geração e ajuste de draft pelo dashboard.
 *
 * As regras editoriais NÃO são reescritas aqui: vêm de prompts/*.md, os mesmos
 * arquivos que o pipeline Python lê (src/llm/prompts.py). Editar o .md muda o
 * comportamento nos dois lugares.
 *
 * Usado por:
 *   - "Gerar post" a partir de link (lib/compose/fromUrl.ts);
 *   - "Pedir ajustes" em qualquer post já existente.
 */

import { loadLearnedDirectives, loadVerticalConfigs, readPromptRule } from "../data";
import { openaiKey } from "../images";
import type { EditorialDraft, Story } from "../types";

const MODEL = (process.env.OPENAI_MODEL ?? "gpt-5-mini").trim();
const REASONING = (process.env.OPENAI_REASONING_EFFORT ?? "").trim();

const SYSTEM =
  "Você é o editor-chefe de uma redação digital brasileira que publica notícias " +
  "em contas de Instagram por vertical (entretenimento, política, fatos). " +
  "Você é rigoroso com fatos, distingue fato de alegação/rumor/opinião e escreve " +
  "português brasileiro natural, claro e sem sensacionalismo. " +
  "Responda SEMPRE somente com JSON válido (um único objeto), sem markdown, " +
  "sem comentários e sem texto fora do JSON.";

export interface SourceLine {
  domain: string;
  title: string;
  description: string;
  published?: string;
}

export interface DraftResult {
  draft: EditorialDraft;
  vertical: string;
  usage: { input: number; output: number };
}

interface RawDraft {
  original_story_title?: string;
  instagram_headline?: string;
  short_summary?: string;
  why_it_matters?: string;
  key_facts?: string[];
  caption?: string;
  hashtags?: string[];
  vertical?: string;
  slides?: {
    slide_number?: number;
    role?: string;
    headline?: string;
    body?: string;
    image_direction?: string;
    image_source_type?: string;
  }[];
}

async function callOpenAI(user: string): Promise<{ raw: string; usage: { input: number; output: number } }> {
  const key = openaiKey();
  if (!key) throw new Error("OPENAI_API_KEY não configurada");

  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
  };
  if (REASONING) body.reasoning_effort = REASONING;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    raw: json.choices?.[0]?.message?.content ?? "",
    usage: {
      input: json.usage?.prompt_tokens ?? 0,
      output: json.usage?.completion_tokens ?? 0,
    },
  };
}

function parseDraft(raw: string, storyId: string, fallbackTitle: string): { draft: EditorialDraft; vertical?: string } {
  const start = Math.min(...[raw.indexOf("{"), raw.indexOf("[")].filter((i) => i >= 0));
  const parsed = JSON.parse(raw.slice(Number.isFinite(start) ? start : 0)) as RawDraft;
  const slides = (parsed.slides ?? []).map((s, i) => ({
    slide_number: i + 1,
    role: (s.role ?? "OTHER").toUpperCase().replace(/\s+/g, "_"),
    headline: (s.headline ?? "").trim(),
    body: (s.body ?? "").trim(),
    image_direction: (s.image_direction ?? "").trim(),
    image_source_type: (s.image_source_type ?? "AGENCY_PHOTO").toUpperCase(),
  }));
  if (slides.length < 3) throw new Error(`o modelo devolveu ${slides.length} slides (mínimo 3)`);

  return {
    vertical: parsed.vertical?.trim().toLowerCase(),
    draft: {
      draft_id: `${storyId.slice(0, 8)}-${Date.now().toString(36)}`,
      story_id: storyId,
      channel: "instagram_carousel",
      language: "pt-BR",
      original_story_title: (parsed.original_story_title ?? fallbackTitle).trim(),
      instagram_headline: (parsed.instagram_headline ?? "").trim(),
      short_summary: (parsed.short_summary ?? "").trim(),
      why_it_matters: (parsed.why_it_matters ?? "").trim(),
      key_facts: (parsed.key_facts ?? []).map((k) => k.trim()).filter(Boolean),
      caption: (parsed.caption ?? "").trim(),
      hashtags: (parsed.hashtags ?? [])
        .map((t) => String(t).trim().replace(/\s+/g, ""))
        .filter(Boolean)
        .map((t) => (t.startsWith("#") ? t : `#${t}`)),
      slides,
      created_at: new Date().toISOString(),
    },
  };
}

async function rulesBlock(vertical: string): Promise<string> {
  const [headline, humanize, slides, caption, verticals, learned] = await Promise.all([
    readPromptRule("headline"),
    readPromptRule("humanize"),
    readPromptRule("slides"),
    readPromptRule("caption"),
    loadVerticalConfigs(),
    loadLearnedDirectives(),
  ]);

  const cfg = verticals.find((v) => v.id === vertical);
  const extra = cfg?.extra_rules?.length
    ? `\nREGRAS ESPECÍFICAS DA VERTICAL:\n${cfg.extra_rules.map((r) => `- ${r}`).join("\n")}\n`
    : "";
  const tone = cfg?.tone ? `Tom desta vertical: ${cfg.tone}\n` : "";

  // direcionamentos que o Pedro marcou como "aprender para os próximos posts"
  const directives = [...(learned.all ?? []), ...(learned[vertical] ?? [])];
  const learnedBlock = directives.length
    ? `\nDIRECIONAMENTOS PERMANENTES DO EDITOR (respeite todos):\n${directives
        .map((d) => `- ${d}`)
        .join("\n")}\n`
    : "";

  return [tone, extra, headline, "", humanize, "", slides, "", caption, learnedBlock].join("\n");
}

function sourcesBlock(sources: SourceLine[]): string {
  return sources
    .map(
      (s) =>
        `- ${s.domain}${s.published ? ` (${s.published})` : ""}: "${s.title}"` +
        (s.description ? ` — ${s.description.slice(0, 400)}` : ""),
    )
    .join("\n");
}

/** Gera (ou regenera) o pacote editorial de uma story. */
export async function generateDraft(opts: {
  storyId: string;
  title: string;
  vertical: string;
  sources: SourceLine[];
  contentType?: string;
  verificationSummary?: string;
  instruction?: string;
  chooseVertical?: boolean;
  currentDraft?: EditorialDraft | null;
}): Promise<DraftResult> {
  const rules = await rulesBlock(opts.vertical);
  const verticals = await loadVerticalConfigs();

  const verticalTask = opts.chooseVertical
    ? `Escolha também a vertical mais adequada entre: ${verticals
        .map((v) => `${v.id} (${v.description.slice(0, 110)})`)
        .join(" | ")}. Devolva em "vertical".`
    : `A vertical é "${opts.vertical}".`;

  const adjust = opts.instruction
    ? [
        "",
        "AJUSTE PEDIDO PELO EDITOR (prioridade máxima, mas sem violar as regras acima):",
        opts.instruction,
        opts.currentDraft
          ? `\nVERSÃO ATUAL (reescreva atendendo ao ajuste; não repita o que já estava bom por acaso):\nmanchete: ${opts.currentDraft.instagram_headline}\nresumo: ${opts.currentDraft.short_summary}\nlegenda: ${opts.currentDraft.caption.slice(0, 700)}`
          : "",
      ].join("\n")
    : "";

  const user = `PURPOSE: draft
TITLE: ${opts.title}

Escreva o pacote editorial de UM post de Instagram (carrossel de 5 slides).
${verticalTask}

ACONTECIMENTO: ${opts.title}
TIPO DE CONTEÚDO: ${opts.contentType ?? "FACT"}
${opts.verificationSummary ? `VERIFICAÇÃO: ${opts.verificationSummary}` : ""}

FONTES DISPONÍVEIS (única base factual permitida):
${sourcesBlock(opts.sources)}

${rules}
${adjust}

FORMATO DE SAÍDA (JSON estrito):
{"original_story_title": "...", ${opts.chooseVertical ? '"vertical": "politics|entertainment|facts", ' : ""}"instagram_headline": "até ~60 caracteres", "short_summary": "2-3 frases", "why_it_matters": "1-2 frases", "key_facts": ["3 a 6 fatos curtos"], "caption": "...", "hashtags": ["#..."], "slides": [{"slide_number": 1, "role": "HOOK", "headline": "...", "body": "...", "image_direction": "...", "image_source_type": "AGENCY_PHOTO"}]}`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { raw, usage } = await callOpenAI(
      attempt === 1
        ? user
        : `${user}\n\nATENÇÃO: a resposta anterior era inválida (${String(lastError).slice(0, 200)}). Responda SOMENTE com JSON válido no formato pedido.`,
    );
    try {
      const { draft, vertical } = parseDraft(raw, opts.storyId, opts.title);
      const chosen =
        vertical && verticals.some((v) => v.id === vertical) ? vertical : opts.vertical;
      return { draft, vertical: chosen, usage };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`não consegui um draft válido: ${String(lastError).slice(0, 200)}`);
}

/** Fontes de uma story existente, para regenerar o texto. */
export function sourcesFromStory(story: Story): SourceLine[] {
  const refs = [story.verification.primary_source, ...story.verification.supporting_sources].filter(
    (r) => r,
  );
  return refs.map((r) => ({
    domain: r!.source_domain || r!.name,
    title: r!.name,
    description: "",
    published: r!.published_at ?? undefined,
  }));
}
