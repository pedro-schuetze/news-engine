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
  verticals,
  currentRun,
}: {
  verticals: Record<string, string>;
  currentRun: string;
}) {
  const router = useRouter();
  const [links, setLinks] = useState("");
  const [instruction, setInstruction] = useState("");
  const [vertical, setVertical] = useState("");
  // formato do post — defaults = comportamento padrão dos prompts
  const [slideCount, setSlideCount] = useState(5);
  const [slideLength, setSlideLength] = useState("");
  const [captionDepth, setCaptionDepth] = useState("");
  const [audience, setAudience] = useState("");
  const [emojis, setEmojis] = useState(false);
  const [busy, setBusy] = useState<"compose" | "discard" | null>(null);
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urls = links
    .split(/[\s,]+/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l));

  async function compose() {
    setBusy("compose");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
          instruction: instruction.trim() || undefined,
          vertical: vertical || undefined,
          format: {
            slideCount,
            slideLength: slideLength || undefined,
            captionDepth: captionDepth || undefined,
            audience: audience || undefined,
            emojis: emojis || undefined,
          },
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
        setError(body.error ?? "falha ao gerar");
        return;
      }
      setResult(body);
      router.push(`/gerar?run=${encodeURIComponent(body.run_file)}`);
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
        setError(body.error ?? "falha ao descartar");
        return;
      }
      setResult(null);
      setLinks("");
      router.push("/gerar");
    } catch (e) {
      setError(String(e).slice(0, 160));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel p-4 md:p-5">
      <textarea
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        rows={3}
        placeholder={"https://g1.globo.com/...\nhttps://folha.uol.com.br/...  (opcional: mais links do mesmo assunto)"}
        className="w-full resize-y rounded-xl border border-line bg-panel-2/40 px-3.5 py-2.5 font-mono text-[12.5px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] text-ink-2"
        >
          <option value="">vertical: deixar o modelo decidir</option>
          {Object.entries(verticals).map(([vid, name]) => (
            <option key={vid} value={vid}>
              vertical: {name}
            </option>
          ))}
        </select>

        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          maxLength={600}
          placeholder="direcionamento opcional (ex.: foca no impacto para o consumidor)"
          className="min-w-64 flex-1 rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={slideCount}
          onChange={(e) => setSlideCount(Number(e.target.value))}
          className="rounded-full border border-line bg-panel px-3 py-1.5 text-[12.5px] text-ink-2"
        >
          {[3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n} slides{n === 5 ? " (padrão)" : ""}
            </option>
          ))}
        </select>

        <select
          value={slideLength}
          onChange={(e) => setSlideLength(e.target.value)}
          className="rounded-full border border-line bg-panel px-3 py-1.5 text-[12.5px] text-ink-2"
        >
          <option value="">texto por slide: padrão</option>
          <option value="curto">texto por slide: mais curto</option>
          <option value="detalhado">texto por slide: mais detalhado</option>
        </select>

        <select
          value={captionDepth}
          onChange={(e) => setCaptionDepth(e.target.value)}
          className="rounded-full border border-line bg-panel px-3 py-1.5 text-[12.5px] text-ink-2"
        >
          <option value="">legenda: padrão (~140 palavras)</option>
          <option value="curta">legenda: curta (50-80)</option>
          <option value="aprofundada">legenda: aprofundada (200-260)</option>
        </select>

        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className="rounded-full border border-line bg-panel px-3 py-1.5 text-[12.5px] text-ink-2"
        >
          <option value="">leitor: explicar do zero</option>
          <option value="acompanha">leitor: já acompanha o assunto</option>
        </select>

        <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-[12.5px] text-ink-2">
          <input
            type="checkbox"
            checked={emojis}
            onChange={(e) => setEmojis(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand"
          />
          emojis na legenda
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          onClick={compose}
          disabled={busy !== null || urls.length === 0}
          className="rounded-full bg-brand px-5 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-brand-ink disabled:opacity-50"
        >
          {busy === "compose"
            ? "lendo a notícia e escrevendo…"
            : `✦ Gerar post${urls.length > 1 ? ` (${urls.length} links)` : ""}`}
        </button>

        {(result?.run_file || currentRun) && (
          <button
            onClick={discard}
            disabled={busy !== null}
            className="rounded-full border border-danger/50 bg-panel px-4 py-2 text-[13px] font-medium text-danger transition-colors hover:bg-danger-soft disabled:opacity-50"
          >
            {busy === "discard" ? "descartando…" : "✕ Descartar este post"}
          </button>
        )}

        <span className="font-mono text-[11px] text-ink-3">
          {busy === "compose"
            ? "leva ~20-40s"
            : urls.length === 0
              ? "cole ao menos um link http(s)"
              : `${urls.length} link(s) reconhecido(s)`}
        </span>
      </div>

      {result && (
        <p className="font-mono text-[11.5px] text-brand-ink">
          gerado em {verticals[result.vertical] ?? result.vertical} · {result.sources} fonte(s) ·{" "}
          {result.headline}
        </p>
      )}
      {result?.problems?.length ? (
        <p className="text-[11.5px] text-warn">links ignorados: {result.problems.join(" · ")}</p>
      ) : null}
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}
