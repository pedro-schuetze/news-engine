"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PublishButton({ storyId, runId, vertical }: { storyId: string; runId: string; vertical: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function markPublished() {
    setBusy(true);
    const response = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ story_id: storyId, run_id: runId, vertical, review_status: "PUBLISHED" }) });
    setBusy(false);
    if (response.ok) router.refresh();
  }
  return <button onClick={markPublished} disabled={busy} className="rounded-full bg-ink px-3 py-1 font-mono text-[11px] font-medium text-white disabled:opacity-50">{busy ? "Saving…" : "Move to Published"}</button>;
}
