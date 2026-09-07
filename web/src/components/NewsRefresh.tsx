"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewsRefresh({ snapshotId }: { snapshotId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const started = useRef(0);
  const baseline = useRef(snapshotId);
  const initialRun = useRef<number | null>(null);
  useEffect(() => {
    if (!watching) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch("/api/news/refresh", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.snapshot_id && data.snapshot_id !== baseline.current) {
          setWatching(false); setBusy(false); setMessage("Notícias atualizadas. A nova rodada está no histórico."); router.refresh(); return;
        }
        if (data.run?.id !== initialRun.current && data.run?.status === "completed" && data.run?.conclusion !== "success") throw new Error("A coleta falhou. Consulte os detalhes no Painel e tente novamente.");
        if (Date.now() - started.current > 180_000) {
          setWatching(false); setBusy(false); setMessage("O GitHub ainda não publicou uma nova rodada. Acompanhe a execução no Painel."); return;
        }
        timer = setTimeout(poll, 6000);
      } catch (e) {
        if (controller.signal.aborted) return;
        setWatching(false); setBusy(false); setError(true); setMessage(e instanceof Error ? e.message : "Não foi possível acompanhar a coleta.");
      }
    };
    timer = setTimeout(poll, 6000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [watching, router]);

  async function refresh() {
    if (busy) return;
    setError(false); setMessage("Solicitando nova coleta…"); baseline.current = snapshotId; initialRun.current = null; started.current = Date.now(); setBusy(true);
    try {
      const response = await fetch("/api/news/refresh", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao atualizar notícias.");
      initialRun.current = data.run?.status === "completed" ? data.run.id : null;
      setMessage(data.message);
      setWatching(Boolean(data.active));
      if (!data.active) { setBusy(false); router.refresh(); }
    } catch (e) { setWatching(false); setBusy(false); setError(true); setMessage(e instanceof Error ? e.message : "Falha ao atualizar notícias."); }
  }
  return <div className="news-refresh"><button className="iris-button" onClick={refresh} disabled={busy}><span aria-hidden="true" className={busy ? "animate-spin" : ""}>↻</span> {busy ? "Atualizando…" : "Atualizar notícias"}</button><p role="status" className={`mt-2 max-w-sm text-xs ${error ? "text-danger" : "text-ink-2"}`}>{message || "Coleta agendada a cada 3 horas. Sem gerar posts."}</p></div>;
}
