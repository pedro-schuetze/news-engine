import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { DATA_MODE } from "@/lib/data";
import { loadSnapshot, readNewsJson, sameOrigin } from "@/lib/news";

export const dynamic = "force-dynamic";
export const maxDuration = 150;
const workflow = "frontpage-snapshots.yml";
let localJob: Promise<unknown> | null = null;

async function github(endpoint: string, init?: RequestInit) {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("Configure GITHUB_TOKEN com acesso a Actions para atualizar notícias.");
  const repo = process.env.NEWS_GITHUB_REPO?.trim() || "pedro-schuetze/news-engine";
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/${endpoint}`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`GitHub Actions respondeu ${response.status}. Verifique o acesso de Actions do token da Vercel.`);
  return response.status === 204 ? null : response.json();
}

async function state() {
  const [snapshot, attempt] = await Promise.all([loadSnapshot(), readNewsJson<{ ok: boolean; attempted_at: string; error?: string }>("status.json")]);
  const branch = process.env.NEWS_GITHUB_BRANCH?.trim() || "main";
  const runs = DATA_MODE === "github" ? (await github(`workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&per_page=5`)).workflow_runs as { id: number; status: string; conclusion: string | null; html_url: string; created_at: string }[] : [];
  const active = runs.find(r => r.status !== "completed");
  const latestRun = active || runs[0];
  const run = latestRun ? { id: latestRun.id, status: latestRun.status, conclusion: latestRun.conclusion, html_url: latestRun.html_url, created_at: latestRun.created_at } : null;
  return { snapshot_id: snapshot?.id, fetched_at: snapshot?.fetched_at, attempt, active: Boolean(active || localJob), run };
}

export async function GET() {
  try { return NextResponse.json(await state()); }
  catch (error) { return NextResponse.json({ error: String(error).replace(/^Error:\s*/, "") }, { status: 502 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  try {
    const current = await state();
    if (current.active) return NextResponse.json({ ...current, message: "Já há uma coleta em andamento." }, { status: 202 });
    if (current.fetched_at && Date.now() - Date.parse(current.fetched_at) < 60_000) return NextResponse.json({ ...current, message: "Notícias atualizadas há menos de um minuto." });
    if (DATA_MODE === "fs") {
      localJob = promisify(execFile)(process.env.NEWS_PYTHON || "python3", ["-m", "src.frontpage", "--data-dir", process.env.NEWS_DATA_DIR || "data", "--force"], { cwd: path.resolve(process.cwd(), ".."), timeout: 120_000 });
      try { await localJob; } finally { localJob = null; }
      return NextResponse.json({ ...(await state()), message: "Notícias atualizadas." });
    }
    await github(`workflows/${workflow}/dispatches`, { method: "POST", body: JSON.stringify({ ref: process.env.NEWS_GITHUB_BRANCH?.trim() || "main", inputs: { force: true } }) });
    return NextResponse.json({ ...current, active: true, message: "Coleta solicitada ao GitHub. Aguardando execução…" }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: String(error).replace(/^Error:\s*/, "").slice(0, 400) }, { status: 502 }); }
}
