"use client";

import { useState } from "react";

interface PromptConfig {
  overrides: { text: string; image: string };
  text: { system: string; rules: string; context: string };
  image: { template: string; context: string };
}

export default function PromptSettings() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<PromptConfig | null>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setOpen((value) => !value);
    if (config) return;
    setError(null);
    try {
      const response = await fetch("/api/config/prompts", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não deu para carregar os prompts.");
      setConfig(body as PromptConfig);
      setText(body.overrides?.text ?? "");
      setImage(body.overrides?.image ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não deu para carregar os prompts.");
    }
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/config/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, image }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não deu para salvar os prompts.");
      setMessage("Prompts salvos.");
      setConfig((current) => current ? { ...current, overrides: { text, image } } : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não deu para salvar os prompts.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-slate-50"
      >
        {open ? "Fechar prompts" : "Prompts"}
      </button>
      {open && (
        <section className="absolute right-0 top-[calc(100%+10px)] z-30 w-[min(92vw,760px)] rounded-2xl border border-line bg-white p-5 text-left shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-ink">Prompts de geração</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                The base prompt stays structured. Your custom instructions are appended and apply to future text and image generations.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-lg leading-none text-ink-3 hover:text-ink-2" aria-label="Fechar prompts">×</button>
          </div>
          {config ? (
            <div className="mt-4 space-y-4">
              <details className="rounded-xl border border-line bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-ink-2">Prompt base de texto</summary>
                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-2">{config.text.system}\n\n{config.text.rules}\n\n{config.text.context}</pre>
              </details>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-2">Instruções extras de texto</span>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Ex.: mantenha o tom direto e evite adjetivos." className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
              </label>
              <details className="rounded-xl border border-line bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-ink-2">Prompt base de imagem</summary>
                <pre className="mt-3 whitespace-pre-wrap text-[11px] leading-relaxed text-ink-2">{config.image.template}\n\n{config.image.context}</pre>
              </details>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-2">Instruções extras de imagem</span>
                <textarea value={image} onChange={(e) => setImage(e.target.value)} rows={4} placeholder="Ex.: luz natural e enquadramento documental." className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className={`text-xs ${error ? "text-rose-600" : "text-emerald-700"}`}>{error || message || ""}</span>
                <button type="button" onClick={() => void save()} disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-brand disabled:opacity-50">{busy ? "Salvando…" : "Salvar prompts"}</button>
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm text-ink-2">{error || "Carregando prompts…"}</p>
          )}
        </section>
      )}
    </div>
  );
}
