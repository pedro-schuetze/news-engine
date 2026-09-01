"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareForUpload } from "@/lib/media/clientImage";

interface ApiResult {
  slides: number;
  from_bank?: number;
  from_ai?: number;
  estimated_cost_usd?: number;
  seconds?: number;
  problems?: string[];
}

/**
 * Duas formas de conseguir as imagens de um post:
 *   1. pela API (banco + IA), no clique;
 *   2. copiando o briefing para o ChatGPT (skill news-engine-carousel) e
 *      subindo os arquivos de volta.
 */
/** O runtime pode responder texto puro (413, 504) — não assuma JSON. */
async function readResponse(res: Response): Promise<{ ok: boolean; body: ApiResult & { error?: string; problems?: string[] } }> {
  const raw = await res.text();
  try {
    return { ok: res.ok, body: JSON.parse(raw) };
  } catch {
    const hint =
      res.status === 413
        ? "as imagens ficaram grandes demais para o envio"
        : `${res.status} ${res.statusText || "erro no servidor"}`;
    return { ok: false, body: { slides: 0, error: hint } as never };
  }
}

export default function ImageActions({
  storyId,
  runFile,
  slideCount,
  hasImages,
  briefing,
}: {
  storyId: string;
  runFile: string;
  slideCount: number;
  hasImages: boolean;
  briefing: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"api" | "upload" | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prep, setPrep] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();

  const runQs = `run=${encodeURIComponent(runFile)}`;

  async function generateViaApi() {
    setBusy("api");
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/media/${storyId}?${runQs}`, { method: "POST" });
      const { ok, body } = await readResponse(res);
      if (!ok) {
        setError(body.error ?? `falha (HTTP ${res.status})`);
        return;
      }
      setResult(body);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(String(e).slice(0, 160));
    } finally {
      setBusy(null);
    }
  }

  async function copyBriefing() {
    try {
      await navigator.clipboard.writeText(briefing);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("não consegui acessar a área de transferência");
    }
  }

  async function upload(files: FileList) {
    setBusy("upload");
    setError(null);
    setResult(null);
    setPrep(null);
    const chosen = Array.from(files).slice(0, slideCount);
    try {
      // PNG do ChatGPT tem 1,5-3MB; convertido para JPEG 1080x1350 cabe no envio
      setPrep(`convertendo ${chosen.length} imagens…`);
      const prepared = await Promise.all(chosen.map((f) => prepareForUpload(f)));
      const totalOriginal = prepared.reduce((s, p) => s + p.originalKB, 0);
      const totalFinal = prepared.reduce((s, p) => s + p.finalKB, 0);
      setPrep(`${Math.round(totalOriginal / 1024)}MB → ${Math.round(totalFinal / 1024 * 10) / 10}MB`);

      const form = new FormData();
      // ordem dos arquivos = ordem dos slides
      prepared.forEach((p, i) => form.append(`slide_${i + 1}`, p.file));

      const res = await fetch(`/api/media/${storyId}/upload?${runQs}`, {
        method: "POST",
        body: form,
      });
      const { ok, body } = await readResponse(res);
      if (!ok) {
        setError([body.error, ...(body.problems ?? [])].filter(Boolean).join(" · ").slice(0, 240));
        return;
      }
      setResult(body);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(String(e).slice(0, 200));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const pill = "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-60";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={generateViaApi}
          disabled={busy !== null}
          className={`${pill} ${
            hasImages
              ? "border border-line bg-panel text-ink-2 hover:border-ink-3 hover:text-ink"
              : "bg-ink text-white hover:bg-navy"
          }`}
        >
          {busy === "api"
            ? `gerando ${slideCount} imagens…`
            : hasImages
              ? "↻ Regerar via API"
              : `✦ Gerar ${slideCount} imagens (API)`}
        </button>

        <button
          onClick={copyBriefing}
          disabled={busy !== null}
          className={`${pill} border ${
            copied
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-line bg-panel text-ink-2 hover:border-ink-3 hover:text-ink"
          }`}
          title="Cole no ChatGPT com a skill news-engine-carousel instalada"
        >
          {copied ? "✓ briefing copiado" : "⧉ Copiar prompt do ChatGPT"}
        </button>

        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null}
          className={`${pill} border border-line bg-panel text-ink-2 hover:border-ink-3 hover:text-ink`}
          title={`Selecione as ${slideCount} imagens na ordem dos slides`}
        >
          {busy === "upload" ? "convertendo e enviando…" : "↑ Subir imagens do ChatGPT"}
        </button>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
        {busy === "api" && (
          <span className="text-ink-3">leva ~40s (as {slideCount} rodam em paralelo)</span>
        )}
        {prep && <span className="text-ink-3">{prep}</span>}
        {refreshing && busy === null && <span className="text-ink-3">atualizando prévia…</span>}
        {result && busy === null && (
          <span className="text-brand-ink">
            {result.slides} imagens
            {result.from_bank !== undefined && ` · ${result.from_bank} do banco`}
            {result.from_ai !== undefined && ` · ${result.from_ai} por IA`}
            {result.estimated_cost_usd !== undefined &&
              ` · US$ ${result.estimated_cost_usd.toFixed(3)}`}
            {result.seconds !== undefined && ` · ${result.seconds}s`}
          </span>
        )}
        {copied && (
          <span className="text-ink-3">
            cole no ChatGPT; depois volte e use &quot;subir imagens&quot; na ordem dos slides
          </span>
        )}
        {error && <span className="max-w-lg text-danger">{error}</span>}
      </div>
    </div>
  );
}
