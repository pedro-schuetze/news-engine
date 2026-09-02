/**
 * GET /api/media/{story_id}/candidate/{id}?run={file|latest}&w=240
 * Serve a imagem de uma candidata do pool (miniatura opcional via ?w=).
 * O caminho vem SEMPRE do pool do run — nunca da query — então não há
 * travessia de caminho possível.
 */

import { NextResponse } from "next/server";
import jpeg from "jpeg-js";
import { loadMedia, loadRun } from "@/lib/data";
import { findStory } from "@/lib/media/persist";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function downscaleJpeg(bytes: Buffer, targetW: number): Buffer | null {
  try {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    if (img.width <= targetW) return null;
    const scale = targetW / img.width;
    const w = targetW;
    const h = Math.max(1, Math.round(img.height * scale));
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(img.height - 1, Math.round(y / scale));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(img.width - 1, Math.round(x / scale));
        const si = (sy * img.width + sx) * 4;
        const di = (y * w + x) * 4;
        out[di] = img.data[si];
        out[di + 1] = img.data[si + 1];
        out[di + 2] = img.data[si + 2];
        out[di + 3] = 255;
      }
    }
    return Buffer.from(jpeg.encode({ data: out, width: w, height: h }, 62).data);
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ story: string; id: string }> },
) {
  const { story: storyId, id } = await params;
  const url = new URL(request.url);
  const runFile = url.searchParams.get("run") ?? "latest";
  const w = Number(url.searchParams.get("w") ?? "0");

  if (!/^[\w-]+$/.test(storyId) || !/^[\w.-]+$/.test(id)) {
    return NextResponse.json({ error: "parâmetros inválidos" }, { status: 400 });
  }

  const run = await loadRun(runFile);
  const story = run ? findStory(run, storyId) : null;
  const candidate = (story?.media_pool ?? []).find((c) => c.id === id);
  if (!candidate) {
    return NextResponse.json({ error: "candidata não encontrada" }, { status: 404 });
  }

  const dataUrl = await loadMedia(candidate.local_path);
  if (!dataUrl) return NextResponse.json({ error: "arquivo indisponível" }, { status: 404 });
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  let bytes: Buffer = Buffer.from(base64, "base64");
  let mime = candidate.mime_type;

  if (w >= 80 && w <= 800 && mime === "image/jpeg") {
    const small = downscaleJpeg(bytes, w);
    if (small) {
      bytes = small;
      mime = "image/jpeg";
    }
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      // pool é imutável por id — pode cachear à vontade
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
