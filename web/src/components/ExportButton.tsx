"use client";

import { useState } from "react";

/**
 * Baixa o pacote do post (slides em JPG + legenda.txt). A renderização dos
 * slides leva alguns segundos, então o estado de espera é explícito.
 */
export default function ExportButton({
  storyId,
  runFile,
  slideCount,
  disabled = false,
}: {
  storyId: string;
  runFile: string;
  slideCount: number;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/export/${storyId}?run=${encodeURIComponent(runFile)}`,
      );
      if (!res.ok) {
        const raw = await res.text();
        let message = `${res.status} ${res.statusText}`;
        try {
          message = (JSON.parse(raw) as { error?: string }).error ?? message;
        } catch {
          /* resposta não-JSON: mantém status */
        }
        setError(message);
        return;
      }
      const blob = await res.blob();
      const name =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `${storyId}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e).slice(0, 140));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={download}
        disabled={busy || disabled}
        title={disabled ? "gere as imagens do post primeiro" : undefined}
        className="rounded-full bg-brand px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-ink disabled:opacity-45"
      >
        {busy ? `montando ${slideCount} JPGs…` : "↓ Baixar post (.zip)"}
      </button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </span>
  );
}
