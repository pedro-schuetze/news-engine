"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PublishButton({ storyId, runId, vertical }: { storyId: string; runId: string; vertical: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function markPublished() {
    setBusy(true); setError("");
    try {
    const response = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ story_id: storyId, run_id: runId, vertical, review_status: "PUBLISHED" }) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Não foi possível salvar."); }
    router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha de conexão. Tente novamente."); } finally { setBusy(false); }
  }
  return <><button onClick={markPublished} disabled={busy} className="rounded-full bg-ink px-3 py-1 font-mono text-[11px] font-medium text-white disabled:opacity-50">{busy ? "Salvando…" : "Marcar como publicado"}</button>{error && <span role="alert" className="text-xs text-danger">{error}</span>}</>;
}
