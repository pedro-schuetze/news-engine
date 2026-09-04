"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * "Gerar conteúdo": transforma o brief (manchete+resumo do run automático) no
 * pacote completo — slides com direções de imagem, caption, hashtags — usando
 * o modelo bom. Só custa quando o editor decide que o post vale a pena.
 */
export default function GenerateContentButton({
  storyId,
  runFile,
}: {
  storyId: string;
  runFile: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/generate/${storyId}?run=${encodeURIComponent(runFile)}`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `falha (HTTP ${res.status})`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(String(e).slice(0, 160));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={generate}
        disabled={busy}
        className="rounded-full bg-brand px-5 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-brand-ink disabled:opacity-60"
      >
        {busy ? "escrevendo o post completo…" : "✦ Gerar conteúdo"}
      </button>
      <span className="font-mono text-[11px] text-ink-3">
        {busy
          ? "leva ~30-60s"
          : "escreve slides, direções de imagem e legenda (só para este post)"}
      </span>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </div>
  );
}
