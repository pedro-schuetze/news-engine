"use client";
import { useState } from "react";

export default function HistoryStoryAction({ snapshotId, storyId }: { snapshotId: string; storyId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function createPost() { window.location.href = "/iris/editor?snapshot=" + snapshotId + "&story=" + storyId; return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/news/drafts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot_id: snapshotId, story_id: storyId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not create the post.");
      if (body.run_file) window.location.href = `/iris/manual?run=${encodeURIComponent(body.run_file)}`;
    } catch (e: any) {
      setError(e instanceof Error ? e.message : "Could not create the post.");
      setBusy(false);
    }
  }
  return <div className="mt-2 flex items-center gap-2">
    <button type="button" onClick={createPost} disabled={busy} title="Generate a post from this historical story and open it in the editor" className="rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
      {busy ? "Creating…" : "Create post from this story"}
    </button>
    {error && <span className="text-[11px] text-rose-600">{error}</span>}
  </div>;
}
