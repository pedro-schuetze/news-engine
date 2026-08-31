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
      body: JSON.stringify({
        story_id: storyId,
        run_id: runId,
        vertical,
        review_status: status,
      }),
    });
    if (!res.ok) {
      setError("Falha ao salvar review");
      return;
    }
    startTransition(() => router.refresh());
  }

  const base =
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => setStatus("APPROVED")}
        className={`${base} ${
          current === "APPROVED"
            ? "bg-emerald-600 text-white"
            : "border border-emerald-700/60 text-emerald-400 hover:bg-emerald-950"
        }`}
      >
        ✓ Aprovar
      </button>
      <button
        disabled={pending}
        onClick={() => setStatus("REJECTED")}
        className={`${base} ${
          current === "REJECTED"
            ? "bg-red-600 text-white"
            : "border border-red-800/60 text-red-400 hover:bg-red-950"
        }`}
      >
        ✕ Rejeitar
      </button>
      <button
        disabled={pending}
        onClick={() => setStatus("PENDING")}
        className={`${base} border border-zinc-700 text-zinc-400 hover:bg-zinc-800`}
      >
        ↺ Pendente
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
