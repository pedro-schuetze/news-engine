"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Removes a post from the publishing queue without deleting its draft. */
export default function RemoveApprovedButton({ storyId, runId, vertical }: { storyId: string; runId: string; vertical: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ story_id: storyId, run_id: runId, vertical, review_status: "REJECTED" }),
    });
    setBusy(false);
    if (response.ok) router.refresh();
  }
  return <button onClick={remove} disabled={busy} title="Tira o post dos Aprovados. O rascunho continua no editor." className="rounded-full border border-danger/40 bg-panel px-3 py-1 font-mono text-[11px] font-medium text-danger hover:bg-danger-soft disabled:opacity-50">{busy ? "Removendo…" : "Remover dos Aprovados"}</button>;
}
