"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MediaCandidate } from "@/lib/types";

/**
 * Seletor de imagem por slide: as candidatas do pool (banco + uploads do
 * ChatGPT) aparecem como miniaturas; a pré-seleção é por score (código), e o
 * editor troca com um clique. Trocar não grava bytes — só aponta o slide para
 * outra candidata.
 */
export default function SlidePicker({
  storyId,
  runFile,
  slides,
  pool,
  selectedPaths,
}: {
  storyId: string;
  runFile: string;
  slides: { n: number; label: string }[];
  pool: MediaCandidate[];
  /** slide_number -> local_path da imagem atualmente escolhida */
  selectedPaths: Record<number, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // `${slide}:${id}`
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (pool.length === 0) return null;
  const runQs = `run=${encodeURIComponent(runFile)}`;
  const ordered = [...pool].sort((a, b) => b.score - a.score);

  async function pick(slideNumber: number, candidateId: string) {
    setBusy(`${slideNumber}:${candidateId}`);
    setError(null);
    try {
      const res = await fetch(`/api/media/${storyId}/select?${runQs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide_number: slideNumber, candidate_id: candidateId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `falha (HTTP ${res.status})`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(String(e).slice(0, 160));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
        escolher imagem por slide · {pool.length} candidatas (banco + uploads) · pré-seleção por
        score
      </p>
      {slides.map(({ n, label }) => (
        <div key={n} className="space-y-1">
          <p className="font-mono text-[10.5px] text-ink-3">
            slide {n} · {label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ordered.map((c) => {
              const isSelected = selectedPaths[n] === c.local_path;
              const isBusy = busy === `${n}:${c.id}`;
              return (
                <button
                  key={c.id}
                  onClick={() => !isSelected && pick(n, c.id)}
                  disabled={busy !== null}
                  title={`${c.origin === "bank" ? "banco" : "ChatGPT"} · score ${c.score} (${c.score_notes})\n${c.credit}`}
                  className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                    isSelected
                      ? "border-brand ring-2 ring-brand/30"
                      : "border-line opacity-80 hover:border-ink-3 hover:opacity-100"
                  } ${isBusy ? "animate-pulse" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/${storyId}/candidate/${c.id}?${runQs}&w=240`}
                    alt={c.credit}
                    width={76}
                    height={95}
                    loading="lazy"
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
      {error && <p className="text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}
