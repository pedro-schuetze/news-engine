"use client";

import { useRouter } from "next/navigation";
import type { RunListItem } from "@/lib/types";

export default function RunSelector({
  runs,
  current,
  tab,
  debug,
}: {
  runs: RunListItem[];
  current: string;
  tab: string;
  debug: boolean;
}) {
  const router = useRouter();

  function navigate(run: string, nextDebug: boolean) {
    const params = new URLSearchParams();
    if (run !== "latest") params.set("run", run);
    if (tab) params.set("tab", tab);
    if (nextDebug) params.set("debug", "1");
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
        value={current}
        onChange={(e) => navigate(e.target.value, debug)}
      >
        <option value="latest">último run (latest.json)</option>
        {runs.map((r) => (
          <option key={r.file} value={r.file}>
            {r.label}
          </option>
        ))}
      </select>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
        <input
          type="checkbox"
          checked={debug}
          onChange={(e) => navigate(current, e.target.checked)}
          className="h-4 w-4 accent-violet-500"
        />
        Mostrar pipeline/debug
      </label>
      <button
        onClick={() => router.refresh()}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
      >
        Recarregar
      </button>
    </div>
  );
}
