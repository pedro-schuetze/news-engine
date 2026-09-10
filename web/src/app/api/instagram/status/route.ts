/** GET /api/instagram/status — o app/site descobrem se a publicação direta
 * está disponível e quando foi o último sync. Leitura pública e barata. */
import { NextResponse } from "next/server";
import { igConfigured, loadIgSync } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export async function GET() {
  const sync = igConfigured() ? await loadIgSync() : null;
  return NextResponse.json({
    connected: igConfigured(),
    synced_at: sync?.synced_at ?? null,
    tracked_posts: sync ? Object.keys(sync.posts).length : 0,
  });
}
