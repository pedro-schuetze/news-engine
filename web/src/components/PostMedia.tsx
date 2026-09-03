"use client";

import { useState } from "react";
import type { MediaCandidate } from "@/lib/types";

type Placement = "TOP" | "CENTER" | "BOTTOM";

interface SlideInfo {
  n: number;
  label: string;
}

interface SlideSel {
  path: string | null;
  placement: Placement;
}

const PLACEMENTS: { value: Placement; label: string; title: string }[] = [
  { value: "TOP", label: "▔", title: "texto no topo" },
  { value: "CENTER", label: "▬", title: "texto no meio" },
  { value: "BOTTOM", label: "▁", title: "texto na base" },
];

/**
 * Previews + seleção de imagem + posição do texto, SEM router.refresh:
 * o clique atualiza o estado na hora (otimista) e, confirmado o POST, só o
 * preview do slide afetado recarrega (cache-buster ?v=). Antes, cada clique
 * re-renderizava a página inteira — todos os cards e todos os previews — e a
 * revisão "travava" (reclamação do Pedro, 2026-09-02).
 */
export default function PostMedia({
  storyId,
  runFile,
  slides,
  pool,
  initialSelection,
  initialVersions,
}: {
  storyId: string;
  runFile: string;
  slides: SlideInfo[];
  pool: MediaCandidate[];
  /** slide_number -> { path da imagem escolhida, placement atual } */
  initialSelection: Record<number, SlideSel>;
  /** ?v= por slide calculado no servidor (cache immutable no browser) */
  initialVersions: Record<number, string>;
}) {
  const [sel, setSel] = useState<Record<number, SlideSel>>(initialSelection);
  const [ver, setVer] = useState<Record<number, string | number>>(initialVersions);
  const [busySlide, setBusySlide] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runQs = `run=${encodeURIComponent(runFile)}`;
  const ordered = [...pool].sort((a, b) => b.score - a.score);

  function bump(n: number) {
    setVer((v) => ({ ...v, [n]: Date.now() }));
  }

  async function post(url: string, body: unknown): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? `falha (HTTP ${res.status})`);
        return false;
      }
      return true;
    } catch (e) {
      setError(String(e).slice(0, 160));
      return false;
    }
  }

  async function pick(n: number, c: MediaCandidate) {
    if (busySlide !== null || sel[n]?.path === c.local_path) return;
    const prev = sel[n];
    setBusySlide(n);
    setError(null);
    // otimista: highlight e placement mudam já
    setSel((s) => ({ ...s, [n]: { path: c.local_path, placement: c.text_placement } }));
    const ok = await post(`/api/media/${storyId}/select?${runQs}`, {
      slide_number: n,
      candidate_id: c.id,
    });
    if (ok) bump(n);
    else setSel((s) => ({ ...s, [n]: prev }));
    setBusySlide(null);
  }

  async function place(n: number, placement: Placement) {
    if (busySlide !== null || sel[n]?.placement === placement || !sel[n]?.path) return;
    const prev = sel[n];
    setBusySlide(n);
    setError(null);
    setSel((s) => ({ ...s, [n]: { ...s[n], placement } }));
    const ok = await post(`/api/media/${storyId}/placement?${runQs}`, {
      slide_number: n,
      placement,
    });
    if (ok) bump(n);
    else setSel((s) => ({ ...s, [n]: prev }));
    setBusySlide(null);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {slides.map(({ n }) => (
          <div key={n} className="flex flex-col">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/slide/${storyId}/${n}?${runQs}${ver[n] ? `&v=${ver[n]}` : ""}`}
              alt={`Slide ${n}`}
              loading="lazy"
              decoding="async"
              className={`w-full rounded-lg border border-line bg-panel-2 transition-opacity ${
                busySlide === n ? "animate-pulse opacity-60" : ""
              }`}
              style={{ aspectRatio: "1080 / 1350" }}
            />
            {sel[n]?.path && (
              <div
                className="flex items-center justify-center gap-1 pt-1"
                title="posição do texto e da sombra neste slide"
              >
                {PLACEMENTS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => place(n, o.value)}
                    disabled={busySlide !== null}
                    title={o.title}
                    className={`h-6 w-8 rounded-md border text-[11px] leading-none transition-colors ${
                      sel[n]?.placement === o.value
                        ? "border-brand bg-brand-soft text-brand-ink"
                        : "border-line bg-panel text-ink-3 hover:border-ink-3 hover:text-ink"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {pool.length > 0 && (
        <div className="space-y-3 border-t border-line pt-3">
          <p className="font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
            escolher imagem por slide · {pool.length} candidatas (banco + uploads) · pré-seleção
            por score
          </p>
          {slides.map(({ n, label }) => (
            <div key={n} className="space-y-1">
              <p className="font-mono text-[10.5px] text-ink-3">
                slide {n} · {label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ordered.map((c) => {
                  const isSelected = sel[n]?.path === c.local_path;
                  return (
                    <button
                      key={c.id}
                      onClick={() => pick(n, c)}
                      disabled={busySlide !== null}
                      title={`${c.origin === "bank" ? "banco" : "ChatGPT"} · score ${c.score} (${c.score_notes})\n${c.credit}`}
                      className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                        isSelected
                          ? "border-brand ring-2 ring-brand/30"
                          : "border-line opacity-80 hover:border-ink-3 hover:opacity-100"
                      } ${busySlide === n && isSelected ? "animate-pulse" : ""}`}
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
      {error && <p className="text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}
