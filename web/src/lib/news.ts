import latest from "../../../data/news/latest.json";
import { dataSource } from "./data";

export type FrontPageStory = (typeof latest.stories)[number];
export type FrontPageSnapshot = typeof latest;
export type NewsStory = FrontPageStory;
export type NewsSnapshot = FrontPageSnapshot;
export type SnapshotRun = { id: string; fetched_at: string; stats: { stories: number; new: number; retained: number; departed: number; llm_calls?: number; cost_usd?: number; duration_seconds?: number }; warnings?: string[]; layout?: string };

export function loadLatestNews(): FrontPageSnapshot {
  return latest;
}

export function groupNewsBySection(stories: FrontPageStory[]) {
  return stories.reduce<Record<string, FrontPageStory[]>>((groups, story) => {
    (groups[story.section_label] ??= []).push(story);
    return groups;
  }, {});
}

export const NEWS_ID = /^gn-[a-f0-9]{24}$/;
export const SNAPSHOT_ID = /^\d{8}T\d{12}Z$/;
export async function readNewsJson<T>(file: string): Promise<T | null> {
  const text = await dataSource().readTextFile(`data/news/${file}`);
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}
export async function loadSnapshot(id?: string) {
  if (!id) return readNewsJson<FrontPageSnapshot>("latest.json");
  if (!SNAPSHOT_ID.test(id)) return null;
  return readNewsJson<FrontPageSnapshot>(`archive/${id.slice(0,4)}-${id.slice(4,6)}/${id}.json`);
}
export async function loadSnapshotRuns(): Promise<SnapshotRun[]> {
  const months = await readNewsJson<string[]>("months.json") ?? [];
  const files = await Promise.all(months.map((month) => readNewsJson<SnapshotRun[]>(`indexes/${month}.json`)));
  return files.flatMap((runs) => runs ?? []).sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
