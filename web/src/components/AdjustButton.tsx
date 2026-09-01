"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const EXEMPLOS = [
  "tom mais leve e direto",
  "foca no impacto para o eleitor",
  "corta o jargão técnico",
  "deixa claro que é alegação",
];

/**
 * "Pedir ajustes": um direcionamento curto reescreve o texto do post.
 * A caixa "aprender para os próximos" propaga a instrução para os próximos
 * posts da vertical (data/learned.json, lido pelo pipeline).
 */
export default function AdjustButton({
  storyId,
  runFile,
  vertical,
  hasImages,
}: {
  storyId: string;
  runFile: string;
  vertical: string;
  hasImages: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [learn, setLearn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function submit() {
    if (instruction.trim().length < 4) {
      setError("descreva o ajuste");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(
        `/api/adjust/${storyId}?run=${encodeURIComponent(runFile)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: instruction.trim(), learn }),
        },
      );
      const raw = await res.text();
      let parsed: { error?: string; headline?: string; learned?: boolean } = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { error: `${res.status} ${res.statusText}` };
      }
      if (!res.ok) {
        setError(parsed.error ?? "falha ao ajustar");
        return;
      }
      setDone(
        `texto reescrito${parsed.learned ? " e direcionamento salvo para os próximos" : ""}`,
      );
      setInstruction("");
      setLearn(false);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(String(e).slice(0, 160));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          className="rounded-full border border-line bg-panel px-4 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:opacity-60"
        >
          {open ? "✕ fechar ajuste" : "✎ Pedir ajustes"}
        </button>
        {done && <span className="font-mono text-[11px] text-brand-ink">{done}</span>}
        {error && !open && <span className="text-[11.5px] text-danger">{error}</span>}
      </div>

      {open && (
        <div className="space-y-2 rounded-xl border border-line bg-panel-2/50 p-3">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="o que mudar no texto? ex.: tom mais leve, foca no impacto prático, tira o jargão…"
            rows={2}
            maxLength={600}
            className="w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {EXEMPLOS.map((ex) => (
              <button
                key={ex}
                onClick={() => setInstruction(ex)}
                className="rounded-full border border-line bg-panel px-2.5 py-1 font-mono text-[10.5px] text-ink-3 hover:border-ink-3 hover:text-ink-2"
              >
                {ex}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              checked={learn}
              onChange={(e) => setLearn(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>
              Aprender para os próximos posts de <b>{vertical}</b>
              <span className="block text-[11.5px] text-ink-3">
                a instrução passa a valer nos próximos runs desta vertical
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-full bg-ink px-4 py-1.5 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-60"
            >
              {busy ? "reescrevendo…" : "reescrever texto"}
            </button>
            <span className="font-mono text-[11px] text-ink-3">
              {hasImages ? "as imagens atuais são mantidas" : "leva ~20s"}
            </span>
            {error && <span className="text-[11.5px] text-danger">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
