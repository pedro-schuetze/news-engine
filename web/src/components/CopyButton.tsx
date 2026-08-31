"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard indisponível: ignora */
    }
  }

  return (
    <button
      onClick={copy}
      className={`rounded-full border px-3 py-1 font-mono text-[11px] font-medium transition-colors ${
        copied
          ? "border-brand bg-brand-soft text-brand-ink"
          : "border-line bg-panel text-ink-2 hover:border-ink-3 hover:text-ink"
      }`}
    >
      {copied ? "✓ copiado" : label}
    </button>
  );
}
