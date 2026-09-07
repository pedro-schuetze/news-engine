"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ComposeResult {
  story_id: string;
  run_file: string;
  vertical: string;
  headline: string;
  sources: number;
  problems?: string[];
}

export default function ComposeForm({
  currentRun,
}: {
  currentRun: string;
  /** Retained for the original GPB route; Iris uses one shared editorial tone. */
  verticals?: Record<string, string>;
}) {
  const router = useRouter();
  const [links, setLinks] = useState("");
  const [phase, setPhase] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<"compose" | "discard" | null>(null);
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urls = links
    .split(/[\s,]+/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l));

  async function compose() {
    setBusy("compose");
    setPhase("Lendo as matérias e escrevendo…");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
          instruction: instruction.trim() || undefined,
          format: {},
        }),
      });
      const raw = await res.text();
      let body: ComposeResult & { error?: string };
      try {
        body = JSON.parse(raw);
      } catch {
        body = { error: `${res.status} ${res.statusText}` } as never;
      }
      if (!res.ok) {
        setError(body.error ?? "Não deu para criar o post.");
        return;
      }
      setResult(body);
      setPhase("Texto salvo. Gerando imagens…");
      let failed = false;
      try { const images = await fetch(`/api/media/${body.story_id}?run=${encodeURIComponent(body.run_file)}&mode=ai`, { method: "POST" }); failed = !images.ok; } catch { failed = true; }
      router.push(`/iris/editor?run=${encodeURIComponent(body.run_file)}${failed ? "&notice=images" : ""}`);
    } catch (e) {
      setError(String(e).slice(0, 200));
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    const target = result?.run_file || currentRun;
    if (!target) return;
    setBusy("discard");
    setError(null);
    try {
      const res = await fetch(`/api/compose?run=${encodeURIComponent(target)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        setError(body.error ?? "Não deu para descartar o post.");
        return;
      }
      setResult(null);
      setLinks("");
      router.push("/iris/manual");
    } catch (e) {
      setError(String(e).slice(0, 160));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel p-4 md:p-5">
      <textarea
        aria-label="Links das matérias"
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        rows={3}
        placeholder={"https://g1.globo.com/...\nhttps://folha.uol.com.br/...  (opcional: mais links do mesmo assunto)"}
        className="w-full resize-y rounded-xl border border-line bg-panel-2/40 px-3.5 py-2.5 font-mono text-[12.5px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Direção editorial opcional"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          maxLength={600}
          placeholder="Direção opcional (ex.: foque no impacto para o consumidor)"
          className="min-w-64 flex-1 rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          onClick={compose}
          disabled={busy !== null || urls.length === 0}
          className="rounded-full bg-brand px-5 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-brand-ink disabled:opacity-50"
        >
          {busy === "compose"
            ? phase
            : `Criar post${urls.length > 1 ? ` (${urls.length} links)` : ""}`}
        </button>

        {(result?.run_file || currentRun) && (
          <button
            onClick={discard}
            disabled={busy !== null}
            className="rounded-full border border-danger/50 bg-panel px-4 py-2 text-[13px] font-medium text-danger transition-colors hover:bg-danger-soft disabled:opacity-50"
          >
            {busy === "discard" ? "Descartando…" : "Descartar este post"}
          </button>
        )}

        <span className="font-mono text-[11px] text-ink-3">
          {busy === "compose"
            ? "Aguarde; as imagens são geradas após o texto."
            : urls.length === 0
              ? "Cole pelo menos um link http(s)"
              : `${urls.length} link${urls.length === 1 ? "" : "s"} reconhecido(s)`}
        </span>
      </div>

      {result && (
        <p className="font-mono text-[11.5px] text-brand-ink">
          Texto criado · {result.sources} fonte{result.sources === 1 ? "" : "s"} ·{" "}
          {result.headline}
        </p>
      )}
      {result?.problems?.length ? (
        <p className="text-[11.5px] text-warn">Ignored links: {result.problems.join(" · ")}</p>
      ) : null}
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}
