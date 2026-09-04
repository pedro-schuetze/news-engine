"use client";

import { useMemo, useState } from "react";
import SlidePreview, { type Placement, type PreviewSlide } from "./SlidePreview";
import type { MediaCandidate } from "@/lib/types";

const PLACEMENTS: { value: Placement; label: string; title: string }[] = [
  { value: "TOP", label: "▔", title: "texto no topo" },
  { value: "CENTER", label: "▬", title: "texto no meio" },
  { value: "BOTTOM", label: "▁", title: "texto na base" },
];

interface SlideState {
  candidateId: string | null;
  placement: Placement;
  align: "left" | "center" | "right";
}

/**
 * Editor de mídia 100% LOCAL (2026-09-03, "repense a mecânica"):
 * clicar numa foto ou numa posição atualiza o preview NA HORA (réplica HTML —
 * SlidePreview), sem nenhuma chamada de rede. Nada é gravado até o editor
 * clicar SALVAR — aí vai tudo numa única gravação, e os PNGs oficiais são
 * re-renderizados em segundo plano só para export/Prontos.
 */
export default function PostMedia({
  storyId,
  runFile,
  slides,
  pool,
  subBrand,
  publicBase,
  initialState,
}: {
  storyId: string;
  runFile: string;
  slides: PreviewSlide[];
  pool: MediaCandidate[];
  subBrand: string;
  /** base pública do R2 para as imagens do pool (CDN); "" usa a rota interna */
  publicBase: string;
  /** estado salvo: slide_number -> { candidateId, placement, align } */
  initialState: Record<number, SlideState>;
}) {
  const [saved, setSaved] = useState<Record<number, SlideState>>(initialState);
  const [draft, setDraft] = useState<Record<number, SlideState>>(initialState);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);
  const ordered = useMemo(() => [...pool].sort((a, b) => b.score - a.score), [pool]);
  const runQs = `run=${encodeURIComponent(runFile)}`;

  const changes = slides
    .map(({ n }) => {
      const d = draft[n];
      const s = saved[n];
      if (!d) return null;
      const candChanged = d.candidateId !== s?.candidateId;
      const placeChanged = d.placement !== s?.placement;
      if (!candChanged && !placeChanged) return null;
      return {
        slide_number: n,
        ...(candChanged && d.candidateId ? { candidate_id: d.candidateId } : {}),
        ...(placeChanged ? { placement: d.placement } : {}),
      };
    })
    .filter(Boolean) as { slide_number: number; candidate_id?: string; placement?: string }[];
  const dirty = changes.length > 0;

  function imageUrlFor(c: MediaCandidate | null): string | null {
    if (!c) return null;
    if (publicBase) {
      return `${publicBase}/${c.local_path.split("/").map(encodeURIComponent).join("/")}`;
    }
    return `/api/media/${storyId}/candidate/${c.id}?${runQs}`;
  }

  function pick(n: number, c: MediaCandidate) {
    setNotice(null);
    setDraft((d) => ({
      ...d,
      [n]: {
        candidateId: c.id,
        // a foto nova traz a análise dela (posição sugerida + alinhamento)
        placement: c.text_placement,
        align: c.text_align,
      },
    }));
  }

  function place(n: number, placement: Placement) {
    setNotice(null);
    setDraft((d) => ({ ...d, [n]: { ...d[n], placement } }));
  }

  function discard() {
    setDraft(saved);
    setError(null);
    setNotice("alterações descartadas");
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/media/${storyId}/apply?${runQs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `falha ao salvar (HTTP ${res.status})`);
        return;
      }
      setSaved(draft);
      setNotice("salvo — os arquivos finais são atualizados em segundo plano");
    } catch (e) {
      setError(String(e).slice(0, 160));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* previews instantâneos (réplica HTML — nenhum servidor envolvido) */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {slides.map((slide) => {
          const st = draft[slide.n];
          const cand = st?.candidateId ? (byId.get(st.candidateId) ?? null) : null;
          return (
            <div key={slide.n} className="flex flex-col">
              <SlidePreview
                slide={slide}
                candidate={cand}
                placement={st?.placement ?? "BOTTOM"}
                align={st?.align ?? "center"}
                subBrand={subBrand}
                imageUrl={imageUrlFor(cand)}
              />
              <div
                className="flex items-center justify-center gap-1 pt-1"
                title="posição do texto e da sombra neste slide"
              >
                {PLACEMENTS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => place(slide.n, o.value)}
                    title={o.title}
                    className={`h-6 w-8 rounded-md border text-[11px] leading-none transition-colors ${
                      st?.placement === o.value
                        ? "border-brand bg-brand-soft text-brand-ink"
                        : "border-line bg-panel text-ink-3 hover:border-ink-3 hover:text-ink"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* barra de salvar — só aparece com alterações pendentes */}
      {(dirty || saving || notice) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/40 bg-brand-soft/60 px-3 py-2">
          {dirty || saving ? (
            <>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-full bg-brand px-5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-ink disabled:opacity-60"
              >
                {saving ? "salvando…" : `Salvar (${changes.length})`}
              </button>
              <button
                onClick={discard}
                disabled={saving}
                className="rounded-full border border-line bg-panel px-4 py-1.5 text-[13px] text-ink-2 hover:text-ink disabled:opacity-60"
              >
                Descartar
              </button>
              <span className="font-mono text-[11px] text-ink-3">
                nada é gravado até você salvar
              </span>
            </>
          ) : (
            <span className="font-mono text-[11px] text-brand-ink">{notice}</span>
          )}
        </div>
      )}
      {error && <p className="text-[11.5px] text-danger">{error}</p>}

      {/* candidatas por slide */}
      {pool.length > 0 && (
        <div className="space-y-3 border-t border-line pt-3">
          <p className="font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
            escolher imagem por slide · {pool.length} candidatas (banco + uploads) · pré-seleção
            por score
          </p>
          {slides.map((slide) => (
            <div key={slide.n} className="space-y-1">
              <p className="font-mono text-[10.5px] text-ink-3">
                slide {slide.n} · {slide.headline || slide.kind}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ordered.map((c) => {
                  const isSelected = draft[slide.n]?.candidateId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => pick(slide.n, c)}
                      title={`${c.origin === "bank" ? "banco" : "ChatGPT"} · score ${c.score} (${c.score_notes})\n${c.credit}`}
                      className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                        isSelected
                          ? "border-brand ring-2 ring-brand/30"
                          : "border-line opacity-80 hover:border-ink-3 hover:opacity-100"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/media/${storyId}/candidate/${c.id}?${runQs}&w=240`}
                        alt={c.credit}
                        width={76}
                        height={95}
                        loading="lazy"
                        decoding="async"
                        className="h-[95px] w-[76px] object-cover"
                      />
                      <span
                        className={`absolute bottom-0 left-0 right-0 px-1 py-px text-center font-mono text-[9px] leading-tight ${
                          c.origin === "upload" ? "bg-navy/85 text-white" : "bg-black/60 text-white"
                        }`}
                      >
                        {c.origin === "upload" ? "gpt" : "banco"} · {c.score}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
