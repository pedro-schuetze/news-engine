"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReviewStatus } from "@/lib/types";

export default function ReviewButtons({
  storyId,
  runId,
  vertical,
  current,
}: {
  storyId: string;
  runId: string;
  vertical: string;
  current: ReviewStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: ReviewStatus) {
    setError(null);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story_id: storyId, run_id: runId, vertical, review_status: status }),
    });
    if (!res.ok) {
      setError("Falha ao salvar review");
      return;
    }
    startTransition(() => router.refresh());
  }

  const base =
    "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() => setStatus("APPROVED")}
        className={`${base} ${
          current === "APPROVED"
            ? "bg-brand text-white"
            : "border border-line bg-panel text-brand-ink hover:border-brand hover:bg-brand-soft"
        }`}
      >
        ✓ Aprovar
      </button>
      <button
        disabled={pending}
        onClick={() => setStatus("REJECTED")}
        className={`${base} ${
          current === "REJECTED"
            ? "bg-danger text-white"
            : "border border-line bg-panel text-danger hover:border-danger hover:bg-danger-soft"
        }`}
      >
        ✕ Rejeitar
      </button>
      <button
        disabled={pending}
        onClick={() => setStatus("PENDING")}
        className={`${base} border border-transparent text-ink-3 hover:bg-panel-2 hover:text-ink-2`}
      >
        ↺ Pendente
      </button>
      {pending && <span className="font-mono text-[11px] text-ink-3">salvando…</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
