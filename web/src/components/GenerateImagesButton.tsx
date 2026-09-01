"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Result {
  slides: number;
  from_bank: number;
  from_ai: number;
  estimated_cost_usd: number;
  seconds: number;
}

export default function GenerateImagesButton({
  storyId,
  runFile,
  slideCount,
  hasImages,
}: {
  storyId: string;
  runFile: string;
  slideCount: number;
  hasImages: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/media/${storyId}?run=${encodeURIComponent(runFile)}`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `falha (HTTP ${res.status})`);
        return;
      }
      setResult(body as Result);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(String(e).slice(0, 160));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        onClick={generate}
        disabled={busy}
        className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-60 ${
          hasImages
            ? "border border-line bg-panel text-ink-2 hover:border-ink-3 hover:text-ink"
            : "bg-ink text-white hover:bg-navy"
        }`}
      >
        {busy
          ? `gerando ${slideCount} imagens…`
          : hasImages
            ? "↻ Regerar imagens"
            : `✦ Gerar ${slideCount} imagens`}
      </button>

      {busy && (
        <span className="font-mono text-[11px] text-ink-3">
          leva ~40-60s (as {slideCount} rodam em paralelo)
        </span>
      )}
      {refreshing && !busy && (
        <span className="font-mono text-[11px] text-ink-3">atualizando prévia…</span>
      )}
      {result && !busy && (
        <span className="font-mono text-[11px] text-brand-ink">
          {result.slides} imagens · {result.from_bank} do banco · {result.from_ai} por IA ·
          US$ {result.estimated_cost_usd.toFixed(3)} · {result.seconds}s
        </span>
      )}
      {error && <span className="max-w-md text-[11.5px] text-danger">{error}</span>}
    </div>
  );
}
