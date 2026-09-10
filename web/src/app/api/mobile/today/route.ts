/**
 * GET /api/mobile/today — a capa do Google News para o app iOS.
 * Leitura pública (como o site); o shape é estável e compacto de propósito:
 * o app não conhece GitHub nem o formato interno dos snapshots.
 */
import { NextResponse } from "next/server";
import { loadAllStories } from "@/lib/data";
import { loadSnapshot } from "@/lib/news";
import { sectionLabelPt } from "@/lib/sections";

export const dynamic = "force-dynamic";

export async function GET() {
  const [snapshot, entries] = await Promise.all([loadSnapshot(), loadAllStories(20)]);
  if (!snapshot) {
    return NextResponse.json({ error: "nenhuma capa coletada ainda" }, { status: 404 });
  }
  // pauta que já virou post não deve reaparecer na capa (risco de gerar em
  // dobro — pedido do Pedro, 2026-09-10). O vínculo é o cluster_id (gn-...).
  const created = new Map<string, { run_file: string; story_id: string }>();
  for (const e of entries) {
    if (e.story.cluster_id?.startsWith("gn-")) {
      created.set(e.story.cluster_id, { run_file: e.runFile, story_id: e.story.story_id });
    }
  }
  return NextResponse.json({
    id: snapshot.id,
    fetched_at: snapshot.fetched_at,
    stories: snapshot.stories.map((s) => ({
      id: s.id,
      title: s.title,
      section: s.section,
      section_label: sectionLabelPt(s.section_label),
      rank: s.rank,
      url: s.url,
      published_at: s.published_at,
      first_seen: s.first_seen,
      is_new: s.is_new,
      rank_change: s.rank_change,
      outlets: (s.outlets ?? []).slice(0, 4).map((o) => ({ name: o.name, domain: o.domain })),
      post: created.get(s.id) ?? null,
    })),
  });
}
