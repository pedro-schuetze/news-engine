/** Tokens de estilo por domínio (verticais, verificação, review). */

import type { ReviewStatus, VerificationStatus } from "./types";

export interface VerticalStyle {
  dot: string;
  chip: string;
  text: string;
}

const VERTICAL_STYLES: Record<string, VerticalStyle> = {
  entertainment: { dot: "bg-ent", chip: "bg-ent-soft text-ent", text: "text-ent" },
  politics: { dot: "bg-pol", chip: "bg-pol-soft text-pol", text: "text-pol" },
  facts: { dot: "bg-fact", chip: "bg-fact-soft text-fact", text: "text-fact" },
};

const FALLBACK_STYLE: VerticalStyle = {
  dot: "bg-ink-3",
  chip: "bg-panel-2 text-ink-2",
  text: "text-ink-2",
};

export function verticalStyle(vertical: string): VerticalStyle {
  return VERTICAL_STYLES[vertical] ?? FALLBACK_STYLE;
}

export const VERIFICATION_UI: Record<VerificationStatus, { label: string; chip: string; dot: string }> = {
  VERIFIED: { label: "Verificada", chip: "bg-brand-soft text-brand-ink", dot: "bg-brand" },
  PARTIALLY_VERIFIED: { label: "Parcial", chip: "bg-warn-soft text-warn", dot: "bg-warn" },
  UNVERIFIED: { label: "Não verificada", chip: "bg-danger-soft text-danger", dot: "bg-danger" },
};

export const REVIEW_UI: Record<ReviewStatus, { label: string; chip: string }> = {
  PENDING: { label: "Pendente", chip: "bg-panel-2 text-ink-2" },
  APPROVED: { label: "Aprovada", chip: "bg-brand-soft text-brand-ink" },
  REJECTED: { label: "Rejeitada", chip: "bg-danger-soft text-danger" },
};

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  FACT: "Fato",
  CLAIM: "Alegação",
  OPINION: "Opinião",
  POLL: "Pesquisa",
  OFFICIAL_DECISION: "Decisão oficial",
  RUMOR: "Rumor",
};
