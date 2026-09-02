"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const OPTIONS: { value: "TOP" | "CENTER" | "BOTTOM"; label: string; title: string }[] = [
  { value: "TOP", label: "▔", title: "texto no topo" },
  { value: "CENTER", label: "▬", title: "texto no meio" },
  { value: "BOTTOM", label: "▁", title: "texto na base" },
];

/**
 * Grid topo/meio/base sob cada slide (proposta do Pedro): a análise
 * automática sugere, o clique do editor decide. O preview re-renderiza na
 * hora com o texto e a sombra na faixa escolhida.
 */
export default function PlacementPicker({
  storyId,
  runFile,
  slideNumber,
  current,
}: {
  storyId: string;
  runFile: string;
  slideNumber: number;
  current: "TOP" | "CENTER" | "BOTTOM";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, startTransition] = useTransition();

  async function set(placement: "TOP" | "CENTER" | "BOTTOM") {
    if (placement === current) return;
    setBusy(placement);
    setError(false);
    try {
      const res = await fetch(
        `/api/media/${storyId}/placement?run=${encodeURIComponent(runFile)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slide_number: slideNumber, placement }),
        },
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  const dim = busy !== null || refreshing;
  return (
    <div
      className={`flex items-center justify-center gap-1 pt-1 ${dim ? "opacity-50" : ""}`}
      title="posição do texto e da sombra neste slide"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => set(o.value)}
          disabled={dim}
          title={o.title}
          className={`h-6 w-8 rounded-md border text-[11px] leading-none transition-colors ${
            current === o.value
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-line bg-panel text-ink-3 hover:border-ink-3 hover:text-ink"
          } ${busy === o.value ? "animate-pulse" : ""}`}
        >
          {o.label}
        </button>
      ))}
      {error && <span className="text-[10px] text-danger">falhou</span>}
    </div>
  );
}
