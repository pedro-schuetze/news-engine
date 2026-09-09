/**
 * GET /api/mobile/today — a capa do Google News para o app iOS.
 * Leitura pública (como o site); o shape é estável e compacto de propósito:
 * o app não conhece GitHub nem o formato interno dos snapshots.
 */
import { NextResponse } from "next/server";
import { loadSnapshot } from "@/lib/news";
import { sectionLabelPt } from "@/lib/sections";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadSnapshot();
  if (!snapshot) {
    return NextResponse.json({ error: "nenhuma capa coletada ainda" }, { status: 404 });
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
    })),
  });
}
