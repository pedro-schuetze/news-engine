import { NextResponse } from "next/server";
import { dataSource } from "@/lib/data";
import { NEWS_ID, sameOrigin } from "@/lib/news";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { story_id?: string; skipped?: boolean };
  if (!NEWS_ID.test(body.story_id ?? "") || typeof body.skipped !== "boolean") return NextResponse.json({ error: "invalid decision" }, { status: 400 });
  const decision = { id: body.story_id, skipped: body.skipped, updated_at: new Date().toISOString() };
  await dataSource().writeTextFile(`data/news/decisions/${decision.id}.json`, JSON.stringify(decision, null, 2), `news: ${decision.skipped ? "skip" : "restore"} ${decision.id}`);
  return NextResponse.json(decision);
}
