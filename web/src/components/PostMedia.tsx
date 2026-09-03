"use client";

import { useEffect, useRef, useState } from "react";
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
 * Previews + seleção de imagem + posição do texto.
 *
 * Fluxo (2026-09-03): o clique grava a intenção e volta em ~1s; o RENDER do
 * slide (satori, 20-30s medidos em produção) roda no servidor DEPOIS da
 * resposta. Este componente fica POLLANDO ?waitless= até o PNG novo existir
 * no bucket e só então troca o preview — o slide editado pulsa enquanto isso
 * e os DEMAIS slides continuam livres para editar em paralelo.
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
  /** slides com render em andamento no servidor (pulsam; botões travados) */
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const runQs = `run=${encodeURIComponent(runFile)}`;
  const ordered = [...pool].sort((a, b) => b.score - a.score);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  /** polla até o PNG da versão nova existir no bucket, então troca o preview */
  function watchRender(n: number, v: string) {
    setPending((p) => ({ ...p, [n]: true }));
    const started = Date.now();
    const probe = async () => {
      try {
        const res = await fetch(
          `/api/slide/${storyId}/${n}?${runQs}&v=${v}&waitless=1`,
          { method: "HEAD", cache: "no-store" },
        );
        if (res.ok) {
          setVer((prev) => ({ ...prev, [n]: v }));
          setPending((p) => ({ ...p, [n]: false }));
          return;
        }
      } catch {
        /* rede oscilou: tenta de novo */
      }
      if (Date.now() - started > 90_000) {
        // desiste do poll; troca o src mesmo assim (o GET renderiza ao vivo)
        setVer((prev) => ({ ...prev, [n]: v }));
        setPending((p) => ({ ...p, [n]: false }));
        return;
      }
      timers.current[n] = setTimeout(probe, 2000);
    };
    timers.current[n] = setTimeout(probe, 2500);
  }

  async function post(url: string, body: unknown): Promise<{ ok: boolean; v?: string }> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = (await res.json().catch(() => ({}))) as { error?: string; v?: string };
      if (!res.ok) {
        setError(b.error ?? `falha (HTTP ${res.status})`);
        return { ok: false };
      }
      return { ok: true, v: b.v };
    } catch (e) {
      setError(String(e).slice(0, 160));
      return { ok: false };
    }
  }

  async function pick(n: number, c: MediaCandidate) {
    if (pending[n] || sel[n]?.path === c.local_path) return;
    const prev = sel[n];
    setError(null);
    setPending((p) => ({ ...p, [n]: true }));
    setSel((s) => ({ ...s, [n]: { path: c.local_path, placement: c.text_placement } }));
    const r = await post(`/api/media/${storyId}/select?${runQs}`, {
      slide_number: n,
      candidate_id: c.id,
    });
    if (r.ok && r.v) watchRender(n, r.v);
    else {
      setSel((s) => ({ ...s, [n]: prev }));
      setPending((p) => ({ ...p, [n]: false }));
    }
  }

  async function place(n: number, placement: Placement) {
    if (pending[n] || sel[n]?.placement === placement || !sel[n]?.path) return;
    const prev = sel[n];
    setError(null);
    setPending((p) => ({ ...p, [n]: true }));
    setSel((s) => ({ ...s, [n]: { ...s[n], placement } }));
    const r = await post(`/api/media/${storyId}/placement?${runQs}`, {
      slide_number: n,
      placement,
    });
    if (r.ok && r.v) watchRender(n, r.v);
    else {
      setSel((s) => ({ ...s, [n]: prev }));
      setPending((p) => ({ ...p, [n]: false }));
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {slides.map(({ n }) => (
          <div key={n} className="flex flex-col">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/slide/${storyId}/${n}?${runQs}${ver[n] ? `&v=${ver[n]}` : ""}`}
                alt={`Slide ${n}`}
                loading="lazy"
                decoding="async"
                className={`w-full rounded-lg border border-line bg-panel-2 transition-opacity ${
                  pending[n] ? "opacity-60" : ""
                }`}
                style={{ aspectRatio: "1080 / 1350" }}
              />
              {pending[n] && (
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/80 px-3 py-1 font-mono text-[10px] tracking-wide text-white">
                  renderizando…
                </span>
              )}
            </div>
            {sel[n]?.path && (
              <div
                className="flex items-center justify-center gap-1 pt-1"
                title="posição do texto e da sombra neste slide"
              >
                {PLACEMENTS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => place(n, o.value)}
                    disabled={Boolean(pending[n])}
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
                {pending[n] && (
                  <span className="ml-2 text-brand-ink">renderizando…</span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ordered.map((c) => {
                  const isSelected = sel[n]?.path === c.local_path;
                  return (
                    <button
                      key={c.id}
                      onClick={() => pick(n, c)}
                      disabled={Boolean(pending[n])}
                      title={`${c.origin === "bank" ? "banco" : "ChatGPT"} · score ${c.score} (${c.score_notes})\n${c.credit}`}
                      className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                        isSelected
                          ? "border-brand ring-2 ring-brand/30"
                          : "border-line opacity-80 hover:border-ink-3 hover:opacity-100"
                      } ${pending[n] && isSelected ? "animate-pulse" : ""}`}
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
